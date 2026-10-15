// WordPress WXR (WordPress eXtended RSS) import.
//
// Parses a WordPress export `.xml` file and converts it to the BMS site-export
// shape (`SiteExport` in lib/exportSite.ts), which `importSite` already knows
// how to insert — so the Tools → Import from WP screen reuses the same
// id-remapping, skip-if-exists and dry-run machinery as the JSON import.
//
// Only the content tables are carried: users (by email), categories, tags,
// posts, pages, post_tags, media (records + URLs; the files themselves are
// copied separately, same as the .zip import notes) and comments.

import { XMLParser } from "fast-xml-parser";
import type { SiteExport } from "./exportSite";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // CDATA lands as a plain string value, like normal text.
  trimValues: false,
});

// fast-xml-parser returns a single object when a tag appears once and an
// array when it repeats — normalize to always-array.
function arr<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    // CDATA parsed as { __cdata: "..." }; tagged text with attributes as { "#text": "...", "@_…": … }
    if (typeof o["__cdata"] === "string") return o["__cdata"];
    if (typeof o["#text"] === "string") return o["#text"];
  }
  return "";
}

function isoDate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  // RFC822 ("Fri, 11 Oct 2024 01:26:32 +0000") or MySQL ("2024-10-11 01:26:32")
  const d = new Date(t.replace(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/, "$1-$2-$3T$4:$5:$6Z"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function stripHtml(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface WxrTerm {
  nicename: string;
  name: string;
}

export interface WxrComment {
  wpId: number;
  author: string;
  authorEmail: string;
  authorUrl: string;
  authorIp: string;
  date: string | null;
  content: string;
  approved: string;
  parent: number;
}

export interface WxrItem {
  wpId: number;
  title: string;
  link: string;
  pubDate: string | null;
  creator: string;
  postDate: string | null;
  postDateGmt: string | null;
  postModified: string | null;
  postName: string;
  status: string;
  postType: string;
  postParent: number;
  content: string;
  excerpt: string;
  categories: WxrTerm[];
  tags: WxrTerm[];
  meta: Record<string, string>;
  comments: WxrComment[];
  attachmentUrl: string;
  mimeType: string;
}

export interface WxrParsed {
  siteName: string;
  siteUrl: string;
  authors: { login: string; email: string; displayName: string }[];
  categories: { nicename: string; name: string; parent: string }[];
  tags: { nicename: string; name: string }[];
  items: WxrItem[];
}

/** Parse a WXR XML string. Throws on malformed XML. */
export function parseWxr(xml: string): WxrParsed {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const rss = doc["rss"] as Record<string, unknown>;
  if (!rss || typeof rss !== "object") throw new Error("Not a WordPress export file (no <rss> root).");
  const channel = rss["channel"] as Record<string, unknown>;
  if (!channel || typeof channel !== "object") throw new Error("Not a WordPress export file (no <channel>).");
  if (!("wp:wxr_version" in channel)) throw new Error("Not a WordPress export file (no wp:wxr_version).");

  const authors = arr(channel["wp:author"]).map((a) => {
    const o = a as Record<string, unknown>;
    return {
      login: str(o["wp:author_login"]),
      email: str(o["wp:author_email"]),
      displayName: str(o["wp:author_display_name"]) || str(o["wp:author_login"]),
    };
  });

  const categories = arr(channel["wp:category"]).map((c) => {
    const o = c as Record<string, unknown>;
    return {
      nicename: str(o["wp:category_nicename"]),
      name: str(o["wp:cat_name"]),
      parent: str(o["wp:category_parent"]),
    };
  });

  const tags = arr(channel["wp:tag"]).map((t) => {
    const o = t as Record<string, unknown>;
    return {
      nicename: str(o["wp:tag_slug"]),
      name: str(o["wp:tag_name"]),
    };
  });

  const items: WxrItem[] = arr(channel["item"]).map((it) => {
    const o = it as Record<string, unknown>;
    const meta: Record<string, string> = {};
    for (const m of arr(o["wp:postmeta"])) {
      const mo = m as Record<string, unknown>;
      meta[str(mo["wp:meta_key"])] = str(mo["wp:meta_value"]);
    }
    const categories: WxrTerm[] = [];
    const tags: WxrTerm[] = [];
    for (const c of arr(o["category"])) {
      const co = c as Record<string, unknown>;
      const term = { nicename: str(co["@_nicename"]), name: str(co) };
      if (co["@_domain"] === "category") categories.push(term);
      else if (co["@_domain"] === "post_tag") tags.push(term);
    }
    const comments: WxrComment[] = arr(o["wp:comment"]).map((cm) => {
      const cmo = cm as Record<string, unknown>;
      return {
        wpId: parseInt(str(cmo["wp:comment_id"]), 10) || 0,
        author: str(cmo["wp:comment_author"]),
        authorEmail: str(cmo["wp:comment_author_email"]),
        authorUrl: str(cmo["wp:comment_author_url"]),
        authorIp: str(cmo["wp:comment_author_IP"]),
        date: isoDate(str(cmo["wp:comment_date"])),
        content: str(cmo["wp:comment_content"]),
        approved: str(cmo["wp:comment_approved"]),
        parent: parseInt(str(cmo["wp:comment_parent"]), 10) || 0,
      };
    });
    return {
      wpId: parseInt(str(o["wp:post_id"]), 10) || 0,
      title: str(o["title"]),
      link: str(o["link"]),
      pubDate: isoDate(str(o["pubDate"])),
      creator: str(o["dc:creator"]),
      postDate: isoDate(str(o["wp:post_date"])),
      postDateGmt: isoDate(str(o["wp:post_date_gmt"])),
      postModified: isoDate(str(o["wp:post_modified"])),
      postName: str(o["wp:post_name"]),
      status: str(o["wp:status"]),
      postType: str(o["wp:post_type"]),
      postParent: parseInt(str(o["wp:post_parent"]), 10) || 0,
      content: str(o["content:encoded"]),
      excerpt: str(o["excerpt:encoded"]).trim(),
      categories,
      tags,
      meta,
      comments,
      attachmentUrl: str(o["wp:attachment_url"]),
      mimeType: "",
    };
  });
  // Mime type lives in the attachment's postmeta? No — derive from extension.
  for (const it of items) {
    if (it.postType === "attachment") {
      const parts = it.attachmentUrl.split(".");
      const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
      it.mimeType =
        ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", mp4: "video/mp4", pdf: "application/pdf" } as Record<string, string>)[ext] ??
        "application/octet-stream";
    }
  }

  return {
    siteName: str(channel["title"]) || "WordPress Import",
    siteUrl: str(channel["link"]),
    authors,
    categories,
    tags,
    items,
  };
}

function mimeFromUrl(url: string): string {
  const clean = url.split("?")[0];
  const parts = clean.split(".");
  const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
  return (
    ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", mp4: "video/mp4", pdf: "application/pdf" } as Record<string, string>)[ext] ??
    "application/octet-stream"
  );
}

/**
 * Convert parsed WXR to the BMS site-export shape, so `importSite` can insert
 * it with its usual id-remapping and skip-if-exists behaviour.
 *
 * WordPress HTML becomes one `htmlEmbed` block per document — the same
 * container the manual .xml→.json converter uses — so the imported article
 * renders exactly as it did on WordPress.
 */
export function wxrToSiteExport(wxr: WxrParsed, language = "en"): SiteExport {
  const now = new Date().toISOString();
  const attachUrlById = new Map<number, string>();
  const media: Record<string, unknown>[] = [];
  let mid = 1;
  for (const it of wxr.items) {
    if (it.postType !== "attachment" || !it.attachmentUrl) continue;
    const filename = it.attachmentUrl.split("/").pop() ?? `file-${mid}`;
    // Dimensions hide inside PHP-serialized _wp_attachment_metadata.
    const sm = it.meta["_wp_attachment_metadata"] ?? "";
    const w = /"width";i:(\d+)/.exec(sm)?.[1];
    const h = /"height";i:(\d+)/.exec(sm)?.[1];
    media.push({
      id: mid,
      filename,
      originalName: filename,
      url: it.attachmentUrl,
      mimeType: it.mimeType || mimeFromUrl(it.attachmentUrl),
      size: 0,
      width: w ? parseInt(w, 10) : null,
      height: h ? parseInt(h, 10) : null,
      blur: null,
      alt: it.meta["_wp_attachment_image_alt"] || null,
      caption: null,
      uploadedById: null,
      createdAt: it.postDate ?? now,
    });
    attachUrlById.set(it.wpId, it.attachmentUrl);
    mid++;
  }

  const catByNicename = new Map<string, number>();
  const categories: Record<string, unknown>[] = [];
  let cid = 1;
  const addCat = (nicename: string, name: string, parentNicename?: string) => {
    if (!nicename || catByNicename.has(nicename)) return;
    catByNicename.set(nicename, cid);
    categories.push({
      id: cid, name: name || nicename, slug: nicename, description: null,
      language, direction: null, translationGroup: null, parentId: null,
      _wpParent: parentNicename || null,
      archiveColor: null, archiveHoverColor: null, headerImage: null,
      archiveColumns: "default", archiveCardStyle: "default", archiveDesign: null,
      seoTitle: null, seoDescription: null, focusKeyword: null, canonicalUrl: null,
      ogTitle: null, ogDescription: null, ogImage: null,
      noIndex: false, noFollow: false, noArchive: false, noImageIndex: false, noSnippet: false,
      createdAt: now,
    });
    cid++;
  };
  for (const c of wxr.categories) addCat(c.nicename, c.name, c.parent);
  // Second pass: wire parent categories — WP gives the parent's nicename.
  for (const cat of categories) {
    const wpParent = cat["_wpParent"] as string | null;
    if (wpParent) cat["parentId"] = catByNicename.get(wpParent) ?? null;
    delete cat["_wpParent"];
  }

  const tagByNicename = new Map<string, number>();
  const tags: Record<string, unknown>[] = [];
  let tid = 1;
  const addTag = (nicename: string, name: string) => {
    if (!nicename || tagByNicename.has(nicename)) return;
    tagByNicename.set(nicename, tid);
    tags.push({
      id: tid, name: name || nicename, slug: nicename, description: null,
      language, direction: null, translationGroup: null, createdAt: now,
    });
    tid++;
  };
  for (const t of wxr.tags) addTag(t.nicename, t.name);

  const users: Record<string, unknown>[] = [];
  const seenUsers = new Set<string>();
  const addUser = (login: string, email: string, displayName: string) => {
    if (!login || seenUsers.has(login)) return;
    seenUsers.add(login);
    users.push({
      id: `wp-${login}`, email: email || `${login}@example.com`,
      name: displayName || login, role: "author",
      emailVerified: null, createdAt: now, updatedAt: now,
    });
  };
  for (const a of wxr.authors) addUser(a.login, a.email, a.displayName);

  const posts: Record<string, unknown>[] = [];
  const pages: Record<string, unknown>[] = [];
  const postTags: Record<string, unknown>[] = [];
  const comments: Record<string, unknown>[] = [];
  const commentIdMap = new Map<number, number>(); // wp comment id -> file comment id
  let pid = 1, pgid = 1, cmid = 1;

  const toDoc = (it: WxrItem, id: number) => {
    for (const c of it.categories) addCat(c.nicename, c.name);
    for (const t of it.tags) addTag(t.nicename, t.name);
    addUser(it.creator, "", it.creator);

    const plain = stripHtml(it.content);
    const excerpt = it.excerpt || (plain.length > 200 ? plain.slice(0, 200) + "…" : plain) || null;
    const thumbId = parseInt(it.meta["_thumbnail_id"] ?? "", 10);
    const blocks = it.content.trim()
      ? [{ id: `wp-${id}-1`, type: "htmlEmbed", props: { html: it.content }, content: [] }]
      : [];
    const firstCat = it.categories[0]?.nicename;
    return {
      id,
      title: it.title || "(no title)",
      slug: it.postName || it.link.replace(/\/$/, "").split("/").pop() || `wp-${id}`,
      excerpt,
      content: blocks,
      searchText: plain.slice(0, 5000) || null,
      featuredImage: (thumbId && attachUrlById.get(thumbId)) || null,
      status: it.status === "publish" ? "published" : it.status === "draft" ? "draft" : "draft",
      categoryId: (firstCat && catByNicename.get(firstCat)) || null,
      authorId: it.creator ? `wp-${it.creator}` : null,
      seoTitle: it.meta["rank_math_title"] || null,
      seoDescription: it.meta["rank_math_description"] || null,
      seoKeywords: it.meta["rank_math_focus_keyword"] || null,
      ogTitle: it.meta["rank_math_facebook_title"] || null,
      ogDescription: it.meta["rank_math_facebook_description"] || null,
      ogImage: null,
      twitterTitle: it.meta["rank_math_twitter_title"] || null,
      twitterDescription: it.meta["rank_math_twitter_description"] || null,
      twitterImage: null,
      canonicalUrl: it.meta["rank_math_canonical_url"] || null,
      noIndex: false, noFollow: false, robotsAdvanced: null,
      schemaType: "Article", schemas: null,
      transparentHeader: "default", showTitle: "default", postLayout: "default",
      contentStyle: "default", verticalSpacing: "default", showFeaturedImage: "default",
      showComments: "default", deletedAt: null, cssClasses: null,
      disableHeader: false, disableFooter: false,
      language, direction: null, translationGroup: null,
      publishedAt: it.pubDate ?? it.postDateGmt ?? it.postDate,
      scriptHead: null, scriptBodyEnd: null, customCss: null,
      createdAt: it.postDate ?? now,
      updatedAt: it.postModified ?? it.postDate ?? now,
    };
  };

  // Comments need their document's new id, so collect them after.
  const pendingComments: { it: WxrItem; docId: number; isPost: boolean }[] = [];

  for (const it of wxr.items) {
    if (it.postType === "post") {
      if (it.status === "trash") continue;
      posts.push(toDoc(it, pid));
      if (it.comments.length) pendingComments.push({ it, docId: pid, isPost: true });
      for (const t of it.tags) {
        const tagId = tagByNicename.get(t.nicename);
        if (tagId) postTags.push({ postId: pid, tagId });
      }
      pid++;
    } else if (it.postType === "page") {
      if (it.status === "trash") continue;
      pages.push(toDoc(it, pgid));
      if (it.comments.length) pendingComments.push({ it, docId: pgid, isPost: false });
      pgid++;
    }
  }

  for (const { it, docId, isPost } of pendingComments) {
    for (const c of it.comments) {
      // importSite only understands pending|approved|spam|trash.
      const approved = c.approved === "1";
      const status = approved ? "approved" : c.approved === "spam" ? "spam" : c.approved === "trash" ? "trash" : "pending";
      commentIdMap.set(c.wpId, cmid);
      comments.push({
        id: cmid,
        postId: isPost ? docId : null,
        pageId: isPost ? null : docId,
        parentId: null, // remapped in the second pass below
        authorName: c.author || "Anonymous",
        authorEmail: c.authorEmail || "",
        authorUrl: c.authorUrl || null,
        content: c.content,
        status,
        ip: c.authorIp || null,
        userAgent: null,
        createdAt: c.date ?? now,
        _wpParent: c.parent,
      });
      cmid++;
    }
  }
  // Second pass: threaded replies — WP parent ids are file-global comment ids.
  for (const c of comments) {
    const wpParent = c["_wpParent"] as number;
    if (wpParent) c["parentId"] = commentIdMap.get(wpParent) ?? null;
    delete c["_wpParent"];
  }

  const data: Record<string, unknown[]> = {
    users, categories, tags, posts, pages, post_tags: postTags, media,
    menus: [], nav_items: [], elements: [], redirects: [],
    comments,
    form_submissions: [], site_settings: [],
  };
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  return {
    version: 1,
    exportedAt: now,
    site: { name: wxr.siteName, url: wxr.siteUrl },
    counts,
    data,
  };
}
