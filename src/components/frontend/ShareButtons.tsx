"use client";

import { useState, useEffect } from "react";
import { Link2, Check, Share2 } from "lucide-react";

/**
 * Social share row for single posts: X, Facebook, LinkedIn, WhatsApp,
 * and copy-link. Client-side because the share URLs need the live page URL
 * and the copy button needs the clipboard.
 */
export default function ShareButtons({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");

  // Read once on mount — the URL is stable for the page's lifetime.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: one-time URL capture on mount
  useEffect(() => {
    setUrl(window.location.href);
  }, []);

  if (!url) return null;

  const encoded = encodeURIComponent(url);
  const text = encodeURIComponent(title);

  const links = [
    { name: "X", href: `https://twitter.com/intent/tweet?url=${encoded}&text=${text}` },
    { name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encoded}` },
    { name: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encoded}` },
    { name: "WhatsApp", href: `https://wa.me/?text=${text}%20${encoded}` },
  ];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API can be unavailable (permissions, non-secure context) —
      // fall back to a prompt the visitor can copy from.
      window.prompt("Copy this link:", url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="post-share flex items-center gap-2 flex-wrap" data-share-row>
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide opacity-60">
        <Share2 size={13} /> Share
      </span>
      {links.map((l) => (
        <a
          key={l.name}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium opacity-80 transition-opacity hover:opacity-100"
        >
          {l.name}
        </a>
      ))}
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium opacity-80 transition-opacity hover:opacity-100"
      >
        {copied ? <Check size={13} /> : <Link2 size={13} />}
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}
