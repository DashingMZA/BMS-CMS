"use client";

import { useEffect, useState } from "react";
import Header from "@/components/admin/Header";
import { cn } from "@/lib/utils";
import {
  AD_ALIGNMENTS,
  AD_BLOCK_POSITIONS,
  AD_PAGE_KINDS,
  AD_SIDEBAR_POSITIONS,
  isBlockLive,
  newAdBlock,
  parseAdBlocks,
  serializeAdBlocks,
  type AdBlock,
  type AdPageKind,
  type AdSidebarPosition,
} from "@/lib/ads";
import { Check, Loader2, Save, Megaphone, Plus, Trash2, Code2, Copy } from "lucide-react";

type Tab = "adstxt" | "blocks" | "headerfooter";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "adstxt",       label: "ads.txt",         hint: "Served at /ads.txt — authorizes your ad sellers" },
  { id: "blocks",       label: "Ad Blocks",       hint: "Ad Inserter-style blocks: code, position, alignment, page targeting" },
  { id: "headerfooter", label: "Header & Footer", hint: "Code for <head> and before </body> — synced with Customizer → Custom Scripts" },
];

export default function AdsPage() {
  const [adsTxt, setAdsTxt] = useState("");
  const [blocks, setBlocks] = useState<AdBlock[]>([]);
  const [scriptHead, setScriptHead] = useState("");
  const [scriptBodyEnd, setScriptBodyEnd] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Tab>("blocks");
  const [widgetCount, setWidgetCount] = useState(0);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setAdsTxt(d.settings?.ads_txt ?? "");
        setBlocks(parseAdBlocks(d.settings?.ads_blocks));
        setScriptHead(d.settings?.script_head ?? "");
        setScriptBodyEnd(d.settings?.script_body_end ?? "");
        // Real sidebar widget count, so "After widget N" only offers N that exist.
        try {
          const w = JSON.parse(d.settings?.sidebar_widgets ?? "{}");
          const ids = ["swidget1", "swidget2", "swidget3", "swidget4"];
          setWidgetCount(ids.filter((id) => w && typeof w === "object" && w[id]).length);
        } catch {
          setWidgetCount(0);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const patchBlock = (id: string, patch: Partial<AdBlock>) =>
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  /** Choosing a position (or Disabled) drives the block's on/off state. */
  const patchPosition = (id: string, position: string) =>
    patchBlock(id, { position, enabled: position !== "disabled" });

  const patchPages = (id: string, kind: AdPageKind, v: boolean) =>
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, pages: { ...b.pages, [kind]: v } } : b)));

  const addBlock = () => setBlocks((bs) => [...bs, newAdBlock(bs.length)]);
  /**
   * Deleting renumbers the blocks that still carry their automatic
   * "Block N" name, so the list reads Block 1, Block 2, … again and the
   * `[adinserter block="N"]` shortcodes keep matching. A block the user
   * renamed themselves keeps its name.
   */
  const removeBlock = (id: string) =>
    setBlocks((bs) =>
      bs
        .filter((b) => b.id !== id)
        .map((b, i) => (/^Block \d+$/.test(b.name) ? { ...b, name: `Block ${i + 1}` } : b))
    );

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ads_txt: adsTxt,
        ads_blocks: serializeAdBlocks(blocks) ?? "",
        // Same keys the Customizer's Custom Scripts panel writes — editing
        // here and editing there are the same edit.
        script_head: scriptHead,
        script_body_end: scriptBodyEnd,
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
  const activeCount = blocks.filter(isBlockLive).length;

  const copyShortcode = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  };

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
              {t.id === "blocks" && activeCount > 0 && (
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

          {tab === "blocks" && (
            <div className="space-y-4">
              <div className="card p-5">
                <div className="flex items-start gap-3">
                  <Megaphone size={18} className="text-slate-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Each block holds one ad unit. Choose where it is inserted, how it aligns,
                    and which kinds of pages show it. Pick <strong>Disabled</strong> to switch
                    a block off — it renders nothing on the site. Use the shortcode under
                    each block to place it manually inside any article.
                  </p>
                </div>
              </div>

              {blocks.map((b, i) => {
                const pos = AD_BLOCK_POSITIONS.find((p) => p.id === b.position);
                const live = isBlockLive(b);
                const shortcode = `[adinserter block="${i + 1}"]`;
                return (
                  <div key={b.id} className="card p-5">
                    <div className="flex items-center justify-between mb-4">
                      <input
                        className="font-semibold text-sm bg-transparent border-b border-transparent hover:border-slate-300 focus:border-brand-500 focus:outline-none px-1 -ml-1"
                        value={b.name}
                        onChange={(e) => patchBlock(b.id, { name: e.target.value })}
                        aria-label="Block name"
                      />
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "text-xs font-medium rounded-full px-2.5 py-1",
                            live ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          )}
                        >
                          {live ? "Enabled" : "Disabled"}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeBlock(b.id)}
                          className="text-slate-400 hover:text-red-600"
                          title="Delete block"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    <label className="label">Ad code</label>
                    <textarea
                      className="input font-mono text-xs mb-4"
                      rows={5}
                      value={b.code}
                      onChange={(e) => patchBlock(b.id, { code: e.target.value })}
                      placeholder='<ins class="adsbygoogle" ...></ins>'
                      spellCheck={false}
                    />

                    <div className="grid sm:grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="label">Insertion</label>
                        <select
                          className="input text-sm"
                          value={b.position}
                          onChange={(e) => patchPosition(b.id, e.target.value)}
                        >
                          {AD_BLOCK_POSITIONS.map((p) => (
                            <option key={p.id} value={p.id}>{p.label}</option>
                          ))}
                        </select>
                      </div>
                      {b.position === "sidebar" && (
                        <div>
                          <label className="label">Sidebar position</label>
                          <select
                            className="input text-sm"
                            value={b.sidebarPosition}
                            onChange={(e) => patchBlock(b.id, { sidebarPosition: e.target.value as AdSidebarPosition })}
                          >
                            {AD_SIDEBAR_POSITIONS.map((s) => (
                              <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                          </select>
                          <label className="flex items-center gap-2 mt-2 text-xs text-slate-600 cursor-pointer">
                            <input
                              type="checkbox"
                              className="w-3.5 h-3.5 rounded border-slate-300"
                              checked={!!b.sticky}
                              onChange={(e) => patchBlock(b.id, { sticky: e.target.checked })}
                            />
                            Sticky — stay visible while scrolling
                          </label>
                        </div>
                      )}
                      {/* Schedule — show the block only within a date window. */}
                      <div>
                        <label className="label">Schedule (optional)</label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="datetime-local"
                            className="input text-sm"
                            value={b.startAt ? b.startAt.slice(0, 16) : ""}
                            onChange={(e) => patchBlock(b.id, { startAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                            title="Show from"
                          />
                          <input
                            type="datetime-local"
                            className="input text-sm"
                            value={b.endAt ? b.endAt.slice(0, 16) : ""}
                            onChange={(e) => patchBlock(b.id, { endAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                            title="Show until"
                          />
                        </div>
                      </div>
                      {b.position === "sidebar" && b.sidebarPosition === "custom" && (
                        <div>
                          <label className="label">After widget</label>
                          <select
                            className="input text-sm"
                            value={Math.max(1, Math.min(b.count || 1, Math.max(1, widgetCount)))}
                            onChange={(e) => patchBlock(b.id, { count: parseInt(e.target.value) || 1 })}
                          >
                            {Array.from({ length: Math.max(1, widgetCount) }, (_, i) => (
                              <option key={i + 1} value={i + 1}>After widget {i + 1}</option>
                            ))}
                          </select>
                          {widgetCount === 0 && (
                            <p className="text-xs opacity-60 mt-1">No sidebar widgets configured yet.</p>
                          )}
                        </div>
                      )}
                      <div>
                        <label className="label">Alignment</label>
                        <select
                          className="input text-sm"
                          value={b.alignment}
                          onChange={(e) => patchBlock(b.id, { alignment: e.target.value })}
                        >
                          {AD_ALIGNMENTS.map((a) => (
                            <option key={a.id} value={a.id}>{a.label}</option>
                          ))}
                        </select>
                      </div>
                      {pos?.needsCount && (
                        <div>
                          <label className="label">{pos.label.replace("Before ", "").replace("After ", "")} number</label>
                          <input
                            type="number"
                            min={1}
                            max={50}
                            className="input text-sm"
                            value={b.count}
                            onChange={(e) => patchBlock(b.id, { count: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                          />
                        </div>
                      )}
                    </div>

                    <label className="label">Show on</label>
                    <div className="flex flex-wrap gap-x-5 gap-y-2 mb-4">
                      {AD_PAGE_KINDS.map((k) => (
                        <label key={k.id} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={b.pages[k.id]}
                            onChange={(e) => patchPages(b.id, k.id, e.target.checked)}
                            className="rounded"
                          />
                          {k.label}
                        </label>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="shrink-0">Shortcode:</span>
                      <code className="font-mono bg-slate-100 rounded px-2 py-1">{shortcode}</code>
                      <button
                        type="button"
                        onClick={() => copyShortcode(shortcode)}
                        className="text-slate-400 hover:text-slate-700"
                        title="Copy shortcode"
                      >
                        <Copy size={13} />
                      </button>
                      <span className="text-slate-400">— paste anywhere in an article to show this ad</span>
                    </div>
                    {i < blocks.length - 1 && <hr className="mt-5 border-slate-100" />}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={addBlock}
                className="btn-secondary inline-flex items-center gap-2"
              >
                <Plus size={15} /> Add ad block
              </button>
            </div>
          )}

          {tab === "headerfooter" && (
            <div className="space-y-4">
              <div className="card p-5">
                <div className="flex items-start gap-3">
                  <Code2 size={18} className="text-slate-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Site-wide code: AdSense verification, analytics, pixels. These are the{" "}
                    <strong>same fields</strong> as Customizer → Custom Scripts — saving here
                    updates that panel too, and vice versa.
                  </p>
                </div>
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-2">Head code</h2>
                <p className="text-xs text-slate-400 mb-3">
                  Injected into <code className="font-mono">&lt;head&gt;</code> — analytics, verification tags, AdSense auto-ads script.
                </p>
                <textarea
                  className="input font-mono text-xs"
                  rows={7}
                  value={scriptHead}
                  onChange={(e) => setScriptHead(e.target.value)}
                  placeholder='<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-..."></script>'
                  spellCheck={false}
                />
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-2">Footer code</h2>
                <p className="text-xs text-slate-400 mb-3">
                  Injected before the closing <code className="font-mono">&lt;/body&gt;</code> tag — chat widgets, pixels.
                </p>
                <textarea
                  className="input font-mono text-xs"
                  rows={7}
                  value={scriptBodyEnd}
                  onChange={(e) => setScriptBodyEnd(e.target.value)}
                  spellCheck={false}
                />
              </div>
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
