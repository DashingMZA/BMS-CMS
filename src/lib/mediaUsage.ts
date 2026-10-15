import { rawQuery } from "@/lib/db/raw";

/**
 * Where an upload is still used, in words — "2 posts, the site settings".
 *
 * Deleting an image that a post or the logo still shows left a broken image
 * on the live site with no warning. The content columns are JSON, searched as
 * text for the file's URL, which catches it in any block, column or prop.
 */
export async function usesOf(url: string): Promise<string[]> {
  const like = `%${url.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  const count = async (sql: string) => {
    try {
      const rows = await rawQuery<{ n: number }>(sql, [like]);
      return Number(rows[0]?.n ?? 0);
    } catch {
      return 0;
    }
  };
  const [postsN, pagesN, elementsN, usersN, settingsN] = await Promise.all([
    count("SELECT count(*)::int AS n FROM posts WHERE deleted_at IS NULL AND (content::text LIKE $1 OR featured_image LIKE $1 OR og_image LIKE $1)"),
    count("SELECT count(*)::int AS n FROM pages WHERE deleted_at IS NULL AND (content::text LIKE $1 OR featured_image LIKE $1 OR og_image LIKE $1)"),
    count("SELECT count(*)::int AS n FROM elements WHERE content::text LIKE $1"),
    count("SELECT count(*)::int AS n FROM users WHERE content::text LIKE $1 OR image LIKE $1"),
    count("SELECT count(*)::int AS n FROM site_settings WHERE value LIKE $1"),
  ]);
  const out: string[] = [];
  if (postsN) out.push(`${postsN} post${postsN === 1 ? "" : "s"}`);
  if (pagesN) out.push(`${pagesN} page${pagesN === 1 ? "" : "s"}`);
  if (elementsN) out.push(`${elementsN} element${elementsN === 1 ? "" : "s"}`);
  if (usersN) out.push(`${usersN} author profile${usersN === 1 ? "" : "s"}`);
  if (settingsN) out.push("the site settings (logo, icon or a default image)");
  return out;
}
