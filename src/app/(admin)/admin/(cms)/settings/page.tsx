"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { PERMALINK_STRUCTURES } from "@/lib/permalinks";
import { DATE_FORMATS, LANGUAGES, TEXT_DIRECTIONS, TIME_ZONES, languageLabel } from "@/lib/locale";
import Header from "@/components/admin/Header";
import ImportPanel from "@/components/admin/ImportPanel";
import Link from "next/link";
import { Save, Check, Link2, Search, Paintbrush, ChevronRight, Loader2, Languages , Download } from "lucide-react";

interface Settings {
  site_name: string;
  site_description: string;
  site_url: string;
  hosting_panel_url: string;
  site_language: string;
  site_direction: string;
  admin_language: string;
  admin_direction: string;
  content_languages: string;
  date_format: string;
  site_timezone: string;
  permalink_structure: string;
  permalink_custom: string;
  sitemap_enabled: string;
  sitemap_include_posts: string;
  sitemap_include_pages: string;
  robots_txt: string;
  storage_driver: string;
  storage_s3_bucket: string;
  storage_s3_region: string;
  storage_s3_access_key: string;
  storage_s3_secret: string;
  storage_s3_prefix: string;
  storage_s3_base_url: string;
  storage_r2_bucket: string;
  storage_r2_account_id: string;
  storage_r2_access_key: string;
  storage_r2_secret: string;
  storage_r2_prefix: string;
  storage_r2_base_url: string;
  storage_github_repo: string;
  storage_github_branch: string;
  storage_github_path: string;
  storage_github_token: string;
  storage_github_base_url: string;
}

const DEFAULT_ROBOTS = `User-agent: *
Allow: /
Disallow: /admin$
Disallow: /admin/
Disallow: /api/`;

const defaults: Settings = {
  site_name: "",
  site_description: "",
  site_url: "",
  hosting_panel_url: "",
  site_language: "en",
  site_direction: "auto",
  admin_language: "en",
  admin_direction: "auto",
  content_languages: "en",
  date_format: "medium",
  site_timezone: "UTC",
  permalink_structure: "post-name",
  permalink_custom: "/%year%/%monthnum%/%postname%/",
  sitemap_enabled: "true",
  sitemap_include_posts: "true",
  sitemap_include_pages: "true",
  robots_txt: DEFAULT_ROBOTS,
  storage_driver: "",
  storage_s3_bucket: "",
  storage_s3_region: "us-east-1",
  storage_s3_access_key: "",
  storage_s3_secret: "",
  storage_s3_prefix: "uploads",
  storage_s3_base_url: "",
  storage_r2_bucket: "",
  storage_r2_account_id: "",
  storage_r2_access_key: "",
  storage_r2_secret: "",
  storage_r2_prefix: "uploads",
  storage_r2_base_url: "",
  storage_github_repo: "",
  storage_github_branch: "main",
  storage_github_path: "uploads",
  storage_github_token: "",
  storage_github_base_url: "",
};


const TABS = [
  { id: "general", label: "General" },
  { id: "storage", label: "Media Storage" },
  { id: "language", label: "Language & Region" },
  { id: "permalinks", label: "Permalink Settings" },
  { id: "sitemap", label: "Sitemap & robots.txt" },
  { id: "backup", label: "Export / Import" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Which settings keys belong to which tab — so the amber dot lands on the
    tab that actually has unsaved changes, not just the active one. */
const TAB_KEYS: Record<TabId, string[]> = {
  general: ["site_name", "site_description", "site_url", "hosting_panel_url"],
  storage: [
    "storage_driver",
    "storage_s3_bucket", "storage_s3_region", "storage_s3_access_key", "storage_s3_secret", "storage_s3_prefix", "storage_s3_base_url",
    "storage_r2_bucket", "storage_r2_account_id", "storage_r2_access_key", "storage_r2_secret", "storage_r2_prefix", "storage_r2_base_url",
    "storage_github_repo", "storage_github_branch", "storage_github_path", "storage_github_token", "storage_github_base_url",
  ],
  language: ["site_language", "site_direction", "admin_language", "admin_direction", "content_languages", "date_format", "site_timezone"],
  permalinks: ["permalink_structure", "permalink_custom"],
  sitemap: [],
  backup: [],
};

/** One labelled field in the Media Storage tab. */
function StorageField({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {help && <p className="text-xs text-slate-400 mt-1">{help}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [newLanguage, setNewLanguage] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("general");

  // Stored as one ordered, comma-separated setting; the first entry is the
  // default. Parsed here so the list and the stored string cannot drift.
  const contentLanguageList = (settings.content_languages || "en")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const setContentLanguages = (codes: string[]) =>
    update("content_languages", Array.from(new Set(codes)).join(","));

  /** Promotes a language to default without disturbing the rest of the order. */
  const moveToFront = (codes: string[], code: string) => [code, ...codes.filter((c) => c !== code)];
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  /** Tabs with unsaved changes — drives the amber dots. */
  const [dirtyTabs, setDirtyTabs] = useState<Set<TabId>>(new Set());
  /** Warn once per dirty session, not on every tab switch. */
  const warnedRef = useRef(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setSettings({ ...defaults, ...d.settings });
        setLoading(false);
      });
  }, []);

  // Keys edited on this screen. Save sends only these: it used to post the
  // whole table as loaded (every key, not just this screen's), reverting
  // anything saved elsewhere — Customizer, SEO, Speed — since it opened.
  const changedRef = useRef<Set<string>>(new Set());
  function update(key: keyof Settings, value: string) {
    changedRef.current.add(key);
    // Mark the owning tab dirty so its amber dot lights up.
    const owner = (Object.keys(TAB_KEYS) as TabId[]).find((t) => TAB_KEYS[t].includes(key));
    if (owner) setDirtyTabs((prev) => new Set(prev).add(owner));
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    const keys = [...changedRef.current];
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(keys.map((k) => [k, (settings as unknown as Record<string, string>)[k] ?? ""]))),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      window.alert((data as { error?: string }).error || "Settings could not be saved. Try again.");
      return;
    }
    for (const k of keys) changedRef.current.delete(k);
    setDirtyTabs(new Set());
    warnedRef.current = false;
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  /** Switch tabs, warning once per dirty session — not on every switch. */
  function switchTab(tab: TabId) {
    if (tab === activeTab) return;
    if (dirtyTabs.size > 0 && !warnedRef.current) {
      warnedRef.current = true;
      if (!confirm("You have unsaved changes. Switch tabs without saving?")) return;
      // OK = switch anyway. Changes stay in the form (dots stay on their
      // tabs); any tab's Save button still saves everything.
    }
    setActiveTab(tab);
    window.scrollTo({ top: 0 });
  }

  // Media Storage "Test connection": posts the form's current storage_*
  // values — saved or not, which is the point — to the probe endpoint,
  // which writes a one-line file to the chosen driver and removes it.
  const [storageTest, setStorageTest] = useState<{ kind: "idle" | "busy" | "ok" | "fail"; message?: string }>({ kind: "idle" });

  async function runStorageTest() {
    setStorageTest({ kind: "busy" });
    const all = settings as unknown as Record<string, string>;
    const body = Object.fromEntries(
      Object.keys(all).filter((k) => k.startsWith("storage_")).map((k) => [k, all[k] ?? ""])
    );
    const res = await fetch("/api/settings/storage-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean; driver?: string; error?: string }) : {};
    if (res?.ok && data.ok) {
      setStorageTest({ kind: "ok", message: `Works — a test file was written to the ${data.driver ?? ""} storage and removed again.` });
    } else {
      setStorageTest({ kind: "fail", message: data.error || "The test could not run. Try again." });
    }
  }

  const saveButton = (
    <button type="button" onClick={() => handleSave()} disabled={saving} className="btn-primary inline-flex items-center gap-2">
      {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
      {saved ? "Saved" : "Save Settings"}
    </button>
  );

  if (loading) return (
    <>
      <Header title="Settings" />
      <main className="flex-1 p-6 flex items-center justify-center text-slate-400 text-sm">Loading…</main>
    </>
  );

  return (
    <>
      <Header title="Settings" />
      <main className="flex-1 p-6">
        {/* Tab bar */}
        <div className="max-w-2xl mb-6 flex flex-wrap gap-1 border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors ${
                activeTab === t.id
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              {t.label}
              {dirtyTabs.has(t.id) && (
                <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-amber-500" title="Unsaved changes" />
              )}
            </button>
          ))}
        </div>

        <div className="max-w-2xl">
          {activeTab === "general" && (
            <div className="space-y-6">
          {/* Anything that changes how the site looks lives in the Customizer.
              These fields used to be duplicated here. */}
          <div className="card p-5">
            <div className="flex items-start gap-3">
              <Paintbrush size={16} className="text-slate-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-900 text-sm">Site identity, homepage &amp; scripts</h2>
                <p className="text-xs text-slate-500 mt-1">
                  The logo, favicon, what the homepage shows, posts per page, footer copyright
                  and analytics scripts are edited in the Customizer, where you can see the change
                  as you make it.
                </p>
                <Link href="/admin/customize" className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 mt-2">
                  Open the Customizer <ChevronRight size={13} />
                </Link>
              </div>
            </div>
          </div>

          {/* Site URL — technical, and the only General field that isn't visual */}
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-slate-900 text-sm">General</h2>

            {/* Name and tagline were reachable only from the Customizer, inside
                the header's *Logo* item — three levels deep, under a name that
                does not suggest it holds the site's name. They are not merely
                visual either: they are the `<title>` suffix, `og:site_name`,
                and the description every page falls back to. Same settings keys
                as the Customizer, so the two cannot disagree. */}
            <div>
              <label className="label">Site Name</label>
              <input
                type="text"
                className="input"
                value={settings.site_name}
                onChange={(e) => update("site_name", e.target.value)}
                placeholder="My Site"
              />
              <p className="text-xs text-slate-400 mt-1">
                Used in the browser tab, <code>og:site_name</code> on shared links, and the footer.
                Also editable in the Customizer, where you can see it in the header.
              </p>
            </div>
            <div>
              <label className="label">Tagline</label>
              <input
                type="text"
                className="input"
                value={settings.site_description}
                onChange={(e) => update("site_description", e.target.value)}
                placeholder="What this site is about"
              />
              <p className="text-xs text-slate-400 mt-1">
                One sentence. Search engines use it when a page has no description of its own, so
                a page with nothing written still gets a sensible snippet.
              </p>
            </div>
            <div>
              <label className="label">Site URL</label>
              <input type="url" className="input" value={settings.site_url} onChange={(e) => update("site_url", e.target.value)} placeholder="https://yoursite.com" />
              <p className="text-xs text-slate-400 mt-1">Used for canonical URLs, the sitemap and the RSS feed.</p>
            </div>
            <div>
              <label className="label">Hosting control panel</label>
              <input type="url" className="input" value={settings.hosting_panel_url} onChange={(e) => update("hosting_panel_url", e.target.value)} placeholder="https://yourhost.com:2083" />
              <p className="text-xs text-slate-400 mt-1">
                cPanel, Plesk or your host&apos;s dashboard. Site Health findings that are fixed there (environment variables, cron jobs, memory) link to it.
              </p>
            </div>
          </div>

              {saveButton}
            </div>
          )}

          {activeTab === "storage" && (
            <div className="space-y-6">
              <div className="card p-5 space-y-4">
                <div>
                  <h2 className="font-semibold text-slate-900 text-sm">Where uploads are stored</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    New uploads — media library files, and images pulled in by a WordPress import — are stored
                    by the driver below. Files already uploaded stay where they are: each file remembers its
                    driver, so deleting it later still finds it. Credentials are stored with the site settings
                    and are only ever shown to administrators.
                  </p>
                </div>

                <StorageField label="Storage driver">
                  <select className="input" value={settings.storage_driver} onChange={(e) => update("storage_driver", e.target.value)}>
                    <option value="">Automatic — Vercel Blob if configured, otherwise this server&apos;s disk</option>
                    <option value="local">Local disk (this server)</option>
                    <option value="s3">Amazon S3</option>
                    <option value="r2">Cloudflare R2</option>
                    <option value="github">GitHub repository — small sites only</option>
                  </select>
                </StorageField>

                {settings.storage_driver === "" && (
                  <p className="text-xs text-slate-500">
                    Automatic keeps the historical behaviour: if the host sets <code>BLOB_READ_WRITE_TOKEN</code>,
                    uploads go to Vercel Blob; everywhere else they are written to <code>public/uploads</code> on
                    this server. Pick a driver to fix the choice yourself.
                  </p>
                )}

                {settings.storage_driver === "local" && (
                  <p className="text-xs text-slate-500">
                    Files are written to <code>public/uploads</code> on this server and served from there — no
                    other settings are needed. Include that folder in your backups. On a serverless host the
                    disk is wiped between deploys, so pick S3, R2 or GitHub there instead.
                  </p>
                )}

                {settings.storage_driver === "s3" && (
                  <>
                    <StorageField label="Bucket name">
                      <input type="text" className="input" value={settings.storage_s3_bucket} onChange={(e) => update("storage_s3_bucket", e.target.value)} placeholder="my-site-media" autoComplete="off" />
                    </StorageField>
                    <StorageField label="Region" help="The region the bucket lives in, e.g. us-east-1, eu-west-1, ap-south-1.">
                      <input type="text" className="input" value={settings.storage_s3_region} onChange={(e) => update("storage_s3_region", e.target.value)} placeholder="us-east-1" autoComplete="off" />
                    </StorageField>
                    <StorageField label="Access key ID" help="An IAM key whose policy allows s3:PutObject, s3:GetObject and s3:DeleteObject on this bucket.">
                      <input type="text" className="input" value={settings.storage_s3_access_key} onChange={(e) => update("storage_s3_access_key", e.target.value)} placeholder="AKIA…" autoComplete="off" />
                    </StorageField>
                    <StorageField label="Secret access key">
                      <input type="password" className="input" value={settings.storage_s3_secret} onChange={(e) => update("storage_s3_secret", e.target.value)} autoComplete="off" />
                    </StorageField>
                    <StorageField label="Folder prefix" help="Objects are stored under this prefix inside the bucket.">
                      <input type="text" className="input" value={settings.storage_s3_prefix} onChange={(e) => update("storage_s3_prefix", e.target.value)} placeholder="uploads" autoComplete="off" />
                    </StorageField>
                    <StorageField label="Public base URL (optional)" help="Where stored files are linked from — a CloudFront distribution or the bucket's website endpoint. Leave empty to link to the bucket directly (the bucket must then be publicly readable).">
                      <input type="url" className="input" value={settings.storage_s3_base_url} onChange={(e) => update("storage_s3_base_url", e.target.value)} placeholder="https://media.example.com" autoComplete="off" />
                    </StorageField>
                  </>
                )}

                {settings.storage_driver === "r2" && (
                  <>
                    <StorageField label="Bucket name">
                      <input type="text" className="input" value={settings.storage_r2_bucket} onChange={(e) => update("storage_r2_bucket", e.target.value)} placeholder="my-site-media" autoComplete="off" />
                    </StorageField>
                    <StorageField label="Account ID" help="Shown on the Cloudflare R2 overview page; it forms the storage endpoint.">
                      <input type="text" className="input" value={settings.storage_r2_account_id} onChange={(e) => update("storage_r2_account_id", e.target.value)} autoComplete="off" />
                    </StorageField>
                    <StorageField label="Access key ID" help="From R2 → Manage R2 API Tokens. The token needs Object Read & Write on this bucket.">
                      <input type="text" className="input" value={settings.storage_r2_access_key} onChange={(e) => update("storage_r2_access_key", e.target.value)} autoComplete="off" />
                    </StorageField>
                    <StorageField label="Secret access key">
                      <input type="password" className="input" value={settings.storage_r2_secret} onChange={(e) => update("storage_r2_secret", e.target.value)} autoComplete="off" />
                    </StorageField>
                    <StorageField label="Folder prefix" help="Objects are stored under this prefix inside the bucket.">
                      <input type="text" className="input" value={settings.storage_r2_prefix} onChange={(e) => update("storage_r2_prefix", e.target.value)} placeholder="uploads" autoComplete="off" />
                    </StorageField>
                    <StorageField label="Public base URL" help="R2 buckets are private until you expose them: use the bucket's r2.dev URL or a connected custom domain. Without one, stored links point at the storage endpoint and will not open for visitors.">
                      <input type="url" className="input" value={settings.storage_r2_base_url} onChange={(e) => update("storage_r2_base_url", e.target.value)} placeholder="https://pub-xxxx.r2.dev or https://media.example.com" autoComplete="off" />
                    </StorageField>
                  </>
                )}

                {settings.storage_driver === "github" && (
                  <>
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      For very small sites only — a product page or a few pages with a handful of images. Every
                      upload becomes a commit in the repository, and GitHub is not a file host: heavy image
                      traffic or a large library belongs on S3 or R2 instead.
                    </p>
                    <StorageField label="Repository" help="The repository uploads are committed to — a dedicated media repo keeps your code history clean. It may be public or private.">
                      <input type="text" className="input" value={settings.storage_github_repo} onChange={(e) => update("storage_github_repo", e.target.value)} placeholder="owner/repo" autoComplete="off" />
                    </StorageField>
                    <StorageField label="Branch">
                      <input type="text" className="input" value={settings.storage_github_branch} onChange={(e) => update("storage_github_branch", e.target.value)} placeholder="main" autoComplete="off" />
                    </StorageField>
                    <StorageField label="Folder in repo" help="Uploads are committed under this folder.">
                      <input type="text" className="input" value={settings.storage_github_path} onChange={(e) => update("storage_github_path", e.target.value)} placeholder="uploads" autoComplete="off" />
                    </StorageField>
                    <StorageField label="Personal access token" help="A fine-grained PAT with Contents read & write permission on this repository only.">
                      <input type="password" className="input" value={settings.storage_github_token} onChange={(e) => update("storage_github_token", e.target.value)} placeholder="github_pat_…" autoComplete="off" />
                    </StorageField>
                    <StorageField label="Public base URL (optional)" help="Leave empty to link files via raw.githubusercontent.com. A CDN mirror of the same folder works too, e.g. https://cdn.jsdelivr.net/gh/owner/repo@main/uploads — set it to that folder's URL, without a trailing slash.">
                      <input type="url" className="input" value={settings.storage_github_base_url} onChange={(e) => update("storage_github_base_url", e.target.value)} placeholder="https://cdn.jsdelivr.net/gh/owner/repo@main/uploads" autoComplete="off" />
                    </StorageField>
                  </>
                )}

                <div className="flex items-center gap-3 pt-1">
                  <button type="button" onClick={runStorageTest} disabled={storageTest.kind === "busy"} className="btn-secondary inline-flex items-center gap-2">
                    {storageTest.kind === "busy" ? <Loader2 size={15} className="animate-spin" /> : null}
                    Test connection
                  </button>
                  {storageTest.kind === "ok" && <p className="text-xs text-emerald-600">{storageTest.message}</p>}
                  {storageTest.kind === "fail" && <p className="text-xs text-red-600">{storageTest.message}</p>}
                  {storageTest.kind === "idle" && (
                    <p className="text-xs text-slate-400">Writes a one-line test file with the values above — saved or not — and removes it.</p>
                  )}
                </div>
              </div>

              {saveButton}
            </div>
          )}

          {activeTab === "language" && (
            <div className="space-y-6">
          {/* Language & Region */}
          <div className="card p-5 space-y-5">
            <div className="flex items-center gap-2">
              <Languages size={16} className="text-slate-500" />
              <h2 className="font-semibold text-slate-900 text-sm">Language &amp; Region</h2>
            </div>

            {/* ── The published site ─────────────────────────────────── */}
            <div className="space-y-4">
              <div>
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Public Site</h3>
                <p className="text-xs text-slate-400 mt-0.5">What your visitors get.</p>
              </div>

              <div>
                <label className="label">Site Language</label>
                <select
                  className="input"
                  value={settings.site_language || "en"}
                  onChange={(e) => update("site_language", e.target.value)}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{languageLabel(l)}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  Sets the page&apos;s <code>lang</code>, which screen readers use to pick pronunciation and search
                  engines use to tell who a page is for. It also decides how dates are written.
                </p>
              </div>

              <div>
                <label className="label">Text Direction</label>
                <div className="space-y-2">
                  {TEXT_DIRECTIONS.map((d) => (
                    <label
                      key={d.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        (settings.site_direction || "auto") === d.id
                          ? "border-brand-400 bg-brand-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="site_direction"
                        value={d.id}
                        checked={(settings.site_direction || "auto") === d.id}
                        onChange={() => update("site_direction", d.id)}
                        className="mt-0.5 text-brand-600"
                      />
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-slate-800">{d.label}</span>
                        <p className="text-xs text-slate-400 mt-0.5">{d.hint}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Date Format</label>
                <select
                  className="input"
                  value={settings.date_format || "medium"}
                  onChange={(e) => update("date_format", e.target.value)}
                >
                  {DATE_FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  Written in the site language, so one choice reads correctly in each.
                </p>
              </div>

              <div>
                <label className="label">Time Zone</label>
                <select
                  className="input"
                  value={settings.site_timezone || "UTC"}
                  onChange={(e) => update("site_timezone", e.target.value)}
                >
                  {TIME_ZONES.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  Decides which day a post published near midnight belongs to. Without it the answer depends on
                  where the reader happens to be.
                </p>
              </div>
            </div>

            {/* ── Content languages ──────────────────────────────────── */}
            <div id="languages" className="space-y-4 border-t border-slate-100 pt-5">
              <div>
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Content Languages</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  The languages you publish in. Content is <strong>not shared</strong> between them — adding one
                  opens a separate set of posts and pages, it does not translate anything. The first is the default:
                  what new content is created in, and what the public site serves.
                </p>
              </div>

              <div className="space-y-2">
                {contentLanguageList.map((code, i) => {
                  const meta = LANGUAGES.find((l) => l.code === code);
                  return (
                    <div
                      key={code}
                      className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <span className="text-sm text-slate-800">
                        {meta ? languageLabel(meta) : code}
                      </span>
                      {i === 0 ? (
                        <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          Default
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setContentLanguages(moveToFront(contentLanguageList, code))}
                          className="text-[11px] text-slate-400 hover:text-slate-700"
                        >
                          Make default
                        </button>
                      )}
                      <span className="ml-auto flex items-center gap-3">
                        <code className="text-[11px] text-slate-400">{code}</code>
                        {contentLanguageList.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setContentLanguages(contentLanguageList.filter((c) => c !== code))}
                            title="Remove this language"
                            className="text-[11px] text-slate-400 hover:text-red-600"
                          >
                            Remove
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <select
                  className="input flex-1"
                  value={newLanguage}
                  onChange={(e) => setNewLanguage(e.target.value)}
                >
                  <option value="">Add a language…</option>
                  {LANGUAGES.filter((l) => !contentLanguageList.includes(l.code)).map((l) => (
                    <option key={l.code} value={l.code}>{languageLabel(l)}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!newLanguage}
                  onClick={() => {
                    if (!newLanguage) return;
                    setContentLanguages([...contentLanguageList, newLanguage]);
                    setNewLanguage("");
                  }}
                  className="btn-secondary disabled:opacity-40"
                >
                  Add
                </button>
              </div>

              <p className="text-xs text-slate-400">
                Removing a language does not delete its posts — they stay in the database and reappear if it is added
                back. They simply stop being listed.
              </p>
            </div>

            {/* ── The CMS itself ─────────────────────────────────────── */}
            <div className="space-y-4 border-t border-slate-100 pt-5">
              <div>
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Admin Interface</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  What <em>you</em> get while working in here — separate from the site, because the people running a
                  site and the people reading it are rarely the same.
                </p>
              </div>

              <div>
                <label className="label">Interface Language</label>
                <select
                  className="input"
                  value={settings.admin_language || "en"}
                  onChange={(e) => update("admin_language", e.target.value)}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{languageLabel(l)}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  <strong className="text-amber-600">Labels are not translated yet.</strong> This sets the admin&apos;s
                  reading direction and how dates are written in here; the buttons and headings stay in English until
                  translation files exist.
                </p>
              </div>

              <div>
                <label className="label">Interface Direction</label>
                <div className="space-y-2">
                  {TEXT_DIRECTIONS.map((d) => (
                    <label
                      key={d.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        (settings.admin_direction || "auto") === d.id
                          ? "border-brand-400 bg-brand-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="admin_direction"
                        value={d.id}
                        checked={(settings.admin_direction || "auto") === d.id}
                        onChange={() => update("admin_direction", d.id)}
                        className="mt-0.5 text-brand-600"
                      />
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-slate-800">{d.label}</span>
                        <p className="text-xs text-slate-400 mt-0.5">{d.hint}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

              {saveButton}
            </div>
          )}

          {activeTab === "permalinks" && (
            <div className="space-y-6">
          {/* Permalinks */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Link2 size={16} className="text-slate-500" />
              <h2 className="font-semibold text-slate-900 text-sm">Permalink Settings</h2>
            </div>
            <p className="text-xs text-slate-500">Choose the URL structure for your blog posts.</p>
            <div className="space-y-2">
              {PERMALINK_STRUCTURES.map((opt) => (
                <label key={opt.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${settings.permalink_structure === opt.id ? "border-brand-400 bg-brand-50" : "border-slate-200 hover:border-slate-300"}`}>
                  <input
                    type="radio"
                    name="permalink"
                    value={opt.id}
                    checked={settings.permalink_structure === opt.id}
                    onChange={() => update("permalink_structure", opt.id)}
                    className="mt-0.5 text-brand-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-800">{opt.label}</span>
                      {opt.example && (
                        <code className="text-xs bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-500">{opt.example}</code>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{opt.description}</p>
                  </div>
                </label>
              ))}
            </div>
            {settings.permalink_structure === "custom" && (
              <div>
                <label className="label">Custom Structure</label>
                <input
                  type="text"
                  className="input font-mono text-xs"
                  value={settings.permalink_custom}
                  onChange={(e) => update("permalink_custom", e.target.value)}
                  placeholder="/%year%/%monthnum%/%postname%/"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Available tags: <code className="bg-slate-100 px-1 rounded">%year%</code> <code className="bg-slate-100 px-1 rounded">%monthnum%</code> <code className="bg-slate-100 px-1 rounded">%day%</code> <code className="bg-slate-100 px-1 rounded">%postname%</code> <code className="bg-slate-100 px-1 rounded">%category%</code>
                </p>
              </div>
            )}
          </div>

              {saveButton}
            </div>
          )}

          {activeTab === "sitemap" && (
            <div className="space-y-6">
          {/* SEO: Sitemap & Robots */}
          <div className="card p-5">
            <div className="flex items-start gap-3">
              <Search size={16} className="text-slate-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-900 text-sm">Sitemap &amp; robots.txt</h2>
                <p className="text-xs text-slate-500 mt-1">
                  These moved to the SEO screen, alongside title templates and schema.
                </p>
                <Link href="/admin/seo" className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 mt-2">
                  Open SEO <ChevronRight size={13} />
                </Link>
              </div>
            </div>
          </div>
            </div>
          )}

          {activeTab === "backup" && (
            <div className="space-y-6">

          {/* Export.
              Outside the settings form on purpose — it is a download, not a
              setting, and putting a link inside a form invites saving when you
              meant to back up. */}
          <div className="card p-5">
            <div className="flex items-start gap-3">
              <Download size={16} className="text-slate-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-900 text-sm">Export content</h2>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Downloads every post, page, category, comment, menu and setting. Passwords and
                  two-factor secrets are never included — a backup ends up on laptops and in cloud
                  folders, which is no place for a credential.
                </p>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  The <strong>.zip</strong> also contains your uploaded images. The{" "}
                  <strong>.json</strong> is the content only — smaller, readable, and enough if your
                  images are hosted elsewhere.
                </p>
                {/* A plain anchor, not `<Link>`: this is a file download, and
                    the response is served with `Content-Disposition:
                    attachment`. A client-side navigation would try to render
                    the JSON as a route instead of saving it, and would prefetch
                    a full database export on hover. */}
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <a
                    href="/api/export?media=1"
                    download
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    Download backup with images (.zip) <ChevronRight size={13} />
                  </a>
                  <a
                    href="/api/export"
                    download
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
                  >
                    Content only (.json)
                  </a>
                </div>
              </div>
            </div>
          </div>

          <ImportPanel />
            </div>
          )}
        </div>
      </main>
    </>
  );
}
