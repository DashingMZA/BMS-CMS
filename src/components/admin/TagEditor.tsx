"use client";

// Edit Tag — everything a tag can say about itself.
//
// Tags used to be editable only as a row in a list: name, slug and a one-line
// description. That is the right shape for a rename and the wrong one for the
// design and SEO settings a term actually carries, so those live here on a
// screen of their own — the same parity categories have.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";

export interface TagRecord {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  language: string;
  direction: string | null;
  archiveColor: string | null;
  archiveHoverColor: string | null;
  headerImage: string | null;
  archiveColumns: string;
  archiveCardStyle: string;
  sidebarChoice: string;
  seoTitle: string | null;
  seoDescription: string | null;
  focusKeyword: string | null;
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  noIndex: boolean;
  noFollow: boolean;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

const inputCls = "w-full text-sm border border-slate-300 rounded-lg px-3 py-2";

export default function TagEditor({ tag }: { tag: TagRecord }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: tag.name,
    slug: tag.slug,
    description: tag.description ?? "",
    archiveColor: tag.archiveColor ?? "",
    archiveHoverColor: tag.archiveHoverColor ?? "",
    headerImage: tag.headerImage ?? "",
    archiveColumns: tag.archiveColumns ?? "default",
    archiveCardStyle: tag.archiveCardStyle ?? "default",
    sidebarChoice: tag.sidebarChoice ?? "default",
    seoTitle: tag.seoTitle ?? "",
    seoDescription: tag.seoDescription ?? "",
    focusKeyword: tag.focusKeyword ?? "",
    canonicalUrl: tag.canonicalUrl ?? "",
    ogTitle: tag.ogTitle ?? "",
    ogDescription: tag.ogDescription ?? "",
    ogImage: tag.ogImage ?? "",
    noIndex: tag.noIndex,
    noFollow: tag.noFollow,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/tags/${tag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          description: form.description || null,
          archiveColor: form.archiveColor || null,
          archiveHoverColor: form.archiveHoverColor || null,
          headerImage: form.headerImage || null,
          archiveColumns: form.archiveColumns,
          archiveCardStyle: form.archiveCardStyle,
          sidebarChoice: form.sidebarChoice,
          seoTitle: form.seoTitle || null,
          seoDescription: form.seoDescription || null,
          focusKeyword: form.focusKeyword || null,
          canonicalUrl: form.canonicalUrl || null,
          ogTitle: form.ogTitle || null,
          ogDescription: form.ogDescription || null,
          ogImage: form.ogImage || null,
          noIndex: form.noIndex,
          noFollow: form.noFollow,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not save the tag.");
      }
      router.push("/admin/tags");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the tag.");
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete the tag "${tag.name}"? It is removed from every post that uses it.`)) return;
    const res = await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
    if (res.ok) router.push("/admin/tags");
    else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not delete the tag.");
    }
  }

  return (
    <div className="max-w-3xl">
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-slate-900 text-sm mb-4">Basic</h2>
        <Field label="Name">
          <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Slug">
          <input className={`${inputCls} font-mono text-xs`} value={form.slug} onChange={(e) => set("slug", e.target.value)} />
        </Field>
        <Field label="Description">
          <textarea className={`${inputCls} resize-none`} rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
      </div>

      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-slate-900 text-sm mb-4">Archive Design</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Archive Color">
            <input type="color" value={form.archiveColor || "#000000"} onChange={(e) => set("archiveColor", e.target.value)} className="h-10 w-full rounded-lg border border-slate-300" />
          </Field>
          <Field label="Hover Color">
            <input type="color" value={form.archiveHoverColor || "#000000"} onChange={(e) => set("archiveHoverColor", e.target.value)} className="h-10 w-full rounded-lg border border-slate-300" />
          </Field>
        </div>
        <Field label="Header Image URL" hint="Shown at the top of this tag's archive. Empty = none.">
          <input className={inputCls} value={form.headerImage} onChange={(e) => set("headerImage", e.target.value)} placeholder="https://…" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Archive Columns">
            <select className={inputCls} value={form.archiveColumns} onChange={(e) => set("archiveColumns", e.target.value)}>
              <option value="default">Default</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </Field>
          <Field label="Card Style">
            <select className={inputCls} value={form.archiveCardStyle} onChange={(e) => set("archiveCardStyle", e.target.value)}>
              <option value="default">Default</option>
              <option value="classic">Classic</option>
              <option value="elevated">Elevated</option>
              <option value="bordered">Bordered</option>
              <option value="overlay">Overlay</option>
              <option value="list">List</option>
              <option value="minimal">Minimal</option>
            </select>
          </Field>
          <Field label="Sidebar" hint="Default follows the Customizer's sidebar choice.">
            <select className={inputCls} value={form.sidebarChoice} onChange={(e) => set("sidebarChoice", e.target.value)}>
              <option value="default">Default</option>
              <option value="sidebar1">Sidebar 1</option>
              <option value="sidebar2">Sidebar 2</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-slate-900 text-sm mb-4">SEO</h2>
        <Field label="SEO Title" hint="Empty = the site template.">
          <input className={inputCls} value={form.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} />
        </Field>
        <Field label="Meta Description">
          <textarea className={`${inputCls} resize-none`} rows={2} value={form.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} />
        </Field>
        <Field label="Focus Keyword">
          <input className={inputCls} value={form.focusKeyword} onChange={(e) => set("focusKeyword", e.target.value)} />
        </Field>
        <Field label="Canonical URL" hint="Only when this archive duplicates another page.">
          <input className={inputCls} value={form.canonicalUrl} onChange={(e) => set("canonicalUrl", e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="OG Title">
          <input className={inputCls} value={form.ogTitle} onChange={(e) => set("ogTitle", e.target.value)} />
        </Field>
        <Field label="OG Description">
          <textarea className={`${inputCls} resize-none`} rows={2} value={form.ogDescription} onChange={(e) => set("ogDescription", e.target.value)} />
        </Field>
        <Field label="OG Image URL">
          <input className={inputCls} value={form.ogImage} onChange={(e) => set("ogImage", e.target.value)} placeholder="https://…" />
        </Field>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.noIndex} onChange={(e) => set("noIndex", e.target.checked)} />
            No index
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.noFollow} onChange={(e) => set("noFollow", e.target.checked)} />
            No follow
          </label>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Link href="/admin/tags" className="btn-secondary text-sm">
          <ArrowLeft size={14} /> Back to tags
        </Link>
        <div className="flex gap-2">
          <button type="button" onClick={remove} className="btn-danger text-sm">
            <Trash2 size={14} /> Delete
          </button>
          <button type="button" onClick={save} disabled={saving} className="btn-primary text-sm disabled:opacity-50">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : "Save tag"}
          </button>
        </div>
      </div>
    </div>
  );
}
