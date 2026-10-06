// Which Postgres driver this deployment talks to.
//
// Its own module, with no imports, because both readers need it and neither
// can import the other: `index.ts` pulls in Drizzle and the whole schema,
// which `raw.ts` exists precisely to avoid (middleware loads it in front of
// every request). They had a copy each — same logic, two names — and the two
// deciding differently would mean one half of a request using HTTP and the
// other a TCP pool, on a host that blocks 5432.

export function isNeonHttp(url: string): boolean {
  const override = (process.env.DB_DRIVER ?? "").trim().toLowerCase();
  if (override === "neon") return true;
  if (override === "postgres" || override === "pg") return false;

  try {
    return /(^|\.)neon\.tech$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}
