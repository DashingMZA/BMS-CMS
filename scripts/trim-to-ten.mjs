/**
 * Trim an imported WordPress dataset down to the first 10 posts.
 *
 * Keeps the 10 oldest posts (by id) and deletes everything else:
 *  - all other posts (post_tags and comments cascade automatically)
 *  - tags not used by the kept posts
 *  - categories not used by the kept posts
 *
 * Usage:
 *   DATABASE_URL="postgres://..." node scripts/trim-to-ten.mjs          # dry run
 *   DATABASE_URL="postgres://..." node scripts/trim-to-ten.mjs --yes    # actually delete
 *
 * The script prints what it will do first. Nothing is deleted without --yes.
 */
import pg from "pg";

const { Client } = pg;
const APPLY = process.argv.includes("--yes");

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const total = await client.query(`SELECT COUNT(*)::int AS n FROM posts`);
  const kept = await client.query(
    `SELECT id, title FROM posts ORDER BY id ASC LIMIT 10`
  );
  const keepIds = kept.rows.map((r) => r.id);

  console.log(`Posts in database : ${total.rows[0].n}`);
  console.log(`Posts to keep     : ${keepIds.length}`);
  for (const r of kept.rows) console.log(`  #${r.id} ${r.title}`);
  if (keepIds.length === 0) {
    console.log("Nothing to keep — aborting.");
    process.exit(0);
  }

  const toDeletePosts = await client.query(
    `SELECT COUNT(*)::int AS n FROM posts WHERE NOT (id = ANY($1))`,
    [keepIds]
  );
  const orphanTags = await client.query(
    `SELECT COUNT(*)::int AS n FROM tags t
     WHERE NOT EXISTS (
       SELECT 1 FROM post_tags pt WHERE pt.tag_id = t.id AND pt.post_id = ANY($1)
     )`,
    [keepIds]
  );
  const unusedCats = await client.query(
    `SELECT COUNT(*)::int AS n FROM categories c
     WHERE NOT EXISTS (
       SELECT 1 FROM posts p WHERE p.category_id = c.id AND p.id = ANY($1)
     )`,
    [keepIds]
  );

  console.log(`Posts to delete      : ${toDeletePosts.rows[0].n}`);
  console.log(`Tags to delete       : ${orphanTags.rows[0].n}`);
  console.log(`Categories to delete : ${unusedCats.rows[0].n}`);

  if (!APPLY) {
    console.log("\nDry run — nothing deleted. Re-run with --yes to apply.");
    process.exit(0);
  }

  await client.query("BEGIN");
  // Posts first: post_tags and comments cascade.
  const delPosts = await client.query(
    `DELETE FROM posts WHERE NOT (id = ANY($1))`,
    [keepIds]
  );
  // Tags no longer used by any kept post.
  const delTags = await client.query(
    `DELETE FROM tags t
     WHERE NOT EXISTS (
       SELECT 1 FROM post_tags pt WHERE pt.tag_id = t.id AND pt.post_id = ANY($1)
     )`,
    [keepIds]
  );
  // Categories no longer used by any kept post.
  const delCats = await client.query(
    `DELETE FROM categories c
     WHERE NOT EXISTS (
       SELECT 1 FROM posts p WHERE p.category_id = c.id AND p.id = ANY($1)
     )`,
    [keepIds]
  );
  await client.query("COMMIT");

  console.log(`\nDeleted ${delPosts.rowCount} posts, ${delTags.rowCount} tags, ${delCats.rowCount} categories.`);
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Failed:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
