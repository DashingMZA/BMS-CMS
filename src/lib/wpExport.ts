// BMS → WordPress WXR export.
//
// Generates a WordPress eXtended RSS (WXR 1.2) `.xml` file from the BMS
// database, so content can move *out* to WordPress as easily as the
// Tools → Import from WP screen moves it *in*. WordPress's own importer
// (Tools → Import → WordPress) reads this file directly.
//
// Coverage: posts, pages, categories, tags, media (as attachments) and
// comments. Block content is converted to HTML; the `htmlEmbed` block —
// which is what WP imports arrive in — passes its HTML through untouched.

import { db } from "./db";
import { categories, comments, media, pages, postTags, posts, tags, users } from "./db/schema";
import { asc } from "drizzle-orm";
import { getSiteSettings } from "./settings";

type AnyBlock = Record<string, any>;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** CDATA, with any `]]>` inside the payload split so it cannot close early. */
function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

/** Inline content nodes (BlockNote shape) to HTML. */
function inlineToHtml(nodes: unknown): string {
  if (!Array.isArray(nodes)) return "";
  let out = "";
  for (const n of nodes) {
    const node = n as AnyBlock;
    if (!node || typeof node !== "object") continue;
    if (node.type === "link") {
      const url = esc(String(node.props?.url ?? node.url ?? "#"));
      out += `<a href="${url}">${inlineToHtml(node.content)}</a>`;
      continue;
    }
    let t = esc(String(node.text ?? ""));
    t = t.replace(/\n/g, "<br />");
    const s = (node.styles ?? {}) as Record<string, unknown>;
    if (s.code) t = `<code>${t}</code>`;
    if (s.bold) t = `<strong>${t}</strong>`;
    if (s.italic) t = `<em>${t}</em>`;
    if (s.underline) t = `<u>${t}</u>`;
    if (s.strike) t = `<s>${t}</s>`;
    out += t;
  }
  return out;
}

function textOf(nodes: unknown): string {
  if (!Array.isArray(nodes)) return "";
  return nodes
    .map((n) => {
      const node = n as AnyBlock;
      if (!node || typeof node !== "object") return "";
      if (node.type === "link") return textOf(node.content);
      return String(node.text ?? "");
    })
    .join("");
}

/** One BMS block to HTML. Unknown types degrade to their text. */
function blockToHtml(block: AnyBlock): string {
  const p = (block.props ?? {}) as Record<string, unknown>;
  switch (block.type) {
    case "htmlEmbed":
      return typeof p.html === "string" ? p.html : "";
    case "paragraph":
      return `<p>${inlineToHtml(block.content)}</p>`;
    case "heading": {
      const level = [1, 2, 3].includes(Number(p.level)) ? Number(p.level) : 2;
      return `<h${level}>${inlineToHtml(block.content)}</h${level}>`;
    }
    case "image":
    case "imageAdvanced": {
      const src = esc(String(p.url ?? p.src ?? ""));
      if (!src) return "";
      const alt = esc(String(p.alt ?? p.caption ?? ""));
      return `<img src="${src}" alt="${alt}" />`;
    }
    case "bulletList":
    case "numberedList":
    case "list": {
      const tag = block.type === "numberedList" ? "ol" : "ul";
      const items = Array.isArray(block.children)
        ? block.children.map((c: AnyBlock) => `<li>${inlineToHtml(c.content)}</li>`).join("")
        : "";
      return `<${tag}>${items}</${tag}>`;
    }
    case "quote":
    case "blockquote":
      return `<blockquote>${inlineToHtml(block.content)}</blockquote>`;
    case "code":
      return `<pre>${esc(textOf(block.content))}</pre>`;
    case "divider":
      return "<hr />";
    default: {
      // Rows, columns and other containers: render children.
      if (Array.isArray(block.children)) return block.children.map(blockToHtml).join("\n");
      const t = textOf(block.content);
      return t ? `<p>${esc(t)}</p>` : "";
    }
  }
}

export function blocksToHtml(blocks: unknown): string {
  if (!Array.isArray(blocks)) return typeof blocks === "string" ? blocks : "";
  return blocks.map((b) => blockToHtml(b as AnyBlock)).filter(Boolean).join("\n\n");
}

function wpDate(d: Date | string | null): string {
  if (!d) return new Date().toISOString().slice(0, 19).replace("T", " ");
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return new Date().toISOString().slice(0, 19).replace("T", " ");
  return dt.toISOString().slice(0, 19).replace("T", " ");
}

function rfc822(d: Date | string | null): string {
  const dt = d instanceof Date ? d : d ? new Date(d) : new Date();
  return (Number.isNaN(dt.getTime()) ? new Date() : dt).toUTCString();
}

export interface WxrExportOptions {
  /** Only these languages (BMS partitions content by language). */
  language?: string;
}

/** Build the full WXR 1.2 XML for the site's content. */
export async function buildWxrExport(options: WxrExportOptions = {}): Promise<string> {
  const settings = await getSiteSettings();
  const siteName = settings.site_name || "BMS Site";
  const siteUrl = (settings.site_url || "").replace(/\/$/, "");
  const lang = options.language;

  const [catRows, tagRows, postRows, pageRows, mediaRows, commentRows, userRows] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.id)),
    db.select().from(tags).orderBy(asc(tags.id)),
    db.select().from(posts).orderBy(asc(posts.id)),
    db.select().from(pages).orderBy(asc(pages.id)),
    db.select().from(media).orderBy(asc(media.id)),
    db.select().from(comments).orderBy(asc(comments.id)),
    db.select().from(users),
  ]);
  const tagMap = new Map<number, { name: string; slug: string }>();
  for (const t of tagRows) tagMap.set(t.id, { name: t.name, slug: t.slug });
  const postTagRows = await db.select().from(postTags);
  const tagsByPost = new Map<number, { name: string; slug: string }[]>();
  for (const pt of postTagRows) {
    const t = tagMap.get(pt.tagId);
    if (!t) continue;
    const list = tagsByPost.get(pt.postId) ?? [];
    list.push(t);
    tagsByPost.set(pt.postId, list);
  }
  const catById = new Map(catRows.map((c) => [c.id, c]));
  const userById = new Map(userRows.map((u) => [u.id, u]));

  const keep = <T extends { language?: string | null }>(r: T) => !lang || (r.language ?? "en") === lang;
  const fPosts = postRows.filter(keep);
  const fPages = pageRows.filter(keep);

  const out: string[] = [];
  out.push(`<?xml version="1.0" encoding="UTF-8" ?>`);
  out.push(`<!-- WordPress eXtended RSS generated by BMS-CMS -->`);
  out.push(
    `<rss version="2.0"`,
    `\txmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"`,
    `\txmlns:content="http://purl.org/rss/1.0/modules/content/"`,
    `\txmlns:wfw="http://wellformedweb.org/CommentAPI/"`,
    `\txmlns:dc="http://purl.org/dc/elements/1.1/"`,
    `\txmlns:wp="http://wordpress.org/export/1.2/"`,
    `>`,
    ``,
    `<channel>`,
    `\t<title>${esc(siteName)}</title>`,
    `\t<link>${esc(siteUrl)}</link>`,
    `\t<description>${esc(settings.site_description || "")}</description>`,
    `\t<pubDate>${rfc822(new Date())}</pubDate>`,
    `\t<language>en-US</language>`,
    `\t<wp:wxr_version>1.2</wp:wxr_version>`,
    `\t<wp:base_site_url>${esc(siteUrl)}</wp:base_site_url>`,
    `\t<wp:base_blog_url>${esc(siteUrl)}</wp:base_blog_url>`,
  );

  // Authors referenced by the exported documents.
  const authorIds = new Set<string>();
  for (const p of [...fPosts, ...fPages]) if (p.authorId) authorIds.add(p.authorId);
  for (const id of authorIds) {
    const u = userById.get(id);
    if (!u) continue;
    const login = (u.name || u.email || "admin").toLowerCase().replace(/[^a-z0-9]+/g, "");
    out.push(
      `\t<wp:author>`,
      `\t\t<wp:author_id>${esc(u.id)}</wp:author_id>`,
      `\t\t<wp:author_login>${cdata(login || "admin")}</wp:author_login>`,
      `\t\t<wp:author_email>${cdata(u.email || "")}</wp:author_email>`,
      `\t\t<wp:author_display_name>${cdata(u.name || login || "admin")}</wp:author_display_name>`,
      `\t\t<wp:author_first_name>${cdata("")}</wp:author_first_name>`,
      `\t\t<wp:author_last_name>${cdata("")}</wp:author_last_name>`,
      `\t</wp:author>`,
    );
  }

  for (const c of catRows) {
    out.push(
      `\t<wp:category>`,
      `\t\t<wp:term_id>${c.id}</wp:term_id>`,
      `\t\t<wp:category_nicename>${cdata(c.slug)}</wp:category_nicename>`,
      `\t\t<wp:category_parent>${cdata("")}</wp:category_parent>`,
      `\t\t<wp:cat_name>${cdata(c.name)}</wp:cat_name>`,
      `\t</wp:category>`,
    );
  }
  for (const t of tagRows) {
    out.push(
      `\t<wp:tag>`,
      `\t\t<wp:term_id>${t.id}</wp:term_id>`,
      `\t\t<wp:tag_slug>${cdata(t.slug)}</wp:tag_slug>`,
      `\t\t<wp:tag_name>${cdata(t.name)}</wp:tag_name>`,
      `\t</wp:tag>`,
    );
  }

  let wpId = 1;
  const wpIdByPost = new Map<number, number>();
  const wpIdByPage = new Map<number, number>();

  const itemHead = (
    title: string, link: string, pubDate: string, creator: string,
    guid: string, contentHtml: string, excerpt: string,
  ) => [
    `\t<item>`,
    `\t\t<title>${esc(title)}</title>`,
    `\t\t<link>${esc(link)}</link>`,
    `\t\t<pubDate>${pubDate}</pubDate>`,
    `\t\t<dc:creator>${cdata(creator)}</dc:creator>`,
    `\t\t<guid isPermaLink="false">${esc(guid)}</guid>`,
    `\t\t<description></description>`,
    `\t\t<content:encoded>${cdata(contentHtml)}</content:encoded>`,
    `\t\t<excerpt:encoded>${cdata(excerpt)}</excerpt:encoded>`,
  ];

  const docMeta = (id: number, slug: string, status: string, postType: string, date: string, postDateGmt: string) => [
    `\t\t<wp:post_id>${id}</wp:post_id>`,
    `\t\t<wp:post_date>${cdata(date)}</wp:post_date>`,
    `\t\t<wp:post_date_gmt>${cdata(postDateGmt)}</wp:post_date_gmt>`,
    `\t\t<wp:comment_status>${cdata("open")}</wp:comment_status>`,
    `\t\t<wp:ping_status>${cdata("open")}</wp:ping_status>`,
    `\t\t<wp:post_name>${cdata(slug)}</wp:post_name>`,
    `\t\t<wp:status>${cdata(status)}</wp:status>`,
    `\t\t<wp:post_parent>0</wp:post_parent>`,
    `\t\t<wp:menu_order>0</wp:menu_order>`,
    `\t\t<wp:post_type>${cdata(postType)}</wp:post_type>`,
    `\t\t<wp:post_password>${cdata("")}</wp:post_password>`,
    `\t\t<wp:is_sticky>0</wp:is_sticky>`,
  ];

  const creatorOf = (authorId: string | null) => {
    const u = authorId ? userById.get(authorId) : undefined;
    const login = (u?.name || u?.email || "admin").toLowerCase().replace(/[^a-z0-9]+/g, "");
    return login || "admin";
  };

  for (const p of fPosts) {
    const id = wpId++;
    wpIdByPost.set(p.id, id);
    const html = blocksToHtml(p.content);
    const status = p.status === "published" ? "publish" : p.status === "trash" ? "trash" : "draft";
    out.push(
      ...itemHead(p.title, `${siteUrl}/${p.slug}`, rfc822(p.publishedAt), creatorOf(p.authorId), `${siteUrl}/?p=${id}`, html, p.excerpt ?? ""),
      ...docMeta(id, p.slug, status, "post", wpDate(p.createdAt), wpDate(p.publishedAt)),
    );
    const cat = p.categoryId ? catById.get(p.categoryId) : undefined;
    if (cat) out.push(`\t\t<category domain="category" nicename="${esc(cat.slug)}">${cdata(cat.name)}</category>`);
    for (const t of tagsByPost.get(p.id) ?? []) {
      out.push(`\t\t<category domain="post_tag" nicename="${esc(t.slug)}">${cdata(t.name)}</category>`);
    }
    // Rank Math-compatible SEO meta, so the round trip keeps titles.
    if (p.seoTitle) out.push(`\t\t<wp:postmeta>\n\t\t\t<wp:meta_key>${cdata("rank_math_title")}</wp:meta_key>\n\t\t\t<wp:meta_value>${cdata(p.seoTitle)}</wp:meta_value>\n\t\t</wp:postmeta>`);
    if (p.seoDescription) out.push(`\t\t<wp:postmeta>\n\t\t\t<wp:meta_key>${cdata("rank_math_description")}</wp:meta_key>\n\t\t\t<wp:meta_value>${cdata(p.seoDescription)}</wp:meta_value>\n\t\t</wp:postmeta>`);
    if (p.featuredImage) {
      // The attachment item below carries the file; this links them.
      out.push(`\t\t<wp:postmeta>\n\t\t\t<wp:meta_key>${cdata("_thumbnail_url")}</wp:meta_key>\n\t\t\t<wp:meta_value>${cdata(p.featuredImage)}</wp:meta_value>\n\t\t</wp:postmeta>`);
    }
    for (const c of commentRows.filter((c) => c.postId === p.id)) {
      out.push(
        `\t\t<wp:comment>`,
        `\t\t\t<wp:comment_id>${c.id}</wp:comment_id>`,
        `\t\t\t<wp:comment_author>${cdata(c.authorName)}</wp:comment_author>`,
        `\t\t\t<wp:comment_author_email>${cdata(c.authorEmail)}</wp:comment_author_email>`,
        `\t\t\t<wp:comment_author_url>${cdata(c.authorUrl ?? "")}</wp:comment_author_url>`,
        `\t\t\t<wp:comment_author_IP>${cdata(c.ip ?? "")}</wp:comment_author_IP>`,
        `\t\t\t<wp:comment_date>${cdata(wpDate(c.createdAt))}</wp:comment_date>`,
        `\t\t\t<wp:comment_date_gmt>${cdata(wpDate(c.createdAt))}</wp:comment_date_gmt>`,
        `\t\t\t<wp:comment_content>${cdata(c.content)}</wp:comment_content>`,
        `\t\t\t<wp:comment_approved>${cdata(c.status === "approved" ? "1" : c.status === "spam" ? "spam" : "0")}</wp:comment_approved>`,
        `\t\t\t<wp:comment_type>${cdata("")}</wp:comment_type>`,
        `\t\t\t<wp:comment_parent>${c.parentId ?? 0}</wp:comment_parent>`,
        `\t\t\t<wp:comment_user_id>0</wp:comment_user_id>`,
        `\t\t</wp:comment>`,
      );
    }
    out.push(`\t</item>`, ``);
  }

  for (const pg of fPages) {
    const id = wpId++;
    wpIdByPage.set(pg.id, id);
    const html = blocksToHtml(pg.content);
    const status = pg.status === "published" ? "publish" : "draft";
    out.push(
      ...itemHead(pg.title, `${siteUrl}/${pg.slug}`, rfc822(pg.publishedAt), creatorOf(pg.authorId), `${siteUrl}/?page_id=${id}`, html, pg.seoDescription ?? ""),
      ...docMeta(id, pg.slug, status, "page", wpDate(pg.createdAt), wpDate(pg.publishedAt)),
      `\t</item>`,
      ``,
    );
  }

  // Media as attachments, so WordPress imports the library entries.
  for (const m of mediaRows) {
    const id = wpId++;
    const date = wpDate(m.createdAt);
    out.push(
      `\t<item>`,
      `\t\t<title>${esc(m.originalName)}</title>`,
      `\t\t<link>${esc(m.url)}</link>`,
      `\t\t<pubDate>${rfc822(m.createdAt)}</pubDate>`,
      `\t\t<dc:creator>${cdata("admin")}</dc:creator>`,
      `\t\t<guid isPermaLink="false">${esc(m.url)}</guid>`,
      `\t\t<description></description>`,
      `\t\t<content:encoded>${cdata("")}</content:encoded>`,
      `\t\t<excerpt:encoded>${cdata("")}</excerpt:encoded>`,
      `\t\t<wp:post_id>${id}</wp:post_id>`,
      `\t\t<wp:post_date>${cdata(date)}</wp:post_date>`,
      `\t\t<wp:post_date_gmt>${cdata(date)}</wp:post_date_gmt>`,
      `\t\t<wp:comment_status>${cdata("open")}</wp:comment_status>`,
      `\t\t<wp:ping_status>${cdata("open")}</wp:ping_status>`,
      `\t\t<wp:post_name>${cdata(m.filename.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-"))}</wp:post_name>`,
      `\t\t<wp:status>${cdata("inherit")}</wp:status>`,
      `\t\t<wp:post_parent>0</wp:post_parent>`,
      `\t\t<wp:menu_order>0</wp:menu_order>`,
      `\t\t<wp:post_type>${cdata("attachment")}</wp:post_type>`,
      `\t\t<wp:post_password>${cdata("")}</wp:post_password>`,
      `\t\t<wp:is_sticky>0</wp:is_sticky>`,
      `\t\t<wp:attachment_url>${cdata(m.url)}</wp:attachment_url>`,
      `\t\t<wp:postmeta>`,
      `\t\t\t<wp:meta_key>${cdata("_wp_attached_file")}</wp:meta_key>`,
      `\t\t\t<wp:meta_value>${cdata(m.url.split("/").slice(-2).join("/"))}</wp:meta_value>`,
      `\t\t</wp:postmeta>`,
      `\t</item>`,
      ``,
    );
  }

  out.push(`</channel>`, `</rss>`, ``);
  return out.join("\n");
}
