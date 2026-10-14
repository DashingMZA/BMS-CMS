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
 */
export const AD_BLOCK_POSITIONS: AdBlockPositionDef[] = [
  { id: "before_post",      label: "Before post" },
  { id: "after_post",       label: "After post" },
  { id: "before_content",   label: "Before content" },
  { id: "after_content",    label: "After content" },
  { id: "before_paragraph", label: "Before paragraph", needsCount: true },
  { id: "after_paragraph",  label: "After paragraph", needsCount: true },
  { id: "before_image",     label: "Before image", needsCount: true },
  { id: "after_image",      label: "After image", needsCount: true },
  { id: "between_posts",    label: "Between posts" },
  { id: "sidebar",          label: "Sidebar" },
  { id: "footer",           label: "Footer" },
];

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
    position: "after_paragraph",
    count: 2,
    alignment: "center",
    pages: defaultPages(),
  };
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
        for (const k of Object.keys(pages) as AdPageKind[]) pages[k] = !!rp[k];
      }
      return {
        id: typeof r.id === "string" && r.id ? r.id : `block-${i}`,
        name: typeof r.name === "string" && r.name ? r.name : `Block ${i + 1}`,
        code: typeof r.code === "string" ? r.code : "",
        enabled: !!r.enabled,
        position: typeof r.position === "string" && AD_BLOCK_POSITIONS.some((p) => p.id === r.position) ? r.position : "after_paragraph",
        count: typeof r.count === "number" && r.count > 0 ? Math.trunc(r.count) : 2,
        alignment: typeof r.alignment === "string" && AD_ALIGNMENTS.some((a) => a.id === r.alignment) ? r.alignment : "center",
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
  const kept = blocks.filter((b) => b.code.trim() || b.enabled);
  return kept.length ? JSON.stringify(kept) : null;
}

/** Blocks for one position, enabled, with code, targeting this page kind. */
export function blocksFor(blocks: AdBlock[], position: string, pageKind: string): AdBlock[] {
  return blocks.filter(
    (b) => b.enabled && b.code.trim() && b.position === position && (b.pages[pageKind as AdPageKind] ?? false)
  );
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
 * Returns a copy of the block list with ad markers inserted at the requested
 * before/after paragraph/image positions. Markers are `{ type: "adSlot" }`
 * blocks carrying the ad block's id; BlockRenderer renders them, everything
 * else ignores unknown types, so a stale marker is harmless.
 */
export function injectContentAds<T extends Record<string, unknown>>(
  blocks: T[],
  adBlocks: AdBlock[],
  pageKind: string
): T[] {
  if (!Array.isArray(blocks) || blocks.length === 0) return blocks;
  const wants = adBlocks.filter(
    (b) =>
      b.enabled &&
      b.code.trim() &&
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
