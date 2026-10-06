// Applies the .sql files in drizzle/ that the database has not seen yet.
//
// One implementation for two callers: `npm run db:migrate` (a person, on the
// PC or in a terminal on the host) and server.js after it starts listening
// (the host, every restart). The second is why this exists — an upload that
// adds a column used to need someone to open a terminal on the host and run
// the script, and a site restarted without that step answered 500 on every
// page that touched the new column. Now the upload carries the migration and
// the restart applies it.
//
// Two ways in, chosen the same way src/lib/db/index.ts chooses the app's own
// driver: a Neon URL goes over HTTPS with @neondatabase/serverless, anything
// else over TCP with node-postgres. Shared hosting blocks outbound Postgres
// TCP — the first version of this used pg for everything and hung the site
// at startup on exactly the host it was written for. Neon's HTTP driver runs
// a list of statements as one transaction, which is all a migration file
// needs; pg gets an explicit BEGIN/COMMIT.
//
// What ran is recorded in `cms_migrations`, so a second run is a no-op. Each
// file is one transaction: a failing file is rolled back, reported, and stops
// the run, leaving the database as it was before that file.

const { readdir, readFile } = require("node:fs/promises");
const { join } = require("node:path");

// CLAIM_FIRST: each file's transaction inserts its `cms_migrations` row BEFORE
// running its statements. Passenger can start two app processes together, or
// a restart can overlap the old process, and both used to see the file as
// pending and run it — one failing on "already exists", or a step running
// twice. With the marker first, the second transaction blocks on the first's
// primary-key row, then fails as a duplicate and rolls back whole.
const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS cms_migrations (
    name        text PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT now()
  )`;

/** Whether this connection string is a Neon endpoint — same rule as the app. */
function isNeonHttp(url) {
  const override = (process.env.DB_DRIVER || "").trim().toLowerCase();
  if (override === "neon") return true;
  if (override === "postgres" || override === "pg") return false;
  try {
    return /(^|\.)neon\.tech$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Same TLS rule as src/lib/db/index.ts, so the two never disagree. */
function sslOptions() {
  return process.env.DB_SSL === "off"
    ? undefined
    : process.env.DB_SSL === "verify"
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: false };
}

/**
 * One statement per entry.
 *
 * Drizzle's own separator first; then, because the hand-written files simply
 * end each statement with ";" at the end of a line, on that. Neon's HTTP
 * driver refuses more than one command per query ("cannot insert multiple
 * commands into a prepared statement"), so a two-ALTER file that pg ran fine
 * from the PC failed on the host. Rule for new files: one statement per
 * line-ending semicolon, or `--> statement-breakpoint` between them; a
 * function body (`$$ ... $$`) with semicolons inside needs the breakpoints.
 */
function statementsOf(sql) {
  return sql
    .split("--> statement-breakpoint")
    .flatMap((chunk) => chunk.split(/;[ \t]*(?:\r?\n|$)/))
    .map((s) => s.replace(/^(\s*--[^\n]*\n)+/, "").trim())
    .filter((s) => s && !/^(--[^\n]*\n?)+$/.test(s));
}

/** The two drivers behind one tiny interface: read names, run a file atomically. */
async function openNeon(url) {
  const { neon } = require("@neondatabase/serverless");
  const sql = neon(url);
  await sql(CREATE_TABLE);
  return {
    async applied() {
      const rows = await sql("SELECT name FROM cms_migrations");
      return rows.map((r) => r.name);
    },
    async run(file, statements) {
      // The marker first — see CLAIM_FIRST below.
      await sql.transaction([
        sql("INSERT INTO cms_migrations (name) VALUES ($1)", [file]),
        ...statements.map((s) => sql(s)),
      ]);
    },
    async close() {},
  };
}

async function openPg(url) {
  const pg = require("pg");
  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: sslOptions(), connectionTimeoutMillis: 15_000 });
  const client = await pool.connect();
  await client.query(CREATE_TABLE);
  return {
    async applied() {
      const { rows } = await client.query("SELECT name FROM cms_migrations");
      return rows.map((r) => r.name);
    },
    async run(file, statements) {
      try {
        await client.query("BEGIN");
        await client.query("INSERT INTO cms_migrations (name) VALUES ($1)", [file]);
        for (const s of statements) await client.query(s);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    },
    async close() {
      client.release();
      await pool.end();
    },
  };
}

/**
 * @param {{ root: string, url: string, log?: (msg: string) => void }} opts
 * @returns {Promise<{ applied: string[], skipped: number, files: number, driver: string }>}
 */
async function applyMigrations({ root, url, log = () => {} }) {
  const dir = join(root, "drizzle");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const driver = isNeonHttp(url) ? "neon-http" : "pg";
  if (files.length === 0) return { applied: [], skipped: 0, files: 0, driver };

  const db = driver === "neon-http" ? await openNeon(url) : await openPg(url);
  const applied = [];
  let skipped = 0;
  try {
    const done = new Set(await db.applied());
    for (const file of files) {
      if (done.has(file)) {
        skipped++;
        continue;
      }
      const statements = statementsOf(await readFile(join(dir, file), "utf8"));
      try {
        await db.run(file, statements);
      } catch (err) {
        // Another process applied this file while we were starting (see
        // CLAIM_FIRST): our transaction waited on its marker row, then hit
        // the duplicate and rolled back. Nothing ran twice; move on.
        if (err && err.code === "23505" && /cms_migrations/.test(String(err.message || "") + String(err.detail || "") + String(err.constraint || ""))) {
          skipped++;
          log(`${file} was applied by another process at the same time`);
          continue;
        }
        const e = new Error(`${file} could not be applied and was rolled back: ${err.message}`);
        e.file = file;
        throw e;
      }
      applied.push(file);
      log(`applied ${file} (${statements.length} statements)`);
    }
  } finally {
    await db.close();
  }
  return { applied, skipped, files: files.length, driver };
}

module.exports = { applyMigrations, isNeonHttp };
