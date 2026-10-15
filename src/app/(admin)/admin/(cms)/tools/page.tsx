"use client";

import { useRef, useState } from "react";
import Header from "@/components/admin/Header";
import { cn } from "@/lib/utils";
import { ArrowDownToLine, ArrowUpFromLine, FileUp, Loader2, Download, Wrench } from "lucide-react";

type Tab = "import" | "export";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "import", label: "Import from WP", hint: "Upload a WordPress export (.xml) — posts, pages, categories, tags, media and comments come across" },
  { id: "export", label: "Export for WP", hint: "Download this site's content as a WordPress (.xml) file — WordPress's own importer reads it" },
];

interface ImportReport {
  ok: boolean;
  dryRun: boolean;
  created: Record<string, number>;
  skipped: Record<string, number>;
  restored: Record<string, number>;
  notes: string[];
}

export default function ToolsPage() {
  const [tab, setTab] = useState<Tab>("import");

  return (
    <>
      <Header title="Tools" />
      <div className="p-6 max-w-4xl">
        <div className="flex gap-1 border-b border-slate-200 mb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-4 py-2 text-sm rounded-t-lg border border-b-0 -mb-px transition-colors inline-flex items-center gap-2",
                tab === t.id ? "bg-white border-slate-200 text-slate-900 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"
              )}
            >
              {t.id === "import" ? <ArrowDownToLine size={14} /> : <ArrowUpFromLine size={14} />}
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400 mb-6">{TABS.find((t) => t.id === tab)!.hint}</p>

        {tab === "import" ? <ImportTab /> : <ExportTab />}
      </div>
    </>
  );
}

function ImportTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [language, setLanguage] = useState("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFileName(f ? f.name : "");
    setError("");
    setReport(null);
  };

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const f = fileRef.current?.files?.[0];
    if (!f) {
      setError("Choose a WordPress .xml export file first.");
      return;
    }
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const fd = new FormData();
      fd.set("file", f);
      fd.set("dryRun", String(dryRun));
      fd.set("overwrite", String(overwrite));
      fd.set("language", language);
      const res = await fetch("/api/tools/import-wp", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "The import failed.");
        return;
      }
      setReport(data as ImportReport);
      if (!dryRun) setDryRun(true); // next run previews again by default
    } catch {
      setError("The import failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const rows = report
    ? Object.keys({ ...report.created, ...report.skipped, ...report.restored }).sort()
    : [];

  return (
    <form onSubmit={run} className="space-y-4">
      <div className="card p-5">
        <div className="flex items-start gap-3 mb-4">
          <Wrench size={18} className="text-slate-400 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-500 leading-relaxed">
            Takes the <code className="font-mono">.xml</code> file WordPress makes under{" "}
            <strong>Tools → Export</strong> and brings in its posts, pages, categories, tags,
            media records and comments. Anything already here is skipped, so running the same
            file twice is safe. Featured images, excerpts and Rank Math SEO titles carry over;
            article bodies arrive as HTML Embed blocks, rendering exactly as they did on WordPress.
          </p>
        </div>

        <label className="label">WordPress export file (.xml)</label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="btn-secondary inline-flex items-center gap-2"
          >
            <FileUp size={15} /> Choose file
          </button>
          <span className="text-sm text-slate-500 truncate">{fileName || "No file chosen"}</span>
        </div>
        <input ref={fileRef} type="file" accept=".xml,text/xml" className="hidden" onChange={pick} />

        <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4">
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} className="rounded" />
            Dry run — preview only, import nothing
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="rounded" />
            Overwrite — put existing posts back to the file&rsquo;s version
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            Language
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="input py-1 text-xs"
            >
              <option value="en">English</option>
              <option value="ur">Urdu</option>
              <option value="ar">Arabic</option>
              <option value="es">Spanish</option>
            </select>
          </label>
        </div>
      </div>

      {error && (
        <div className="card p-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</div>
      )}

      {report && (
        <div className="card p-5">
          <h2 className="font-semibold text-sm mb-3">
            {report.dryRun ? "Dry run — what would happen" : "Import complete"}
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="py-2 font-medium">Type</th>
                <th className="py-2 font-medium text-right">Created</th>
                <th className="py-2 font-medium text-right">Skipped</th>
                <th className="py-2 font-medium text-right">Restored</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k} className="border-b border-slate-50">
                  <td className="py-2">{k.replace(/_/g, " ")}</td>
                  <td className="py-2 text-right text-green-700">{report.created[k] ?? 0}</td>
                  <td className="py-2 text-right text-slate-500">{report.skipped[k] ?? 0}</td>
                  <td className="py-2 text-right text-amber-700">{report.restored[k] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.notes.length > 0 && (
            <ul className="mt-3 space-y-1">
              {report.notes.map((n, i) => (
                <li key={i} className="text-xs text-slate-500">• {n}</li>
              ))}
            </ul>
          )}
          {report.dryRun && (
            <p className="mt-3 text-xs text-slate-500">
              Looks right? Uncheck <strong>Dry run</strong> and run again to import for real.
            </p>
          )}
        </div>
      )}

      <button type="submit" disabled={busy} className="btn-primary inline-flex items-center gap-2">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowDownToLine size={15} />}
        {busy ? "Importing…" : dryRun ? "Preview import" : "Import from WordPress"}
      </button>
    </form>
  );
}

function ExportTab() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/tools/export-wp");
      if (!res.ok) {
        setError("The export failed. Try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `bms-wordpress-export-${stamp}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("The export failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-start gap-3 mb-4">
          <Wrench size={18} className="text-slate-400 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-500 leading-relaxed">
            Downloads this site&rsquo;s posts, pages, categories, tags, media and comments as a{" "}
            <code className="font-mono">.xml</code> file in WordPress&rsquo;s own export format (WXR 1.2).
            On the WordPress side, <strong>Tools → Import → WordPress</strong> reads it directly —
            so moving out is as easy as moving in.
          </p>
        </div>
        {error && <p className="text-sm text-red-700 mb-3">{error}</p>}
        <button onClick={download} disabled={busy} className="btn-primary inline-flex items-center gap-2">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          {busy ? "Building…" : "Download WordPress XML"}
        </button>
      </div>
    </div>
  );
}
