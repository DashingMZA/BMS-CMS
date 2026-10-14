"use client";

import { useEffect, useState } from "react";
import Header from "@/components/admin/Header";
import { cn } from "@/lib/utils";
import { AD_POSITIONS, parsePlacements, serializePlacements, type AdPlacements } from "@/lib/ads";
import { Check, Loader2, Save, Megaphone } from "lucide-react";

type Tab = "adstxt" | "placements";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "adstxt",     label: "ads.txt",       hint: "Served at /ads.txt — authorizes your ad sellers" },
  { id: "placements", label: "Ad Placements", hint: "Where ads appear on the site" },
];

export default function AdsPage() {
  const [adsTxt, setAdsTxt] = useState("");
  const [placements, setPlacements] = useState<AdPlacements>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Tab>("adstxt");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setAdsTxt(d.settings?.ads_txt ?? "");
        setPlacements(parsePlacements(d.settings?.ads_placements));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const setPlacement = (id: string, patch: Partial<{ enabled: boolean; code: string }>) =>
    setPlacements((p) => {
      const prev = p[id] ?? { enabled: false, code: "" };
      return { ...p, [id]: { ...prev, ...patch } };
    });

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ads_txt: adsTxt,
        ads_placements: serializePlacements(placements) ?? "",
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      window.alert((data as { error?: string }).error || "Ad settings could not be saved. Try again.");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) {
    return (
      <>
        <Header title="Ads" />
        <div className="p-8 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading ad settings…
        </div>
      </>
    );
  }

  const current = TABS.find((t) => t.id === tab)!;
  const activeCount = AD_POSITIONS.filter((p) => placements[p.id]?.enabled && placements[p.id]?.code.trim()).length;

  return (
    <>
      <Header title="Ads" />
      <div className="p-6 max-w-4xl">
        <div className="flex gap-1 border-b border-slate-200 mb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-4 py-2 text-sm rounded-t-lg border border-b-0 -mb-px transition-colors",
                tab === t.id ? "bg-white border-slate-200 text-slate-900 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"
              )}
            >
              {t.label}
              {t.id === "placements" && activeCount > 0 && (
                <span className="ml-2 text-xs bg-brand-100 text-brand-700 rounded-full px-2 py-0.5">{activeCount}</span>
              )}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400 mb-6">{current.hint}</p>

        <form onSubmit={save} className="space-y-6">
          {tab === "adstxt" && (
            <div className="card p-5">
              <h2 className="font-semibold text-sm mb-2">ads.txt</h2>
              <p className="text-xs text-slate-400 mb-3">
                Served at <code className="font-mono">/ads.txt</code>. Lists the sellers authorized
                to sell your ad inventory — AdSense requires it. One entry per line, e.g.{" "}
                <code className="font-mono">google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0</code>.
                Leave empty to serve a commented placeholder.
              </p>
              <textarea
                className="input font-mono text-xs"
                rows={12}
                value={adsTxt}
                onChange={(e) => setAdsTxt(e.target.value)}
                placeholder="google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0"
                spellCheck={false}
              />
            </div>
          )}

          {tab === "placements" && (
            <div className="space-y-4">
              <div className="card p-5">
                <div className="flex items-start gap-3">
                  <Megaphone size={18} className="text-slate-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Paste your ad code (AdSense units, banners, affiliate snippets) into any position
                    and switch it on. Code is rendered exactly as entered. Positions with no code —
                    or switched off — render nothing, so the layout is untouched until you use them.
                  </p>
                </div>
              </div>
              {AD_POSITIONS.map((pos) => {
                const p = placements[pos.id] ?? { enabled: false, code: "" };
                return (
                  <div key={pos.id} className="card p-5">
                    <div className="flex items-center justify-between mb-1">
                      <h2 className="font-semibold text-sm">{pos.label}</h2>
                      <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={p.enabled}
                          onChange={(e) => setPlacement(pos.id, { enabled: e.target.checked })}
                          className="rounded"
                        />
                        Enabled
                      </label>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">{pos.hint}</p>
                    <textarea
                      className="input font-mono text-xs"
                      rows={4}
                      value={p.code}
                      onChange={(e) => setPlacement(pos.id, { code: e.target.value })}
                      placeholder='<ins class="adsbygoogle" ...></ins>'
                      spellCheck={false}
                    />
                  </div>
                );
              })}
            </div>
          )}

          <button type="submit" disabled={saving} className="btn-primary inline-flex items-center gap-2">
            {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
            {saved ? "Saved" : "Save Ad Settings"}
          </button>
        </form>
      </div>
    </>
  );
}
