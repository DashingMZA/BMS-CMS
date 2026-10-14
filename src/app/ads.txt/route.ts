import { getSiteSettings } from "@/lib/settings";
import { LS_CACHE } from "@/lib/lscache";
import { DEFAULT_ADS_TXT } from "@/lib/ads";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const settings = await getSiteSettings();
  const body = (settings.ads_txt || "").trim() || DEFAULT_ADS_TXT;

  return new Response(body + "\n", {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
      [LS_CACHE]: "public, max-age=3600",
    },
  });
}
