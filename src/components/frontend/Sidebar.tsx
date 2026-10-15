import Link from "next/link";
import { Fragment } from "react";
import { uiText } from "@/lib/uiText";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { posts, tags, postTags, categories, comments } from "@/lib/db/schema";
import { parseSidebarWidgets, SIDEBAR_WIDGET_IDS, SIDEBAR2_WIDGET_IDS, type SidebarWidget } from "@/lib/appearanceSettings";
import { categoryPath, postPath, searchPath, tagPath } from "@/lib/permalinks";
import { isLive } from "@/lib/publishState";
import { parseAdBlocks, sidebarBlocksFor, type AdBlock } from "@/lib/ads";
import AdBlocks, { AdBlockView } from "./AdSlot";
import SocialIcons from "./SocialIcons";

/**
 * The real sidebar, replacing the placeholder box.
 *
 * Widgets are configured site-wide as one JSON setting, the way footer columns
 * already are. The dynamic types query on render; a site with none of them
 * configured costs no queries at all, which is why the lookups are gated on
 * what is actually in use rather than fetched up front.
 */
export default async function Sidebar(props: {
  settings: Record<string, string>;
  /** Recent posts are this language's; content is not shared across languages. */
  language: string;
  /** Ad targeting kind: "posts" | "static" | "archive" | ... */
  pageKind?: string;
  /** Which sidebar to render: sidebar1 | sidebar2. */
  sidebarId?: string;
}) {
  try {
    return await renderSidebar(props);
  } catch (err) {
    console.error("[Sidebar]", err);
    return null;
  }
}

async function renderSidebar({
  settings,
  language,
  pageKind = "posts",
  sidebarId = "sidebar1",
}: {
  settings: Record<string, string>;
  language: string;
  pageKind?: string;
  /** Which sidebar to render: sidebar1 | sidebar2. */
  sidebarId?: string;
}) {
  const isSecond = sidebarId === "sidebar2";
  const configured = parseSidebarWidgets(isSecond ? settings.sidebar2_widgets : settings.sidebar_widgets);
  const widgetIds = isSecond ? SIDEBAR2_WIDGET_IDS : SIDEBAR_WIDGET_IDS;
  const widgets = widgetIds
    .map((id) => ({ id: id as string, widget: configured[id] as SidebarWidget | undefined }))
    .filter((w): w is { id: string; widget: SidebarWidget } => !!w.widget);

  // Sidebar ads need a sidebar even with no widgets: an empty widget config
  // used to hide top/middle/bottom ad slots too, since this returned null
  // before the AdBlocks below ever rendered.
  const adBlocks = parseAdBlocks(settings.ads_blocks);
  const hasSidebarAds = sidebarBlocksFor(adBlocks, "top", pageKind).length > 0 ||
    sidebarBlocksFor(adBlocks, "middle", pageKind).length > 0 ||
    sidebarBlocksFor(adBlocks, "bottom", pageKind).length > 0 ||
    sidebarBlocksFor(adBlocks, "custom", pageKind).length > 0;
  if (widgets.length === 0 && !hasSidebarAds) return null;

  const needs = (type: SidebarWidget["type"]) => widgets.some((w) => w.widget.type === type);

  const [recent, cats, tagList, archiveMonths, recentComments] = await Promise.all([
    needs("recent")
      ? db.query.posts.findMany({
          where: and(isLive(posts), eq(posts.language, language)),
          orderBy: [desc(posts.publishedAt), desc(posts.id)],
          limit: 10,
          // The date columns are what a dated permalink is built from.
          columns: { id: true, title: true, slug: true, publishedAt: true, createdAt: true, language: true },
        }).catch(() => [])
      : Promise.resolve([]),
    needs("categories")
      ? db.query.categories
          .findMany({
            where: eq(categories.language, language),
            orderBy: [asc(categories.sortOrder), asc(categories.name)],
            columns: { id: true, name: true, slug: true },
          })
          .catch(() => [])
      : Promise.resolve([]),
    needs("tags")
      ? db
          .select({ id: tags.id, name: tags.name, slug: tags.slug, uses: sql<number>`count(${postTags.postId})` })
          .from(tags)
          .leftJoin(postTags, eq(postTags.tagId, tags.id))
          // This language's tags only, for the same reason as categories.
          .where(eq(tags.language, language))
          .groupBy(tags.id)
          .orderBy(desc(sql`count(${postTags.postId})`))
          .limit(20)
          .catch(() => [])
      : Promise.resolve([]),
    needs("archives")
      ? db
          .select({
            year: sql<number>`extract(year from ${posts.publishedAt})`,
            month: sql<number>`extract(month from ${posts.publishedAt})`,
            count: sql<number>`count(${posts.id})`,
          })
          .from(posts)
          .where(and(isLive(posts), eq(posts.language, language)))
          .groupBy(sql`extract(year from ${posts.publishedAt})`, sql`extract(month from ${posts.publishedAt})`)
          .orderBy(desc(sql`extract(year from ${posts.publishedAt})`), desc(sql`extract(month from ${posts.publishedAt})`))
          .limit(24)
          .catch(() => [])
      : Promise.resolve([]),
    needs("comments")
      ? db.query.comments
          .findMany({
            where: eq(comments.status, "approved"),
            orderBy: [desc(comments.createdAt)],
            limit: 10,
            columns: { id: true, authorName: true, content: true, postId: true, pageId: true, createdAt: true },
          })
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  // "Middle" ads sit after the middle widget, not after all of them.
  const midPoint = Math.ceil(widgets.length / 2);
  const firstHalf = widgets.slice(0, midPoint);
  const secondHalf = widgets.slice(midPoint);

  // "After widget N" ads, keyed by their widget number (1-based). A number
  // past the end falls back to the bottom of the sidebar.
  const customAds = new Map<number, AdBlock[]>();
  for (const b of sidebarBlocksFor(parseAdBlocks(settings.ads_blocks), "custom", pageKind)) {
    const n = Math.max(1, Math.min(b.count || 1, widgets.length));
    const list = customAds.get(n) ?? [];
    list.push(b);
    customAds.set(n, list);
  }
  const customAdsAfter = (n: number) =>
    (customAds.get(n) ?? []).map((b) => <AdBlockView key={`custom-${b.id}`} block={b} />);

  const renderWidget = ({ id, widget }: (typeof widgets)[number]) => (
    <section key={id} className="sidebar-widget" data-widget={widget.type}>
      {/* h2, not h3: a widget title is a section heading of the page, the
          same rank as a footer widget's. At h3 it jumped a level from the
          document's `<h1>` whenever the content itself had no headings —
          which is most short posts. */}
      {widget.title && <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">{widget.title}</h2>}

      {widget.type === "search" && (
        <form action={searchPath(language, settings)} className="flex">
          <input
            name="q"
            type="search"
            placeholder={uiText(language).searchPlaceholder}
            aria-label={uiText(language).searchPlaceholder}
            className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
          />
          <button type="submit" className="sr-only">{uiText(language).search}</button>
        </form>
      )}

      {widget.type === "recent" && (
        <ul className="space-y-2 text-sm">
          {recent.slice(0, widget.count ?? 5).map((p) => (
            <li key={p.id}>
              <Link href={postPath(p, settings)} className="opacity-80 hover:opacity-100 hover:underline">
                {p.title}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {widget.type === "categories" && (
        <ul className="space-y-2 text-sm">
          {cats.slice(0, widget.count ?? 10).map((c) => (
            <li key={c.id}>
              <Link href={categoryPath(c.slug, language, settings)} className="opacity-80 hover:opacity-100 hover:underline">
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {widget.type === "tags" && (
        <div className="flex flex-wrap gap-1.5">
          {tagList.slice(0, widget.count ?? 20).map((t) => (
            <Link
              key={t.id}
              href={tagPath(t.slug, language, settings)}
              className="rounded-full border border-black/10 px-2.5 py-1 text-xs opacity-80 transition-opacity hover:opacity-100"
            >
              {t.name}
            </Link>
          ))}
        </div>
      )}

      {widget.type === "archives" && (
        <ul className="space-y-2 text-sm">
          {archiveMonths.slice(0, widget.count ?? 12).map((a) => {
            const d = new Date(Number(a.year), Number(a.month) - 1, 1);
            const label = d.toLocaleDateString(language, { month: "long", year: "numeric" });
            return (
              <li key={`${a.year}-${a.month}`}>
                <Link href={`/${language}/archive/${a.year}/${String(a.month).padStart(2, "0")}`} className="opacity-80 hover:opacity-100 hover:underline">
                  {label} <span className="text-xs opacity-60">({a.count})</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {widget.type === "comments" && (
        <ul className="space-y-3 text-sm">
          {recentComments.slice(0, widget.count ?? 5).map((c) => (
            <li key={c.id} className="opacity-80">
              <span className="font-medium">{c.authorName}</span>
              <span className="opacity-60"> on </span>
              <span className="italic line-clamp-2">{c.content.slice(0, 80)}{c.content.length > 80 ? "…" : ""}</span>
            </li>
          ))}
        </ul>
      )}

      {widget.type === "social" && (widget.social ?? []).filter((s) => s.url).length > 0 && (
        <SocialIcons
          profiles={(widget.social ?? []).filter((s) => s.url).map((s) => [s.network || "Link", s.url])}
        />
      )}

      {widget.type === "links" && (
        <ul className="space-y-2 text-sm">
          {(widget.links ?? []).filter((l) => l.label).map((l, i) => (
            <li key={i}>
              <Link href={l.url || "#"} className="opacity-80 hover:opacity-100 hover:underline">{l.label}</Link>
            </li>
          ))}
        </ul>
      )}

      {widget.type === "text" && widget.text && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed opacity-80">{widget.text}</p>
      )}

      {widget.type === "html" && widget.html && (
        // Admin-configured HTML, like the Custom HTML block — not user input.
        <div className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: widget.html }} />
      )}
    </section>
  );

  return (
    <div className="space-y-8">
      {/* Ad blocks with the "Sidebar" position, "Top" slot. */}
      <AdBlocks position="sidebar" slot="top" pageKind={pageKind} />
      {firstHalf.map((w, i) => (
        <Fragment key={w.id}>
          {renderWidget(w)}
          {customAdsAfter(i + 1)}
        </Fragment>
      ))}
      {/* Ad blocks with the "Sidebar" position, "Middle" slot — after the
          middle widget. */}
      <AdBlocks position="sidebar" slot="middle" pageKind={pageKind} />
      {secondHalf.map((w, i) => (
        <Fragment key={w.id}>
          {renderWidget(w)}
          {customAdsAfter(midPoint + i + 1)}
        </Fragment>
      ))}
      {/* Ad blocks with the "Sidebar" position, "Bottom" slot. */}
      <AdBlocks position="sidebar" slot="bottom" pageKind={pageKind} />
    </div>
  );
}
