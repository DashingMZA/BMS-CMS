import { newTabProps } from "@/lib/linkRel";

/**
 * Brand SVG icons for social profiles.
 *
 * Simple glyphs, currentColor fill — they inherit the surrounding text colour
 * so header, footer and sidebar all style them with CSS, not props.
 */

const ICONS: Record<string, React.ReactNode> = {
  facebook: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.6-1.5h1.3V4.9c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.2-3.2 3.3V11H9v3h2.3v7h2.2z" />
    </svg>
  ),
  twitter: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.8 4h2.7l-6 6.8L21.5 20h-5.6l-4.3-5.6L6.6 20H3.9l6.4-7.3L3.5 4H9l3.9 5.1L17.8 4zm-1 14.3h1.5L8.1 5.6H6.5l10.3 12.7z" />
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <circle cx="12" cy="12" r="3.6" />
      <circle cx="17" cy="7" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6.9 8.6H4V20h2.9V8.6zM5.4 7.3a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4zM9.5 20h2.9v-5.6c0-.3 0-.6.1-.8.2-.6.8-1.2 1.7-1.2 1.2 0 1.7.9 1.7 2.3V20h2.9v-5.9c0-2.7-1.4-3.9-3.4-3.9-1.6 0-2.3.9-2.7 1.5v.1H12.4V8.6H9.5V20z" />
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8c1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15.2V8.8L15.5 12 10 15.2z" />
    </svg>
  ),
};

export type SocialNetwork = keyof typeof ICONS;

export function socialIcon(network: string): React.ReactNode | null {
  const key = network.toLowerCase().replace(/[^a-z]/g, "");
  // "x" is the X/Twitter brand; "twitter" kept for the settings key.
  const normalized = key === "x" ? "twitter" : key;
  return ICONS[normalized] ?? null;
}

export default function SocialIcons({
  profiles,
  size = 18,
  className = "",
}: {
  /** [label, url] pairs. */
  profiles: [string, string][];
  size?: number;
  className?: string;
}) {
  const items = profiles.filter(([, url]) => !!url);
  if (items.length === 0) return null;
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {items.map(([label, url]) => {
        const icon = socialIcon(label);
        return (
          <a
            key={label}
            href={url}
            aria-label={label}
            title={label}
            {...newTabProps(true)}
            className="opacity-70 hover:opacity-100 transition-opacity"
          >
            {icon ? (
              <span className="block" style={{ width: size, height: size }}>{icon}</span>
            ) : (
              <span className="text-sm">{label}</span>
            )}
          </a>
        );
      })}
    </div>
  );
}
