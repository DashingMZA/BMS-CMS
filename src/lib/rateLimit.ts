// A very small per-IP throttle for the endpoints anyone can POST to.
//
// Written twice already — once in the comment route and once in the form
// handler, with different window sizes and the same sweep logic copied by hand.
// A third caller (the 404 logger) had none at all, which is how a public write
// endpoint ends up with an unbounded table behind it. One implementation, three
// callers, each naming its own limits.
//
// In-memory means per instance rather than global. That is the right trade
// here: it costs nothing, needs no storage, and a single-server deploy gets
// real protection. A serverless fan-out gets proportionally less, which is
// still more than none.

export interface RateLimit {
  /** Requests allowed inside the window. */
  max: number;
  windowMs: number;
}

/** One bucket per limiter, so callers cannot share each other's counters. */
const buckets = new Map<string, Map<string, number[]>>();

/**
 * Records a hit and says whether the caller has gone over.
 *
 * `name` separates the counters: a visitor leaving a comment should not use up
 * their allowance for reporting a broken link.
 */
export function rateLimited(name: string, key: string, { max, windowMs }: RateLimit): boolean {
  let bucket = buckets.get(name);
  if (!bucket) {
    bucket = new Map<string, number[]>();
    buckets.set(name, bucket);
  }

  const now = Date.now();
  const hits = (bucket.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  bucket.set(key, hits);

  // Cheap sweep so the map cannot grow without bound on a long-lived process.
  if (bucket.size > 5000) {
    for (const [k, times] of bucket) {
      if (times.every((t) => now - t >= windowMs)) bucket.delete(k);
    }
  }

  return hits.length > max;
}

/**
 * Whether an address is one of Cloudflare's — the ranges server.js keeps,
 * ported here (SEC-005). server.js can *strip* spoofed client-IP headers
 * because it sees the socket, but it only runs when it is the launcher:
 * under `next start` or a serverless host nothing stripped anything, and
 * clientIp() below believed whatever `true-client-ip` a visitor typed —
 * a fresh rate-limit allowance per made-up value. The guard now travels
 * with the code that consumes the headers: a CDN's word about the client
 * is believed only when the connection's last hop is that CDN, or when
 * the operator asserts a trusted proxy with TRUST_PROXY_HEADERS=1.
 */
const CF_V4: ReadonlyArray<readonly [number, number]> = [
  ["173.245.48.0", 20], ["103.21.244.0", 22], ["103.22.200.0", 22], ["103.31.4.0", 22],
  ["141.101.64.0", 18], ["108.162.192.0", 18], ["190.93.240.0", 20], ["188.114.96.0", 20],
  ["197.234.240.0", 22], ["198.41.128.0", 17], ["162.158.0.0", 15], ["104.16.0.0", 13],
  ["104.24.0.0", 14], ["172.64.0.0", 13], ["131.0.72.0", 22],
].map(([base, bits]) => {
  const n = base.split(".").reduce((acc, octet) => acc * 256 + Number(octet), 0);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return [n, mask] as const;
});

/** [first word, second word] an IPv6 range pins down; /29 pins 13 bits of the second. */
const CF_V6: ReadonlyArray<readonly [number, number, number]> = [
  [0x2400, 0xcb00, 16], [0x2606, 0x4700, 16], [0x2803, 0xf800, 16], [0x2405, 0xb500, 16],
  [0x2405, 0x8100, 16], [0x2a06, 0x98c0, 13], [0x2c0f, 0xf248, 16],
];

function fromCloudflare(raw: string): boolean {
  const ip = raw.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.some((n) => n > 255)) return false;
    const n = parts.reduce((acc, octet) => acc * 256 + octet, 0);
    return CF_V4.some(([base, mask]) => (n & mask) === (base & mask));
  }
  // IPv6: only the first two words are needed — every range is /29 or /32.
  const clean = ip.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  if (!clean.includes(":")) return false;
  const head = clean.split("::")[0];
  const segs = head === "" ? [] : head.split(":");
  const w0 = segs.length > 0 ? parseInt(segs[0], 16) : 0;
  const w1 = segs.length > 1 ? parseInt(segs[1], 16) : 0;
  if (Number.isNaN(w0) || Number.isNaN(w1)) return false;
  return CF_V6.some(([a, b, bits]) => w0 === a && (bits === 16 ? w1 === b : w1 >> (16 - bits) === b >> (16 - bits)));
}

/**
 * The caller's address, as far as it can be trusted.
 *
 * Behind Cloudflare the visitor can send their own `x-forwarded-for`.
 * Cloudflare *appends* the real address, so the first entry is whatever they
 * typed and every login / form / comment limit could be skipped by rotating
 * a fake one. `cf-connecting-ip` is set by Cloudflare and is the one to
 * believe — but only when the connection actually came through Cloudflare
 * (see fromCloudflare above); read unconditionally, it is just another
 * header the visitor can type. `true-client-ip` ranks no higher: it is
 * another CDN's header, with the same trust requirement, and it used to sit
 * *above* the forwarded chain here, which made it the easiest of all to
 * spoof (SEC-005).
 *
 * Without a believable CDN header: `x-real-ip` when there is no forwarded
 * chain at all (a lone proxy set it, and with nothing else to go on the
 * alternative is one shared allowance for every visitor — the same call
 * server.js makes for a local socket), then the last `x-forwarded-for` hop
 * (what an honest proxy appends), then the first hop.
 */
export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  const hops = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const lastHop = hops.length > 0 ? hops[hops.length - 1] : undefined;

  const viaCloudflare = !!lastHop && fromCloudflare(lastHop);
  const trustedProxy = process.env.TRUST_PROXY_HEADERS === "1" || viaCloudflare;
  if (trustedProxy) {
    const cf = (req.headers.get("cf-connecting-ip") ?? "").trim();
    if (cf) return cf;
    const trueClient = (req.headers.get("true-client-ip") ?? "").trim();
    if (trueClient) return trueClient;
  }
  if (hops.length === 0) {
    const real = (req.headers.get("x-real-ip") ?? "").trim();
    if (real) return real;
    return "unknown";
  }
  return lastHop ?? hops[0] ?? "unknown";
}
