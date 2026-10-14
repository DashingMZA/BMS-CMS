import { getSiteSettings } from "@/lib/settings";
import { getPlacement, parsePlacements } from "@/lib/ads";
import { htmlSig } from "@/lib/htmlSig";

/**
 * Renders the ad code saved for one position, or nothing.
 *
 * A Server Component: the code comes from the settings table, which only the
 * server reads. The markup goes in with dangerouslySetInnerHTML and carries
 * `data-bms-html`, so ScriptRunner executes its <script> tags after a
 * client-side navigation — the same mechanism HTML Embed blocks use.
 */
export default async function AdSlot({ position, className }: { position: string; className?: string }) {
  const settings = await getSiteSettings();
  const placement = getPlacement(parsePlacements(settings.ads_placements), position);
  if (!placement) return null;

  return (
    <div
      className={className ?? "bms-adslot"}
      data-ad-position={position}
      data-bms-html={htmlSig(placement.code)}
      dangerouslySetInnerHTML={{ __html: placement.code }}
    />
  );
}
