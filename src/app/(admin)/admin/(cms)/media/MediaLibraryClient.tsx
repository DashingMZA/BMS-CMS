"use client";

import { useState, useRef, useEffect } from "react";
import Header from "@/components/admin/Header";
import { Upload, Trash2, Copy, Check, Image as ImageIcon, FolderPlus, Folder, Pencil, X } from "lucide-react";
import { formatBytes } from "@/lib/siteHealthTypes";

export interface MediaItem {
  id: number;
  filename: string;
  originalName: string;
  url: string;
  mimeType: string;
  size: number;
  alt: string | null;
  caption: string | null;
  createdAt: string;
  folderId: number | null;
}

export interface MediaFolder {
  id: number;
  name: string;
  parentId: number | null;
}

type FolderFilter = number | "root" | "all";

export default function MediaLibraryClient({
  initialItems,
  initialTotal,
  initialHasMore,
}: {
  initialItems: MediaItem[];
  initialTotal: number;
  initialHasMore: boolean;
}) {
  const [items, setItems] = useState<MediaItem[]>(initialItems);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [copied, setCopied] = useState(false);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Folders
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<FolderFilter>("all");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renaming, setRenaming] = useState<MediaFolder | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/media/folders")
      .then((r) => r.json())
      .then((d) => setFolders(d.folders ?? []))
      .catch(() => {});
  }, []);

  const folderParam = activeFolder === "all" ? "" : `&folderId=${activeFolder}`;

  async function fetchMedia(nextPage = 1, append = false) {
    if (append) setLoadingMore(true);
    const res = await fetch(`/api/media?page=${nextPage}${folderParam}`);
    const data = await res.json();
    setItems((prev) => (append ? [...prev, ...(data.media ?? [])] : data.media ?? []));
    setTotal(data.total ?? (data.media ?? []).length);
    setHasMore(!!data.hasMore);
    setPage(nextPage);
    setLoadingMore(false);
  }

  // Refetch when the folder filter changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: changing folder resets the grid
    fetchMedia();
     
    setChecked(new Set());
     
    setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFolder]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    const problems: string[] = [];
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      // Upload into the currently open folder (if one is open).
      if (typeof activeFolder === "number") fd.append("folderId", String(activeFolder));
      const res = await fetch("/api/media", { method: "POST", body: fd }).catch(() => null);
      if (!res?.ok) {
        const data = res ? await res.json().catch(() => ({})) : {};
        problems.push(`${file.name}: ${(data as { error?: string }).error || "could not be uploaded."}`);
      }
    }
    setUploading(false);
    if (problems.length) window.alert(problems.join("\n"));
    fetchMedia();
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this file?")) return;
    let res = await fetch(`/api/media/${id}`, { method: "DELETE" }).catch(() => null);
    if (res?.status === 409) {
      const data = await res.json().catch(() => ({}));
      if (!confirm(`${data.error || "This file is still in use."}\n\nDelete it anyway?`)) return;
      res = await fetch(`/api/media/${id}?force=1`, { method: "DELETE" }).catch(() => null);
    }
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      window.alert((data as { error?: string }).error || "The file could not be deleted.");
    }
    if (selected?.id === id) setSelected(null);
    fetchMedia();
  }

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const res = await fetch("/api/media/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const data = await res.json();
      setFolders((f) => [...f, data.folder].sort((a, b) => a.name.localeCompare(b.name)));
      setNewFolderName("");
      setShowNewFolder(false);
    } else {
      window.alert("Could not create the folder.");
    }
  }

  async function renameFolder() {
    if (!renaming) return;
    const name = renaming.name.trim();
    if (!name) return;
    const res = await fetch(`/api/media/folders/${renaming.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const data = await res.json();
      setFolders((f) => f.map((x) => (x.id === data.folder.id ? data.folder : x)));
      setRenaming(null);
    } else {
      window.alert("Could not rename the folder.");
    }
  }

  async function deleteFolder(id: number, name: string) {
    if (!confirm(`Delete the folder "${name}"? Its files move back to the main library.`)) return;
    const res = await fetch(`/api/media/folders/${id}`, { method: "DELETE" });
    if (res.ok) {
      setFolders((f) => f.filter((x) => x.id !== id));
      if (activeFolder === id) setActiveFolder("all");
      fetchMedia();
    } else {
      window.alert("Could not delete the folder.");
    }
  }

  /** Move checked files into a folder (or back to root with null). */
  async function moveChecked(folderId: number | null) {
    const ids = [...checked];
    if (!ids.length) return;
    let failed = 0;
    for (const id of ids) {
      const res = await fetch(`/api/media/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      }).catch(() => null);
      if (!res?.ok) failed++;
    }
    setChecked(new Set());
    if (failed) window.alert(`${failed} of ${ids.length} could not be moved.`);
    fetchMedia();
  }

  const toggleCheck = (id: number) =>
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const activeFolderName =
    activeFolder === "all" ? "All files" : activeFolder === "root" ? "Unfiled" : folders.find((f) => f.id === activeFolder)?.name ?? "";

  return (
    <>
      <Header title="Media Library" />
      <main className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Media Library</h2>
            <p className="text-sm text-slate-500">
              {total} {total === 1 ? "file" : "files"}
              {activeFolder !== "all" && <> in {activeFolderName}</>}
              {items.length < total && <span className="text-slate-400"> · showing {items.length}</span>}
            </p>
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,video/*,.pdf,.svg"
              onChange={handleUpload}
              className="hidden"
              id="media-upload"
            />
            <label htmlFor="media-upload" className="btn-primary cursor-pointer">
              <Upload size={16} />
              {uploading ? "Uploading…" : "Upload Files"}
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_300px] gap-6">
          {/* Folders sidebar */}
          <div className="card p-4 h-fit">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Folders</h3>
              <button
                type="button"
                onClick={() => setShowNewFolder((v) => !v)}
                className="text-slate-400 hover:text-slate-700"
                title="New folder"
              >
                <FolderPlus size={16} />
              </button>
            </div>
            {showNewFolder && (
              <div className="flex gap-1 mb-3">
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createFolder()}
                  placeholder="Folder name"
                  className="flex-1 min-w-0 text-sm border border-slate-300 rounded-lg px-2 py-1"
                  autoFocus
                />
                <button type="button" onClick={createFolder} className="btn-primary text-xs px-2 py-1">
                  Add
                </button>
              </div>
            )}
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => setActiveFolder("all")}
                className={`w-full text-left text-sm px-2 py-1.5 rounded-lg flex items-center gap-2 ${
                  activeFolder === "all" ? "bg-brand-50 text-brand-700 font-medium" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <ImageIcon size={14} /> All files
              </button>
              <button
                type="button"
                onClick={() => setActiveFolder("root")}
                className={`w-full text-left text-sm px-2 py-1.5 rounded-lg flex items-center gap-2 ${
                  activeFolder === "root" ? "bg-brand-50 text-brand-700 font-medium" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Folder size={14} /> Unfiled
              </button>
              {folders.map((f) => (
                <div key={f.id} className="group flex items-center">
                  <button
                    type="button"
                    onClick={() => setActiveFolder(f.id)}
                    className={`flex-1 text-left text-sm px-2 py-1.5 rounded-lg flex items-center gap-2 min-w-0 ${
                      activeFolder === f.id ? "bg-brand-50 text-brand-700 font-medium" : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Folder size={14} className="shrink-0" />
                    <span className="truncate">{f.name}</span>
                  </button>
                  <div className="hidden group-hover:flex items-center">
                    <button
                      type="button"
                      onClick={() => setRenaming({ ...f })}
                      className="p-1 text-slate-400 hover:text-slate-700"
                      title="Rename"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteFolder(f.id, f.name)}
                      className="p-1 text-slate-400 hover:text-red-600"
                      title="Delete folder"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {checked.size > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-500 mb-2">{checked.size} selected — move to:</p>
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => moveChecked(null)}
                    className="w-full text-left text-xs px-2 py-1 rounded hover:bg-slate-50 text-slate-600"
                  >
                    Unfiled (root)
                  </button>
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => moveChecked(f.id)}
                      className="w-full text-left text-xs px-2 py-1 rounded hover:bg-slate-50 text-slate-600 truncate"
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Grid */}
          <div>
            {items.length === 0 ? (
              <div className="card py-16 text-center">
                <ImageIcon size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">
                  {activeFolder === "all" ? "No files uploaded yet" : `No files in ${activeFolderName}`}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {items.map((item) => (
                  <div key={item.id} className="relative">
                    <input
                      type="checkbox"
                      checked={checked.has(item.id)}
                      onChange={() => toggleCheck(item.id)}
                      aria-label={`Select ${item.originalName}`}
                      className="absolute top-2 left-2 z-10 w-4 h-4 rounded"
                    />
                    <button
                      onClick={() => setSelected(item)}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all w-full ${
                        selected?.id === item.id
                          ? "border-brand-500 ring-2 ring-brand-200"
                          : checked.has(item.id)
                            ? "border-brand-300"
                            : "border-transparent hover:border-slate-300"
                      }`}
                    >
                      {item.mimeType.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.url}
                          alt={item.alt || item.originalName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                          <span className="text-xs text-slate-500 font-mono">
                            {item.mimeType.split("/")[1]?.toUpperCase()}
                          </span>
                        </div>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {hasMore && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => fetchMedia(page + 1, true)}
                  disabled={loadingMore}
                  className="btn-secondary"
                >
                  {loadingMore ? "Loading…" : `Load more (${total - items.length} left)`}
                </button>
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div className="card p-5 space-y-4 h-fit">
              <div className="aspect-video rounded-lg overflow-hidden bg-slate-100">
                {selected.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selected.url}
                    alt={selected.alt || selected.originalName}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-slate-400 text-sm">{selected.mimeType}</span>
                  </div>
                )}
              </div>

              <div>
                <p className="font-medium text-slate-900 text-sm truncate">{selected.originalName}</p>
                <p className="text-xs text-slate-400 mt-0.5">{formatBytes(selected.size)} · {selected.mimeType}</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => copyUrl(selected.url)}
                  className="btn-secondary flex-1 text-xs"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied!" : "Copy URL"}
                </button>
                <button
                  onClick={() => handleDelete(selected.id)}
                  className="btn-danger text-xs px-3"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 break-all font-mono">
                {selected.url}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Rename dialog */}
      {renaming && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-sm">
            <h3 className="font-semibold text-slate-900 mb-3">Rename folder</h3>
            <input
              value={renaming.name}
              onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && renameFolder()}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRenaming(null)} className="btn-secondary text-sm">
                Cancel
              </button>
              <button type="button" onClick={renameFolder} className="btn-primary text-sm">
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
