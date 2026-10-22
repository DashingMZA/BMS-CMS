// Media storage drivers — where uploaded files' bytes actually live.
//
// Settings → Media Storage picks one active driver; every new upload goes
// there, and each media row remembers its driver + key (media.storage /
// media.storage_key) so deletes find the file even after the active driver
// changes. Drivers:
//
//   local   this server's public/uploads folder (the historical default)
//   s3      Amazon S3 (SigV4-signed REST, no SDK dependency)
//   r2      Cloudflare R2 (the same S3-compatible signing, R2 endpoint)
//   github  a GitHub repo via the Contents API — for very small sites only:
//           every upload is a commit, and GitHub is not a CDN. Files up to
//           1 MB use the Contents API; larger ones go through the Git data
//           API (blob → tree → commit → ref), the same flow either way.
//   blob    Vercel Blob — not selectable in the tab; it remains the automatic
//           fallback when no driver is chosen and BLOB_READ_WRITE_TOKEN is
//           set, so existing Vercel deploys keep working untouched.
//
// Credentials live in site_settings (storage_* keys). They are admin-only:
// settings.ts strips ^storage_ from anything a non-administrator can read,
// and the public site never receives them.

import { createHash, createHmac } from "node:crypto";
import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSiteSettings } from "@/lib/settings";

export type StorageDriverName = "local" | "s3" | "r2" | "github" | "blob";

/** An error whose message is safe to show an administrator. */
export class StorageError extends Error {}

export interface StorageConfig {
  /** The tab's choice; "" = automatic (Blob if its token is set, else local). */
  driver: "" | "local" | "s3" | "r2" | "github";
  s3: { bucket: string; region: string; accessKey: string; secret: string; prefix: string; baseUrl: string };
  r2: { bucket: string; accountId: string; accessKey: string; secret: string; prefix: string; baseUrl: string };
  github: { repo: string; branch: string; dir: string; token: string; baseUrl: string };
}

const str = (v: string | undefined) => (v ?? "").trim();

export function storageConfigFromSettings(s: Record<string, string>): StorageConfig {
  const driver = str(s.storage_driver);
  return {
    driver: driver === "local" || driver === "s3" || driver === "r2" || driver === "github" ? driver : "",
    s3: {
      bucket: str(s.storage_s3_bucket),
      region: str(s.storage_s3_region) || "us-east-1",
      accessKey: str(s.storage_s3_access_key),
      secret: str(s.storage_s3_secret),
      prefix: str(s.storage_s3_prefix).replace(/^\/+|\/+$/g, "") || "uploads",
      baseUrl: str(s.storage_s3_base_url).replace(/\/+$/g, ""),
    },
    r2: {
      bucket: str(s.storage_r2_bucket),
      accountId: str(s.storage_r2_account_id),
      accessKey: str(s.storage_r2_access_key),
      secret: str(s.storage_r2_secret),
      prefix: str(s.storage_r2_prefix).replace(/^\/+|\/+$/g, "") || "uploads",
      baseUrl: str(s.storage_r2_base_url).replace(/\/+$/g, ""),
    },
    github: {
      repo: str(s.storage_github_repo).replace(/^\/+|\/+$/g, ""),
      branch: str(s.storage_github_branch) || "main",
      dir: str(s.storage_github_path).replace(/^\/+|\/+$/g, "") || "uploads",
      token: str(s.storage_github_token),
      baseUrl: str(s.storage_github_base_url).replace(/\/+$/g, ""),
    },
  };
}

export async function getStorageConfig(): Promise<StorageConfig> {
  return storageConfigFromSettings(await getSiteSettings());
}

/** The driver that will actually store the next upload. */
export function activeDriver(cfg: StorageConfig): StorageDriverName {
  if (cfg.driver) return cfg.driver;
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";
}

export interface StoredFile {
  url: string;
  filename: string;
  driver: StorageDriverName;
  key: string;
}

/** First name not already taken: `name`, then `name-2`, `name-3`, … */
async function uniqueName(name: string, taken: (candidate: string) => Promise<boolean>): Promise<string> {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let candidate = name;
  for (let n = 2; ; n++) {
    if (!(await taken(candidate))) return candidate;
    candidate = `${base}-${n}${ext}`;
  }
}

// ---------------------------------------------------------------------------
// Local disk

function localDir(): string {
  return path.join(process.cwd(), "public", "uploads");
}

async function storeLocal(filename: string, bytes: Buffer): Promise<StoredFile> {
  const dir = localDir();
  await mkdir(dir, { recursive: true });
  const unique = await uniqueName(filename, async (c) => {
    try {
      await access(path.join(dir, c));
      return true;
    } catch {
      return false;
    }
  });
  await writeFile(path.join(dir, unique), bytes);
  return { url: `/uploads/${unique}`, filename: unique, driver: "local", key: unique };
}

async function deleteLocal(filename: string): Promise<void> {
  await unlink(path.join(localDir(), path.basename(filename))).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== "ENOENT") throw err;
  });
}

// ---------------------------------------------------------------------------
// S3-compatible (Amazon S3 + Cloudflare R2), SigV4-signed fetch.

interface S3Target {
  /** URL the request goes to (endpoint + key path). */
  requestUrl: string;
  host: string;
  region: string;
  accessKey: string;
  secret: string;
  /** Public URL the stored file is linked at. */
  publicUrl: string;
}

function s3Target(cfg: StorageConfig, driver: "s3" | "r2", key: string): S3Target {
  if (driver === "s3") {
    const c = cfg.s3;
    if (!c.bucket) throw new StorageError("S3 bucket is not set — Settings → Media Storage → Amazon S3.");
    if (!c.accessKey || !c.secret) throw new StorageError("S3 access key / secret are not set — Settings → Media Storage → Amazon S3.");
    const host = `${c.bucket}.s3.${c.region}.amazonaws.com`;
    const base = c.baseUrl || `https://${host}`;
    return {
      requestUrl: `https://${host}/${encodeKey(key)}`,
      host,
      region: c.region,
      accessKey: c.accessKey,
      secret: c.secret,
      publicUrl: `${base}/${encodeKey(key)}`,
    };
  }
  const c = cfg.r2;
  if (!c.bucket) throw new StorageError("R2 bucket is not set — Settings → Media Storage → Cloudflare R2.");
  if (!c.accountId) throw new StorageError("R2 account ID is not set — Settings → Media Storage → Cloudflare R2.");
  if (!c.accessKey || !c.secret) throw new StorageError("R2 access key / secret are not set — Settings → Media Storage → Cloudflare R2.");
  const host = `${c.accountId}.r2.cloudflarestorage.com`;
  const base = c.baseUrl || `https://${host}/${c.bucket}`;
  return {
    requestUrl: `https://${host}/${c.bucket}/${encodeKey(key)}`,
    host,
    region: "auto",
    accessKey: c.accessKey,
    secret: c.secret,
    publicUrl: `${base}/${encodeKey(key)}`,
  };
}

/** Percent-encode each path segment, keep the slashes. */
function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

const sha256Hex = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data, "utf8").digest();

async function s3Request(
  cfg: StorageConfig,
  driver: "s3" | "r2",
  method: "PUT" | "HEAD" | "DELETE",
  key: string,
  bytes?: Buffer,
  contentType?: string
): Promise<{ status: number; publicUrl: string }> {
  const t = s3Target(cfg, driver, key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(bytes ?? "");
  const headers: Record<string, string> = {
    host: t.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (method === "PUT" && contentType) headers["content-type"] = contentType;
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((h) => `${h}:${headers[h]}\n`)
    .join("");
  const canonicalUri = new URL(t.requestUrl).pathname;
  const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${t.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${t.secret}`, dateStamp), t.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");
  headers["authorization"] =
    `AWS4-HMAC-SHA256 Credential=${t.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const label = driver === "s3" ? "S3" : "R2";
  let res: Response;
  try {
    res = await fetch(t.requestUrl, {
      method,
      headers,
      body: bytes ? new Uint8Array(bytes) : undefined,
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    throw new StorageError(`${label} could not be reached. Check the bucket settings and the server's internet connection.`);
  }
  if (method === "HEAD") return { status: res.status, publicUrl: t.publicUrl };
  if (method === "DELETE") {
    if (res.status === 204 || res.status === 200 || res.status === 404) return { status: res.status, publicUrl: t.publicUrl };
  } else if (res.ok) {
    return { status: res.status, publicUrl: t.publicUrl };
  }
  const detail = await res.text().catch(() => "");
  const code = detail.match(/<Code>([^<]+)<\/Code>/)?.[1];
  throw new StorageError(
    `${label} ${method} failed (HTTP ${res.status}${code ? `, ${code}` : ""}). ` +
      (res.status === 403
        ? "The access key is wrong, or its policy does not allow this action on the bucket."
        : res.status === 404
          ? "The bucket was not found — check the bucket name and region."
          : "Check the storage settings.")
  );
}

async function storeS3(cfg: StorageConfig, driver: "s3" | "r2", filename: string, bytes: Buffer, mimeType: string): Promise<StoredFile> {
  const c = driver === "s3" ? cfg.s3 : cfg.r2;
  const unique = await uniqueName(filename, async (cand) => {
    const { status } = await s3Request(cfg, driver, "HEAD", `${c.prefix}/${cand}`);
    return status === 200;
  });
  const key = `${c.prefix}/${unique}`;
  const { publicUrl } = await s3Request(cfg, driver, "PUT", key, bytes, mimeType);
  return { url: publicUrl, filename: unique, driver, key };
}

// ---------------------------------------------------------------------------
// GitHub (Contents API for ≤1 MB, Git data API above that)

const GH_API = "https://api.github.com";
const GH_CONTENTS_LIMIT = 1024 * 1024;

function ghConfig(cfg: StorageConfig) {
  const c = cfg.github;
  if (!/^[^/\s]+\/[^/\s]+$/.test(c.repo)) throw new StorageError("GitHub repo must look like \"owner/repo\" — Settings → Media Storage → GitHub.");
  if (!c.token) throw new StorageError("GitHub token is not set — Settings → Media Storage → GitHub. Use a fine-grained PAT with Contents read & write on the repo.");
  return c;
}

async function ghFetch(cfg: StorageConfig, urlPath: string, init: RequestInit = {}): Promise<Response> {
  const c = ghConfig(cfg);
  let res: Response;
  try {
    res = await fetch(`${GH_API}${urlPath}`, {
      ...init,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${c.token}`,
        "x-github-api-version": "2022-11-28",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    throw new StorageError("GitHub could not be reached. Check the token and the server's internet connection.");
  }
  return res;
}

async function ghJson(cfg: StorageConfig, urlPath: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const res = await ghFetch(cfg, urlPath, init);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof data.message === "string" ? data.message : "";
    throw new StorageError(
      `GitHub request failed (HTTP ${res.status}${msg ? `: ${msg}` : ""}). ` +
        (res.status === 401 || res.status === 403
          ? "The token is wrong, expired, or lacks Contents read & write on this repo."
          : res.status === 404
            ? "The repo or branch was not found — or the token cannot see a private repo."
            : "")
    );
  }
  return data;
}

function ghPublicUrl(cfg: StorageConfig, repoPath: string, filename: string): string {
  const c = cfg.github;
  return c.baseUrl ? `${c.baseUrl}/${filename}` : `https://raw.githubusercontent.com/${c.repo}/${c.branch}/${encodeKey(repoPath)}`;
}

async function ghExists(cfg: StorageConfig, repoPath: string): Promise<boolean> {
  const c = ghConfig(cfg);
  const res = await ghFetch(cfg, `/repos/${c.repo}/contents/${encodeKey(repoPath)}?ref=${encodeURIComponent(c.branch)}`);
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  // Large files: the Contents API refuses them, but the git tree knows.
  if (res.status === 422 || res.status === 403) return (await ghTreeSha(cfg, repoPath)) !== null;
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  throw new StorageError(`GitHub request failed (HTTP ${res.status}${typeof data.message === "string" ? `: ${data.message}` : ""}).`);
}

/** The blob SHA of a path on the branch, via the recursive tree; null if absent. */
async function ghTreeSha(cfg: StorageConfig, repoPath: string): Promise<string | null> {
  const c = ghConfig(cfg);
  const ref = await ghJson(cfg, `/repos/${c.repo}/git/ref/heads/${c.branch}`);
  const commitSha = (ref.object as Record<string, unknown>)?.sha as string;
  const commit = await ghJson(cfg, `/repos/${c.repo}/git/commits/${commitSha}`);
  const treeSha = (commit.tree as Record<string, unknown>)?.sha as string;
  const tree = await ghJson(cfg, `/repos/${c.repo}/git/trees/${treeSha}?recursive=1`);
  const entries = (tree.tree as { path: string; sha: string; type: string }[]) ?? [];
  return entries.find((e) => e.path === repoPath && e.type === "blob")?.sha ?? null;
}

/** Commit one file change (add/update with blobSha, or delete with null). */
async function ghCommitFile(cfg: StorageConfig, repoPath: string, blobSha: string | null, message: string): Promise<void> {
  const c = ghConfig(cfg);
  const ref = await ghJson(cfg, `/repos/${c.repo}/git/ref/heads/${c.branch}`);
  const commitSha = (ref.object as Record<string, unknown>)?.sha as string;
  const commit = await ghJson(cfg, `/repos/${c.repo}/git/commits/${commitSha}`);
  const baseTree = (commit.tree as Record<string, unknown>)?.sha as string;
  const tree = await ghJson(cfg, `/repos/${c.repo}/git/trees`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      base_tree: baseTree,
      tree: [{ path: repoPath, mode: "100644", type: "blob", sha: blobSha }],
    }),
  });
  const newCommit = await ghJson(cfg, `/repos/${c.repo}/git/commits`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, tree: tree.sha, parents: [commitSha] }),
  });
  await ghJson(cfg, `/repos/${c.repo}/git/refs/heads/${c.branch}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sha: newCommit.sha }),
  });
}

async function storeGithub(cfg: StorageConfig, filename: string, bytes: Buffer): Promise<StoredFile> {
  const c = ghConfig(cfg);
  const unique = await uniqueName(filename, async (cand) => ghExists(cfg, `${c.dir}/${cand}`));
  const repoPath = `${c.dir}/${unique}`;
  if (bytes.length <= GH_CONTENTS_LIMIT) {
    await ghJson(cfg, `/repos/${c.repo}/contents/${encodeKey(repoPath)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: `Upload ${repoPath}`, content: bytes.toString("base64"), branch: c.branch }),
    });
  } else {
    const blob = await ghJson(cfg, `/repos/${c.repo}/git/blobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: bytes.toString("base64"), encoding: "base64" }),
    });
    await ghCommitFile(cfg, repoPath, blob.sha as string, `Upload ${repoPath}`);
  }
  return { url: ghPublicUrl(cfg, repoPath, unique), filename: unique, driver: "github", key: repoPath };
}

async function deleteGithub(cfg: StorageConfig, repoPath: string): Promise<void> {
  const c = ghConfig(cfg);
  const res = await ghFetch(cfg, `/repos/${c.repo}/contents/${encodeKey(repoPath)}?ref=${encodeURIComponent(c.branch)}`);
  if (res.status === 404) return;
  if (res.ok) {
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const sha = data.sha as string | undefined;
    if (sha) {
      await ghJson(cfg, `/repos/${c.repo}/contents/${encodeKey(repoPath)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: `Delete ${repoPath}`, sha, branch: c.branch }),
      });
      return;
    }
  }
  // Too large for the Contents API (or no sha): remove it via the git tree.
  const sha = await ghTreeSha(cfg, repoPath);
  if (sha) await ghCommitFile(cfg, repoPath, null, `Delete ${repoPath}`);
}

// ---------------------------------------------------------------------------
// Vercel Blob (legacy automatic fallback only)

// Blob is imported lazily so a deploy without the package or the token still
// boots — the disk path is what runs there. (Same note as the old storeFile.)
async function storeBlob(filename: string, bytes: Buffer, mimeType: string): Promise<StoredFile> {
  const { put } = await import("@vercel/blob");
  const blob = await put(filename, bytes, { access: "public", contentType: mimeType });
  const name = blob.pathname.split("/").pop() ?? filename;
  return { url: blob.url, filename: name, driver: "blob", key: blob.pathname };
}

async function deleteBlob(url: string): Promise<void> {
  const { del } = await import("@vercel/blob");
  await del(url).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Public API

export async function storeMediaFile(
  filename: string,
  bytes: Buffer,
  mimeType: string,
  cfgOverride?: StorageConfig
): Promise<StoredFile> {
  const cfg = cfgOverride ?? (await getStorageConfig());
  switch (activeDriver(cfg)) {
    case "s3":
      return storeS3(cfg, "s3", filename, bytes, mimeType);
    case "r2":
      return storeS3(cfg, "r2", filename, bytes, mimeType);
    case "github":
      return storeGithub(cfg, filename, bytes);
    case "blob":
      return storeBlob(filename, bytes, mimeType);
    default:
      return storeLocal(filename, bytes);
  }
}

/** Delete a file from the driver that stored it. Local deletes here remove
 *  only the file itself — mediaDelete keeps its richer local cleanup
 *  (originals, sized variants, CDN purge) and calls this for remote rows. */
export async function deleteMediaFile(
  target: { driver: string; key: string | null; url: string; filename: string },
  cfgOverride?: StorageConfig
): Promise<void> {
  const cfg = cfgOverride ?? (await getStorageConfig());
  switch (target.driver) {
    case "s3":
      await s3Request(cfg, "s3", "DELETE", target.key ?? `${cfg.s3.prefix}/${target.filename}`);
      return;
    case "r2":
      await s3Request(cfg, "r2", "DELETE", target.key ?? `${cfg.r2.prefix}/${target.filename}`);
      return;
    case "github":
      await deleteGithub(cfg, target.key ?? `${cfg.github.dir}/${target.filename}`);
      return;
    case "blob":
      await deleteBlob(target.url);
      return;
    default:
      await deleteLocal(target.filename);
  }
}

/**
 * Write a one-line probe file to the chosen driver and remove it again —
 * the Settings tab's "Test connection" button. Proves the credentials can
 * write, not just authenticate. Local always tests the disk folder.
 */
export async function testStorage(
  cfg: StorageConfig
): Promise<{ ok: true; driver: StorageDriverName } | { ok: false; driver: StorageDriverName; error: string }> {
  const driver = activeDriver(cfg);
  const probe = `.bms-storage-test-${Date.now()}.txt`;
  try {
    const stored = await storeMediaFile(probe, Buffer.from("BMS storage test — safe to delete.\n", "utf8"), "text/plain", cfg);
    await deleteMediaFile({ driver: stored.driver, key: stored.key, url: stored.url, filename: stored.filename }, cfg).catch(
      () => undefined
    );
    return { ok: true, driver };
  } catch (err) {
    return { ok: false, driver, error: err instanceof StorageError ? err.message : "The storage test failed. Check the server log." };
  }
}
