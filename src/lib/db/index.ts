// The database connection.
//
// Two drivers, chosen at runtime, because the CMS has to run in two very
// different places:
//
//   • Neon over HTTP — serverless hosts (Vercel and friends). There is no
//     connection pool to keep alive between invocations, so each query is one
//     stateless HTTPS request. A normal TCP pool is actively wrong there: the
//     function freezes with sockets open and the database runs out of them.
//
//   • node-postgres over TCP — a VPS, or shared hosting with a Node app
//     manager. One long-lived process, one pool, and it works against any
//     Postgres: the host's own, a local install, Supabase, RDS, or Neon.
//
// The driver is picked from the connection string, so nobody has to think
// about it. Set DB_DRIVER to override when the guess is wrong — a Neon URL
// behind a custom domain, say, or a deliberate TCP connection to Neon.

import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import * as relations from "./relations";
import { isNeonHttp } from "./driver";

const allSchema = { ...schema, ...relations };

// Both drivers are typed separately by Drizzle but expose the same builder API,
// and this app uses only the common subset — select/insert/update/delete, the
// relational `query` API, and nothing else. `db.transaction()` is the one real
// difference (HTTP cannot do it), and nothing here calls it; the migration
// runner opens its own connection precisely because it needs transactions.
type DbInstance = ReturnType<typeof drizzleNeon<typeof allSchema>>;

/** Whether this connection string is a Neon endpoint speaking HTTP. */

let _instance: DbInstance | undefined;

function getInstance(): DbInstance {
  if (_instance) return _instance;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in."
    );
  }

  if (isNeonHttp(url)) {
    // Every query over this driver is one `fetch()` POST, and inside a
    // Next.js render the global `fetch` is Next's patched one: in a route
    // with `revalidate` set it stores the response in the Data Cache, keyed
    // by URL and body — which for a SQL endpoint means "this exact query".
    // `next build` keeps that cache in `.next/cache/fetch-cache` between
    // builds, so a rebuild answered the post sitemap's query with the rows
    // from the previous build: none. The first post published on the live
    // site was missing from post-sitemap.xml on a build made after it went
    // live, and on the host the same cache could hand a page an hour-old
    // answer after its own cache had been revalidated.
    //
    // Asking for `cache: "no-store"` is not the fix: Next then refuses to
    // prerender any route that queried, and the build fails. The driver is
    // given the unpatched fetch instead — Next hangs the original on the
    // patched function for exactly this purpose — so the database is never a
    // "fetch" as far as Next is concerned. Resolved on each call: which
    // function is global depends on when Next installed its patch.
    neonConfig.fetchFunction = (...args: Parameters<typeof fetch>) => {
      const current = globalThis.fetch as typeof fetch & { _nextOriginalFetch?: typeof fetch };
      return (current._nextOriginalFetch ?? current)(...args);
    };
    _instance = drizzleNeon(neon(url), { schema: allSchema });
  } else {
    // `max` is deliberately small. Shared hosting caps how many connections an
    // account may hold, and the usual Postgres default of 10 per process is
    // enough to exhaust that allowance from a single site. Raise it on a VPS
    // with a database to itself.
    const pool = new Pool({
      connectionString: url,
      max: Number(process.env.DB_POOL_MAX ?? 5),
      // Hosts and proxies drop idle connections without telling the client;
      // reaping them here avoids handing a query a socket that is already gone.
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // Managed Postgres almost always requires TLS but is very often fronted
      // by a certificate this process has no root for. Refusing to connect
      // would be worse advice than connecting encrypted without verifying, so
      // that is the default — set DB_SSL=verify once you have a CA configured,
      // or DB_SSL=off for a database on localhost.
      ssl:
        process.env.DB_SSL === "off"
          ? undefined
          : process.env.DB_SSL === "verify"
            ? { rejectUnauthorized: true }
            : { rejectUnauthorized: false },
    });
    _instance = drizzlePg(pool, { schema: allSchema }) as unknown as DbInstance;
  }

  return _instance;
}

// Proxied so the connection is opened on first use rather than on import.
// Importing this module must stay free: it is pulled in by files that only
// need a type, and by routes that may never touch the database on a request.
export const db = new Proxy({} as DbInstance, {
  get(_, prop) {
    return getInstance()[prop as keyof DbInstance];
  },
});
