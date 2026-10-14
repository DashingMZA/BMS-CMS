import { getSiteSettings } from "@/lib/settings";
import { adAlignmentClass, blocksFor, parseAdBlocks, type AdBlock } from "@/lib/ads";
import { htmlSig } from "@/lib/htmlSig";

/**
 * Renders the ad markup for one block. The code goes in with
 * dangerouslySetInnerHTML and carries `data-bms-html`, so ScriptRunner
 * executes its <script> tags after a client-side navigation — the same
 * mechanism HTML Embed blocks use.
 */
export function AdBlockView({ block }: { block: AdBlock }) {
  const align = adAlignmentClass(block.alignment);
  return (
    <div
      className={["bms-adblock", align].filter(Boolean).join(" ")}
      data-ad-block={block.id}
      data-bms-html={htmlSig(block.code)}
      dangerouslySetInnerHTML={{ __html: block.code }}
    />
  );
}

/**
 * Renders every enabled block for one position on this kind of page.
 * A Server Component: the blocks come from the settings table, which only
 * the server reads. Renders nothing when no block matches.
 */
export default async function AdBlocks({
  position,
  pageKind,
  className,
}: {
  position: string;
  pageKind: string;
  className?: string;
}) {
  const settings = await getSiteSettings();
  const blocks = blocksFor(parseAdBlocks(settings.ads_blocks), position, pageKind);
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
 * inserts inside content. Returns null when the block is gone or disabled.
 */
export async function AdBlockById({ blockId, pageKind: _pageKind }: { blockId: string; pageKind?: string }) {
  const settings = await getSiteSettings();
  const block = parseAdBlocks(settings.ads_blocks).find((b) => b.id === blockId);
  if (!block || !block.enabled || !block.code.trim()) return null;
  return <AdBlockView block={block} />;
}
