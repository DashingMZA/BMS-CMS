// A single parameterised query, on whichever driver this deployment uses.
//
// This exists for the two modules middleware imports — `redirects.ts` and
// `edgeLanguages.ts`. They cannot import `db` (Drizzle plus the whole schema is
// far too heavy to load in front of every request), so each had built its own
// `neon()` client. That hard-wired them to Neon: on any other Postgres the
// HTTP call failed, both modules caught the error and fell back — and the site
// silently lost every redirect and every non-default language, with nothing in
// any log to say why.
//
// Same driver selection as `index.ts`, kept deliberately tiny. Rows come back
// as plain objects; the caller names the columns it wants in the SQL.

import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";
import { isNeonHttp } from "./driver";

type Row = Record<string, unknown>;

let neonClient: ReturnType<typeof neon> | null = null;
let pgPool: Pool | null = null;


/**
 * Runs `text` with `$1…$n` bound to `params`, and returns the rows.
 *
 * Throws on failure — the callers decide what a failure means for them, and
 * both already treat it as "keep serving with what we had".
 */
export async function rawQuery<T extends Row = Row>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  if (isNeonHttp(url)) {
    neonClient ??= neon(url);
    return (await neonClient(text, params)) as T[];
  }

  // Middleware's pool, separate from the app's. Kept at a couple of
  // connections: it serves two tiny cached lookups, not page renders.
  pgPool ??= new Pool({
    connectionString: url,
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl:
      process.env.DB_SSL === "off"
        ? undefined
        : process.env.DB_SSL === "verify"
          ? { rejectUnauthorized: true }
          : { rejectUnauthorized: false },
  });
  const { rows } = await pgPool.query(text, params);
  return rows as T[];
}
