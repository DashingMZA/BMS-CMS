// Ads: placements and the ads.txt file.
//
// Ad code (AdSense units, custom banners, affiliate snippets) is stored in
// the settings table — `ads_placements` as JSON, `ads_txt` as plain text —
// so it ships with the database, not the code, and never needs a rebuild.
// The frontend reads it through getSiteSettings(), like everything else.

export interface AdPositionDef {
  id: string;
  label: string;
  hint: string;
}

/**
 * Every place an ad can appear. The ids are stable: content and the admin
 * screen both reference them, so renaming one would orphan saved code.
 */
export const AD_POSITIONS: AdPositionDef[] = [
  { id: "header_top",    label: "Header top",        hint: "Above the site header, on every page" },
  { id: "after_menu",    label: "After menu",        hint: "Below the header navigation" },
  { id: "after_title",   label: "After post title",  hint: "On posts and pages, under the title area" },
  { id: "after_p2",      label: "After 2nd paragraph", hint: "Inside post/page content" },
  { id: "after_p4",      label: "After 4th paragraph", hint: "Inside post/page content" },
  { id: "after_p6",      label: "After 6th paragraph", hint: "Inside post/page content" },
  { id: "after_content", label: "After content",     hint: "Below the post/page body" },
  { id: "after_posts",   label: "After post list",   hint: "On archive pages, below the list" },
  { id: "sidebar",       label: "Sidebar",           hint: "In the sidebar, where one is shown" },
  { id: "footer_top",    label: "Above footer",      hint: "Just above the footer" },
  { id: "footer_bottom", label: "Below footer",      hint: "At the very bottom of the page" },
];

export interface AdPlacement {
  enabled: boolean;
  code: string;
}

export type AdPlacements = Record<string, AdPlacement>;

/** The stored JSON (or null/garbage) as a placements map. */
export function parsePlacements(raw: string | null | undefined): AdPlacements {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const out: AdPlacements = {};
    for (const { id } of AD_POSITIONS) {
      const p = v[id] as { enabled?: unknown; code?: unknown } | undefined;
      if (p && typeof p === "object") {
        out[id] = {
          enabled: !!p.enabled,
          code: typeof p.code === "string" ? p.code : "",
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Null when nothing is stored, so the settings row stays empty. */
export function serializePlacements(p: AdPlacements | null | undefined): string | null {
  if (!p) return null;
  const kept: AdPlacements = {};
  for (const { id } of AD_POSITIONS) {
    const v = p[id];
    if (v && (v.enabled || v.code.trim())) kept[id] = { enabled: !!v.enabled, code: v.code };
  }
  return Object.keys(kept).length ? JSON.stringify(kept) : null;
}

/** The placement for one position, or null when it should not render. */
export function getPlacement(placements: AdPlacements, position: string): AdPlacement | null {
  const p = placements[position];
  if (!p || !p.enabled || !p.code.trim()) return null;
  return p;
}

export const DEFAULT_ADS_TXT = `# ads.txt — authorized digital sellers for this site.
# https://iabtechlab.com/ads-txt
#
# Replace the example line below with your own seller entries.
# For AdSense, use: google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
#
# google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0
`;

/** Paragraph-like block types that in-content ads count. */
const PARAGRAPH_TYPES = new Set(["paragraph", "heading"]);

/**
 * Returns a copy of the block list with ad markers inserted after the 2nd,
 * 4th and 6th paragraph-like blocks. Markers are `{ type: "adSlot" }` blocks
 * that BlockRenderer renders as the placement's code; unknown types are
 * ignored by everything else, so a stale marker is harmless.
 */
export function injectContentAds<T extends Record<string, unknown>>(
  blocks: T[],
  placements: AdPlacements
): T[] {
  if (!Array.isArray(blocks) || blocks.length === 0) return blocks;
  const wants = [
    { after: 2, position: "after_p2" },
    { after: 4, position: "after_p4" },
    { after: 6, position: "after_p6" },
  ].filter((w) => getPlacement(placements, w.position));
  if (wants.length === 0) return blocks;

  const out: T[] = [];
  let paras = 0;
  for (const b of blocks) {
    out.push(b);
    const t = b?.type;
    if (typeof t === "string" && PARAGRAPH_TYPES.has(t)) {
      paras++;
      for (const w of wants) {
        if (w.after === paras) {
          out.push({ type: "adSlot", props: { position: w.position } } as unknown as T);
        }
      }
    }
  }
  return out;
}
