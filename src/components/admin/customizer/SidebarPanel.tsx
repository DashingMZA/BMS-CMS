"use client";

import { useState } from "react";

// The sidebar widget editor.
//
// Six slots, each either empty or holding one widget. Slots reorder by drag:
// the widgets move, the slot ids stay put, so saved configs keep working.

import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import {
  SIDEBAR_WIDGET_IDS,
  SIDEBAR2_WIDGET_IDS,
  SIDEBAR_WIDGET_TYPES,
  parseSidebarWidgets,
  type CustomizerSettings,
  type SidebarWidget,
} from "@/lib/appearanceSettings";

type SetFn = (k: keyof CustomizerSettings, v: string) => void;

const inputCls =
  "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40";

const HAS_COUNT = new Set(["recent", "categories", "tags", "archives", "comments"]);

function SidebarSlots({
  ids,
  widgets,
  save,
  label,
}: {
  ids: readonly string[];
  widgets: Record<string, SidebarWidget>;
  save: (next: Record<string, SidebarWidget>) => void;
  label: string;
}) {
  const [dragId, setDragId] = useState<string | null>(null);

  const patch = (id: string, changes: Partial<SidebarWidget>) =>
    save({ ...widgets, [id]: { ...(widgets[id] ?? { type: "text" }), ...changes } as SidebarWidget });
  const clear = (id: string) => {
    const next = { ...widgets };
    delete next[id];
    save(next);
  };
  // Drag a slot to reorder: the widgets move, the slot ids stay put.
  const moveSlot = (fromId: string, toIndex: number) => {
    const fromIndex = ids.indexOf(fromId);
    if (fromIndex < 0 || fromIndex === toIndex) return;
    const ordered = ids.map((id) => widgets[id]);
    const [moved] = ordered.splice(fromIndex, 1);
    ordered.splice(toIndex, 0, moved);
    const next: Record<string, SidebarWidget> = {};
    ids.forEach((id, i) => {
      if (ordered[i]) next[id] = ordered[i];
    });
    save(next);
  };

  return (
    <div>
      <p className="mb-2 text-[11px] text-slate-400">Drag a slot by its header to reorder the widgets.</p>
      {ids.map((id, i) => {
        const w = widgets[id];
        return (
          <div
            key={id}
            draggable
            onDragStart={() => setDragId(id)}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragId && dragId !== id) moveSlot(dragId, i);
              setDragId(null);
            }}
            className={`mb-4 rounded-lg border p-3 transition-colors ${
              dragId === id ? "border-brand-400 bg-brand-50" : "border-slate-200"
            }`}
          >
            <div className="mb-2 flex cursor-grab items-center justify-between active:cursor-grabbing">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Slot {i + 1}</span>
              {w && (
                <button onClick={() => clear(id)} className="text-slate-400 hover:text-red-600" title="Remove widget">
                  <Trash2 size={12} />
                </button>
              )}
            </div>

            <select
              className={cn(inputCls, "mb-2")}
              value={w?.type ?? ""}
              onChange={(e) =>
                e.target.value ? patch(id, { type: e.target.value as SidebarWidget["type"] }) : clear(id)
              }
            >
              <option value="">— Empty —</option>
              {SIDEBAR_WIDGET_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>

            {w && (
              <>
                <input
                  className={cn(inputCls, "mb-2")}
                  value={w.title ?? ""}
                  placeholder="Heading (optional)"
                  onChange={(e) => patch(id, { title: e.target.value })}
                />

                {HAS_COUNT.has(w.type) && (
                  <input
                    type="number"
                    min={1}
                    max={20}
                    className={cn(inputCls, "mb-2")}
                    value={w.count ?? 5}
                    onChange={(e) => patch(id, { count: parseInt(e.target.value) || 5 })}
                    placeholder="How many"
                  />
                )}

                {w.type === "text" && (
                  <textarea
                    rows={4}
                    className={inputCls}
                    value={w.text ?? ""}
                    placeholder="Text shown in the sidebar"
                    onChange={(e) => patch(id, { text: e.target.value })}
                  />
                )}

                {w.type === "html" && (
                  <textarea
                    rows={6}
                    className={`${inputCls} font-mono text-xs`}
                    value={w.html ?? ""}
                    placeholder="<div>Custom HTML…</div>"
                    onChange={(e) => patch(id, { html: e.target.value })}
                  />
                )}

                {w.type === "links" && (
                  <div className="space-y-2">
                    {(w.links ?? []).map((l, li) => (
                      <div key={li} className="flex gap-1.5">
                        <input
                          className={cn(inputCls, "text-xs")}
                          value={l.label}
                          placeholder="Label"
                          onChange={(e) => {
                            const links = [...(w.links ?? [])];
                            links[li] = { ...links[li], label: e.target.value };
                            patch(id, { links });
                          }}
                        />
                        <input
                          className={cn(inputCls, "text-xs")}
                          value={l.url}
                          placeholder="/url"
                          onChange={(e) => {
                            const links = [...(w.links ?? [])];
                            links[li] = { ...links[li], url: e.target.value };
                            patch(id, { links });
                          }}
                        />
                        <button
                          onClick={() => patch(id, { links: (w.links ?? []).filter((_, x) => x !== li) })}
                          className="shrink-0 px-1 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => patch(id, { links: [...(w.links ?? []), { label: "", url: "" }] })}
                      className="text-[11px] font-medium text-brand-600 hover:text-brand-700"
                    >
                      + Add link
                    </button>
                  </div>
                )}

                {w.type === "social" && (
                  <div className="space-y-2">
                    {(w.social ?? []).map((s, si) => (
                      <div key={si} className="flex gap-1.5">
                        <input
                          className={cn(inputCls, "text-xs")}
                          value={s.network}
                          placeholder="Network (e.g. Twitter)"
                          onChange={(e) => {
                            const social = [...(w.social ?? [])];
                            social[si] = { ...social[si], network: e.target.value };
                            patch(id, { social });
                          }}
                        />
                        <input
                          className={cn(inputCls, "text-xs")}
                          value={s.url}
                          placeholder="https://…"
                          onChange={(e) => {
                            const social = [...(w.social ?? [])];
                            social[si] = { ...social[si], url: e.target.value };
                            patch(id, { social });
                          }}
                        />
                        <button
                          onClick={() => patch(id, { social: (w.social ?? []).filter((_, x) => x !== si) })}
                          className="shrink-0 px-1 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => patch(id, { social: [...(w.social ?? []), { network: "", url: "" }] })}
                      className="text-[11px] font-medium text-brand-600 hover:text-brand-700"
                    >
                      + Add profile
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SidebarPanel({ s, set }: { s: CustomizerSettings; set: SetFn }) {
  const [tab, setTab] = useState<"sidebar1" | "sidebar2">("sidebar1");
  const widgets1 = parseSidebarWidgets(s.sidebar_widgets);
  const widgets2 = parseSidebarWidgets(s.sidebar2_widgets);

  return (
    <div>
      <p className="mb-4 text-[11px] leading-relaxed text-slate-400">
        Shows on any page or post whose layout is Left Sidebar or Right Sidebar.
        Choose which sidebar a layout shows below.
      </p>

      <div className="mb-4">
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
          Sidebar for left/right layouts
        </label>
        <select
          className={inputCls}
          value={s.sidebar_choice || "sidebar1"}
          onChange={(e) => set("sidebar_choice", e.target.value)}
        >
          <option value="sidebar1">Sidebar 1</option>
          <option value="sidebar2">Sidebar 2</option>
        </select>
      </div>

      <div className="mb-4 space-y-2">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Hide on devices
        </span>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={s.sidebar_hide_tablet === "true"}
            onChange={(e) => set("sidebar_hide_tablet", e.target.checked ? "true" : "false")}
            className="h-4 w-4 rounded border-slate-300"
          />
          Hide on tablet (≤1024px)
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={s.sidebar_hide_mobile === "true"}
            onChange={(e) => set("sidebar_hide_mobile", e.target.checked ? "true" : "false")}
            className="h-4 w-4 rounded border-slate-300"
          />
          Hide on mobile (≤767px)
        </label>
      </div>

      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1">
        {(["sidebar1", "sidebar2"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-md py-1.5 text-[12px] font-medium transition-colors",
              tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            {t === "sidebar1" ? "Sidebar 1" : "Sidebar 2"}
          </button>
        ))}
      </div>

      {tab === "sidebar1" ? (
        <SidebarSlots
          ids={SIDEBAR_WIDGET_IDS}
          widgets={widgets1}
          save={(next) => set("sidebar_widgets", JSON.stringify(next))}
          label="Sidebar 1"
        />
      ) : (
        <SidebarSlots
          ids={SIDEBAR2_WIDGET_IDS}
          widgets={widgets2}
          save={(next) => set("sidebar2_widgets", JSON.stringify(next))}
          label="Sidebar 2"
        />
      )}
    </div>
  );
}
