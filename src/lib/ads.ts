import { htmlSig } from "./htmlSig";

// Ads: ad blocks (Ad Inserter style), page targeting, and the ads.txt file.
//
// Ad blocks are stored in the settings table as JSON under `ads_blocks`, the
// ads.txt content as plain text under `ads_txt` — so they ship with the
// database, not the code, and never need a rebuild. The frontend reads them
// through getSiteSettings(), like everything else.
//
// The Header & Footer tab in the admin edits `script_head` / `script_body_end`
// — the same keys the Customizer's Custom Scripts panel uses — so the two
// stay in sync automatically.

export interface AdBlockPositionDef {
  id: string;
  label: string;
  /** Whether this position needs a paragraph/image number. */
  needsCount?: boolean;
}

/**
 * Where a block can be inserted. The ids are stable: the admin screen and the
 * frontend both reference them, so renaming one would orphan saved blocks.
 *
 * `disabled` is a pseudo-position: it is only ever chosen in the admin
 * dropdown, never rendered on the frontend. Order matches Ad Inserter.
 */
export const AD_BLOCK_POSITIONS: AdBlockPositionDef[] = [
  { id: "disabled",         label: "Disabled" },
  { id: "before_menu",      label: "Before menu" },
  { id: "after_menu",       label: "After menu" },
  { id: "before_title",     label: "Before title" },
  { id: "after_title",      label: "After title" },
  { id: "before_post",      label: "Before post" },
  { id: "before_content",   label: "Before content" },
  { id: "before_paragraph", label: "Before paragraph", needsCount: true },
  { id: "after_paragraph",  label: "After paragraph", needsCount: true },
  { id: "before_image",     label: "Before image", needsCount: true },
  { id: "after_image",      label: "After image", needsCount: true },
  { id: "after_content",    label: "After content" },
  { id: "after_post",       label: "After post" },
  { id: "before_excerpt",   label: "Before excerpt" },
  { id: "after_excerpt",    label: "After excerpt" },
  { id: "between_posts",    label: "Between posts" },
  { id: "before_comments",  label: "Before comments" },
  { id: "between_comments", label: "Between comments" },
  { id: "after_comments",   label: "After comments" },
  { id: "footer",           label: "Footer" },
  { id: "after_footer",     label: "After footer" },
  { id: "sidebar",          label: "Sidebar" },
];

/** Where inside the sidebar a sidebar-positioned block renders. */
export const AD_SIDEBAR_POSITIONS = [
  { id: "top",    label: "Top" },
  { id: "middle", label: "Middle" },
  { id: "bottom", label: "Bottom" },
  { id: "custom", label: "After widget…" },
] as const;

export type AdSidebarPosition = (typeof AD_SIDEBAR_POSITIONS)[number]["id"];

export interface AdAlignmentDef {
  id: string;
  label: string;
  /** CSS class applied to the wrapper. Empty = theme default. */
  className: string;
}

export const AD_ALIGNMENTS: AdAlignmentDef[] = [
  { id: "default",     label: "Default",     className: "" },
  { id: "left",        label: "Left",        className: "bms-ad-left" },
  { id: "center",      label: "Center",      className: "bms-ad-center" },
  { id: "right",       label: "Right",       className: "bms-ad-right" },
  { id: "float_left",  label: "Float left",  className: "bms-ad-float-left" },
  { id: "float_right", label: "Float right", className: "bms-ad-float-right" },
  { id: "no_wrapping", label: "No wrapping", className: "bms-ad-no-wrap" },
];

/** Page kinds a block can target. Keys match the `pageKind` the frontend passes. */
export const AD_PAGE_KINDS = [
  { id: "posts",    label: "Posts" },
  { id: "homepage", label: "Homepage" },
  { id: "category", label: "Category pages" },
  { id: "static",   label: "Static pages" },
  { id: "search",   label: "Search pages" },
  { id: "archive",  label: "Tag / Archive pages" },
] as const;

export type AdPageKind = (typeof AD_PAGE_KINDS)[number]["id"];

export interface AdBlock {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
  position: string;
  /** For before/after paragraph/image: which one (1-based). */
  count: number;
  alignment: string;
  /** For the sidebar position: top, middle, or bottom of the sidebar. */
  sidebarPosition: AdSidebarPosition;
  /** For the sidebar "custom" position: which sidebar (1 or 2). */
  sidebarId: 1 | 2;
  /** For the sidebar position: keep the ad visible while scrolling (CSS sticky). */
  sticky: boolean;
  /** Optional schedule: ISO date strings. The ad only shows within this window. */
  startAt: string | null;
  endAt: string | null;
  pages: Record<AdPageKind, boolean>;
}

function defaultPages(): Record<AdPageKind, boolean> {
  return { posts: true, homepage: true, category: true, static: true, search: true, archive: true };
}

export function newAdBlock(index: number): AdBlock {
  return {
    id: `block-${Date.now()}-${index}`,
    name: `Block ${index + 1}`,
    code: "",
    enabled: false,
    position: "disabled",
    count: 2,
    alignment: "center",
    sidebarPosition: "top",
    sidebarId: 1,
    sticky: false,
    startAt: null,
    endAt: null,
    pages: defaultPages(),
  };
}

/** A block counts as live when it has code and is not on the Disabled pseudo-position. */
export function isBlockLive(b: AdBlock): boolean {
  if (!b.enabled || b.position === "disabled" || b.code.trim().length === 0) return false;
  // Schedule: the block only shows within its start/end window.
  const now = Date.now();
  if (b.startAt && new Date(b.startAt).getTime() > now) return false;
  if (b.endAt && new Date(b.endAt).getTime() < now) return false;
  return true;
}

/** The stored JSON (or null/garbage) as an array of blocks. */
export function parseAdBlocks(raw: string | null | undefined): AdBlock[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.map((b, i) => {
      const r = (b ?? {}) as Record<string, unknown>;
      const pages = defaultPages();
      const rp = r.pages as Record<string, unknown> | undefined;
      if (rp && typeof rp === "object") {
        // Only override keys the saved block actually has. A block saved
        // before a page kind existed (or with a partial pages object) keeps
        // the default `true` for the missing kinds instead of flipping them
        // to false via `!!undefined`.
        for (const k of Object.keys(pages) as AdPageKind[]) {
          if (k in rp) pages[k] = !!rp[k];
        }
      }
      return {
        id: typeof r.id === "string" && r.id ? r.id : `block-${i}`,
        name: typeof r.name === "string" && r.name ? r.name : `Block ${i + 1}`,
        code: typeof r.code === "string" ? r.code : "",
        enabled: !!r.enabled,
        position: typeof r.position === "string" && AD_BLOCK_POSITIONS.some((p) => p.id === r.position) ? r.position : "disabled",
        count: typeof r.count === "number" && r.count > 0 ? Math.trunc(r.count) : 2,
        alignment: typeof r.alignment === "string" && AD_ALIGNMENTS.some((a) => a.id === r.alignment) ? r.alignment : "center",
        sidebarPosition: typeof r.sidebarPosition === "string" && AD_SIDEBAR_POSITIONS.some((s) => s.id === r.sidebarPosition)
          ? (r.sidebarPosition as AdSidebarPosition)
          : "top",
        sidebarId: r.sidebarId === 2 ? 2 : 1,
        sticky: !!r.sticky,
        startAt: typeof r.startAt === "string" && r.startAt ? r.startAt : null,
        endAt: typeof r.endAt === "string" && r.endAt ? r.endAt : null,
        pages,
      } as AdBlock;
    });
  } catch {
    return [];
  }
}

/** Null when there is nothing to store, so the settings row stays empty. */
export function serializeAdBlocks(blocks: AdBlock[] | null | undefined): string | null {
  if (!blocks || blocks.length === 0) return null;
  const kept = blocks.filter((b) => b.code.trim() || isBlockLive(b));
  return kept.length ? JSON.stringify(kept) : null;
}

/** Blocks for one position, live, targeting this page kind. */
export function blocksFor(blocks: AdBlock[], position: string, pageKind: string): AdBlock[] {
  return blocks.filter(
    (b) => isBlockLive(b) && b.position === position && (b.pages[pageKind as AdPageKind] ?? false)
  );
}

/** Sidebar blocks for one sidebar slot (top/middle/bottom), live, for this page kind. */
export function sidebarBlocksFor(blocks: AdBlock[], slot: AdSidebarPosition, pageKind: string): AdBlock[] {
  return blocksFor(blocks, "sidebar", pageKind).filter((b) => b.sidebarPosition === slot);
}

/**
 * The ad block as an HTML string — the same markup AdBlockView renders.
 * `data-bms-html` carries the fingerprint ScriptRunner uses to execute the
 * block's <script> tags after a client-side navigation.
 */
export function adBlockHtml(block: AdBlock): string {
  const align = adAlignmentClass(block.alignment);
  const cls = ["bms-adblock", align].filter(Boolean).join(" ");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<div class="${esc(cls)}" data-ad-block="${esc(block.id)}" data-bms-html="${htmlSig(block.code)}">${block.code}</div>`;
}

/**
 * Matches `[adinserter block="1"]` or `[adinserter name="Block 1"]`
 * (single or double quotes, extra whitespace tolerated).
 */
const AD_SHORTCODE_RE = /\[adinserter\s+(?:block\s*=\s*["'](\d+)["']|name\s*=\s*["']([^"']+)["'])\s*\]/i;

export function parseAdShortcode(text: string): { block?: number; name?: string } | null {
  const m = AD_SHORTCODE_RE.exec(text.trim());
  if (!m) return null;
  if (m[1] !== undefined) return { block: parseInt(m[1], 10) };
  return { name: m[2].trim() };
}

/**
 * Finds the block a shortcode refers to: `block="N"` is the 1-based number
 * shown in the admin list, `name="…"` matches the block name (case-insensitive).
 * Shortcodes are manual placements, so they resolve even when the block's
 * automatic position is Disabled — but never for a block with no code.
 */
export function findAdBlockByShortcode(
  blocks: AdBlock[],
  ref: { block?: number; name?: string }
): AdBlock | null {
  const withCode = blocks.filter((b) => b.code.trim());
  if (ref.block !== undefined) {
    const b = withCode[ref.block - 1];
    return b ?? null;
  }
  if (ref.name) {
    const want = ref.name.toLowerCase();
    return withCode.find((b) => b.name.toLowerCase() === want) ?? null;
  }
  return null;
}

/** The alignment class for a block. */
export function adAlignmentClass(alignment: string): string {
  return AD_ALIGNMENTS.find((a) => a.id === alignment)?.className ?? "";
}

export const DEFAULT_ADS_TXT = `# ads.txt — authorized digital sellers for this site.
# https://iabtechlab.com/ads-txt
#
# Replace the example line below with your own seller entries.
# For AdSense, use: google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
#
# google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0
`;

/** Block types counted as paragraphs for in-content insertion. */
const PARAGRAPH_TYPES = new Set(["paragraph", "heading"]);
/** Block types counted as images for in-content insertion. */
const IMAGE_TYPES = new Set(["image", "imageAdvanced", "gallery"]);

export interface AdMarker {
  type: "adSlot";
  props: { blockId: string };
}

/**
 * Injects before/after paragraph/image ads into a raw HTML string (an
 * `htmlEmbed` block's markup — which is what WordPress-imported articles
 * are). Paragraphs are `<p>…</p>` elements, images `<img>` tags, counted in
 * document order. Returns the HTML unchanged when nothing matches.
 *
 * Featured images are rendered separately (ContentImage), never inside this
 * HTML, so they are never counted.
 */
export function injectHtmlAds(html: string, adBlocks: AdBlock[], pageKind: string): string {
  const wants = adBlocks.filter(
    (b) =>
      isBlockLive(b) &&
      (b.pages[pageKind as AdPageKind] ?? false) &&
      ["before_paragraph", "after_paragraph", "before_image", "after_image"].includes(b.position)
  );
  if (wants.length === 0 || !html.includes("<")) return html;

  const paras: { start: number; end: number }[] = [];
  const images: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  const pRe = /<p(\s[^>]*)?>[\s\S]*?<\/p\s*>/gi;
  while ((m = pRe.exec(html)) !== null) paras.push({ start: m.index, end: m.index + m[0].length });
  const imgRe = /<img\b[^>]*>/gi;
  while ((m = imgRe.exec(html)) !== null) images.push({ start: m.index, end: m.index + m[0].length });

  const insertions: { pos: number; html: string }[] = [];
  for (const b of wants) {
    const adHtml = adBlockHtml(b);
    const n = b.count - 1;
    if (b.position === "before_paragraph" && paras[n]) insertions.push({ pos: paras[n].start, html: adHtml });
    else if (b.position === "after_paragraph" && paras[n]) insertions.push({ pos: paras[n].end, html: adHtml });
    else if (b.position === "before_image" && images[n]) insertions.push({ pos: images[n].start, html: adHtml });
    else if (b.position === "after_image" && images[n]) insertions.push({ pos: images[n].end, html: adHtml });
  }
  if (insertions.length === 0) return html;

  // Back to front, so earlier insertions don't shift later positions.
  insertions.sort((a, b) => b.pos - a.pos);
  let out = html;
  for (const ins of insertions) out = out.slice(0, ins.pos) + ins.html + out.slice(ins.pos);
  return out;
}

/**
 * Returns a copy of the block list with ad markers inserted at the requested
 * before/after paragraph/image positions. Markers are `{ type: "adSlot" }`
 * blocks carrying the ad block's id; BlockRenderer renders them, everything
 * else ignores unknown types, so a stale marker is harmless.
 *
 * `htmlEmbed` blocks (WordPress imports) get their ads injected directly
 * into the HTML string, since they have no structured paragraphs to count.
 */
export function injectContentAds<T extends Record<string, unknown>>(
  blocks: T[],
  adBlocks: AdBlock[],
  pageKind: string
): T[] {
  if (!Array.isArray(blocks) || blocks.length === 0) return blocks;
  const wants = adBlocks.filter(
    (b) =>
      isBlockLive(b) &&
      (b.pages[pageKind as AdPageKind] ?? false) &&
      ["before_paragraph", "after_paragraph", "before_image", "after_image"].includes(b.position)
  );
  if (wants.length === 0) return blocks;

  const out: T[] = [];
  let paras = 0;
  let images = 0;
  const marker = (b: AdBlock): T => ({ type: "adSlot", props: { blockId: b.id } }) as unknown as T;

  for (const blk of blocks) {
    const t = blk?.type;
    // An HTML embed carries its paragraphs as markup, not blocks.
    if (t === "htmlEmbed") {
      const props = (blk?.props ?? {}) as Record<string, unknown>;
      if (typeof props.html === "string" && props.html.includes("<")) {
        const injected = injectHtmlAds(props.html, adBlocks, pageKind);
        if (injected !== props.html) {
          out.push({ ...blk, props: { ...props, html: injected } });
          continue;
        }
      }
      out.push(blk);
      continue;
    }
    const isPara = typeof t === "string" && PARAGRAPH_TYPES.has(t);
    const isImage = typeof t === "string" && IMAGE_TYPES.has(t);
    if (isPara) paras++;
    if (isImage) images++;

    // Before-insertions go ahead of the block.
    for (const b of wants) {
      if (b.position === "before_paragraph" && isPara && paras === b.count) out.push(marker(b));
      if (b.position === "before_image" && isImage && images === b.count) out.push(marker(b));
    }
    out.push(blk);
    // After-insertions go behind it.
    for (const b of wants) {
      if (b.position === "after_paragraph" && isPara && paras === b.count) out.push(marker(b));
      if (b.position === "after_image" && isImage && images === b.count) out.push(marker(b));
    }
  }
  return out;
}
