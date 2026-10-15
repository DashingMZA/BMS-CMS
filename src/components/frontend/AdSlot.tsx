import { getSiteSettings } from "@/lib/settings";
import { adAlignmentClass, blocksFor, findAdBlockByShortcode, isBlockLive, parseAdBlocks, sidebarBlocksFor, type AdBlock, type AdSidebarPosition } from "@/lib/ads";
import { htmlSig } from "@/lib/htmlSig";

/**
 * Renders the ad markup for one block. The code goes in with
 * dangerouslySetInnerHTML and carries `data-bms-html`, so ScriptRunner
 * executes its <script> tags after a client-side navigation — the same
 * mechanism HTML Embed blocks use.
 */
export function AdBlockView({ block }: { block: AdBlock }) {
  const align = adAlignmentClass(block.alignment);
  const deviceCls = block.device === "desktop" ? "bms-ad-desktop" : block.device === "mobile" ? "bms-ad-mobile" : "";
  return (
    <div
      className={["bms-adblock", align, deviceCls, block.sticky && block.position === "sidebar" ? "bms-adblock-sticky" : ""].filter(Boolean).join(" ")}
      data-ad-block={block.id}
      data-bms-html={htmlSig(block.code)}
      dangerouslySetInnerHTML={{ __html: block.code }}
    />
  );
}

/**
 * Renders every live block for one position on this kind of page.
 * A Server Component: the blocks come from the settings table, which only
 * the server reads. Renders nothing when no block matches.
 *
 * Pass `slot` with `position="sidebar"` to render only one sidebar slot
 * (top/middle/bottom).
 */
export default async function AdBlocks({
  position,
  pageKind,
  slot,
  className,
  sidebarId,
}: {
  position: string;
  pageKind: string;
  slot?: AdSidebarPosition;
  className?: string;
  /** For sidebar slots: only show ads aimed at this sidebar (1 or 2). */
  sidebarId?: 1 | 2;
}) {
  const settings = await getSiteSettings();
  const parsed = parseAdBlocks(settings.ads_blocks);
  let blocks = slot && position === "sidebar"
    ? sidebarBlocksFor(parsed, slot, pageKind)
    : blocksFor(parsed, position, pageKind);
  if (sidebarId && position === "sidebar") {
    blocks = blocks.filter((b) => (b.sidebarId ?? 1) === sidebarId);
  }
  if (blocks.length === 0) return null;

  return (
    <div className={className}>
      {blocks.map((b) => (
        <AdBlockView key={b.id} block={b} />
      ))}
    </div>
  );
}

/**
 * Renders a single block by id — for the `adSlot` markers BlockRenderer
 * inserts inside content. Returns null when the block is gone, has no code,
 * or is switched off.
 */
export async function AdBlockById({ blockId, pageKind: _pageKind }: { blockId: string; pageKind?: string }) {
  const settings = await getSiteSettings();
  const block = parseAdBlocks(settings.ads_blocks).find((b) => b.id === blockId);
  if (!block || !isBlockLive(block)) return null;
  return <AdBlockView block={block} />;
}

/**
 * Renders a block referenced by an `[adinserter]` shortcode. Shortcodes are
 * manual placements, so they render even when the block's automatic position
 * is Disabled — only a missing block or empty code renders nothing.
 */
export async function AdBlockByShortcode({ shortcodeRef }: { shortcodeRef: { block?: number; name?: string } }) {
  const settings = await getSiteSettings();
  const block = findAdBlockByShortcode(parseAdBlocks(settings.ads_blocks), shortcodeRef);
  if (!block) return null;
  return <AdBlockView block={block} />;
}
