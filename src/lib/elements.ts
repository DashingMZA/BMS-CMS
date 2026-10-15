// Elements: reusable block content injected at a layout hook.
//
// Kept free of database imports so the admin screens can share these constants
// without dragging Drizzle and the schema into the browser bundle. The loader
// lives in ElementSlot, the only thing that reads them.
//
// The point is that an announcement bar or a CTA under every post is authored
// once, in the same editor as everything else, instead of being hard-coded into
// the layout. Where it appears is a hook; which pages it appears on is a
// condition — both plain data, so the whole thing stays statically renderable.

import { PAGE_TYPES, type PageType } from "@/lib/headerConditions";

export const ELEMENT_HOOKS = [
  { id: "before_header",  label: "Above header",   hint: "Top of the page, before the header" },
  { id: "after_header",   label: "Below header",   hint: "Between the header and the content" },
  { id: "before_content", label: "Above content",  hint: "Inside the content column, before the article" },
  { id: "after_content",  label: "Below content",  hint: "Inside the content column, after the article" },
  { id: "before_footer",  label: "Above footer",   hint: "Full width, just before the footer" },
  { id: "after_footer",   label: "Below footer",   hint: "Bottom of the page, after the footer" },
] as const;

export type ElementHook = (typeof ELEMENT_HOOKS)[number]["id"];

export const ELEMENT_HOOK_IDS: readonly string[] = ELEMENT_HOOKS.map((h) => h.id);

export const hookLabel = (id: string) =>
  ELEMENT_HOOKS.find((h) => h.id === id)?.label ?? id;

/** The page types an element can be targeted at — the same set headers use. */
export const ELEMENT_PAGE_TYPES = PAGE_TYPES;

export interface ElementConditions {
  /** Empty means every page type. */
  include?: string[];
  /** Always wins over include. */
  exclude?: string[];
  /**
   * Content languages this element appears in; empty means all of them.
   *
   * Kept inside the same JSON as the page-type rules rather than in a column
   * of its own: it is read only alongside them, and a JSON key needs no
   * migration on a live database.
   */
  languages?: string[];
  /**
   * URL path prefixes this element appears on; empty means no URL filter.
   * Matched against the request path (e.g. "/en/blog" matches "/en/blog/post-1").
   */
  urls?: string[];
  /** URL path prefixes to exclude. Always wins over urls. */
  excludeUrls?: string[];
}

export interface SiteElement {
  id: number;
  name: string;
  content: unknown;
  hook: string;
  status: string;
  priority: number;
  conditions: ElementConditions;
  startAt?: Date | string | null;
  endAt?: Date | string | null;
}

export function parseConditions(raw: unknown): ElementConditions {
  if (!raw || typeof raw !== "object") return {};
  const v = raw as ElementConditions;
  return {
    include: Array.isArray(v.include) ? v.include.filter((x) => typeof x === "string") : [],
    exclude: Array.isArray(v.exclude) ? v.exclude.filter((x) => typeof x === "string") : [],
    languages: Array.isArray(v.languages) ? v.languages.filter((x) => typeof x === "string") : [],
    urls: Array.isArray(v.urls) ? v.urls.filter((x) => typeof x === "string") : [],
    excludeUrls: Array.isArray(v.excludeUrls) ? v.excludeUrls.filter((x) => typeof x === "string") : [],
  };
}

/**
 * Does this element belong on a page of this type?
 *
 * Exclude beats include, so "everywhere except the front page" is one rule
 * rather than a list of every other page type.
 */
export function matchesPage(el: SiteElement, pageType: PageType, language?: string, path?: string): boolean {
  const { include = [], exclude = [], languages = [], urls = [], excludeUrls = [] } = el.conditions;
  // An element aimed at some languages stays off pages whose language is
  // unknown, rather than guessing — a French banner on an English page is
  // the mistake this exists to prevent.
  if (languages.length > 0 && !(language && languages.includes(language))) return false;
  if (exclude.includes(pageType)) return false;
  // URL rules: exclude wins, then include must match if set.
  if (path) {
    if (excludeUrls.some((u) => path === u || path.startsWith(u.endsWith("/") ? u : u + "/") || path.startsWith(u))) return false;
    if (urls.length > 0 && !urls.some((u) => path === u || path.startsWith(u))) return false;
  } else if (urls.length > 0) {
    // URL-targeted element on a page whose path is unknown: stay off.
    return false;
  }
  if (include.length === 0) return true;
  return include.includes(pageType);
}

/**
 * Is this element inside its schedule window?
 *
 * No dates = always on. A start in the future hides it until then;
 * an end in the past retires it. Both set = a campaign window.
 */
export function inSchedule(el: { startAt?: Date | string | null; endAt?: Date | string | null }, now: Date = new Date()): boolean {
  const start = el.startAt ? new Date(el.startAt) : null;
  const end = el.endAt ? new Date(el.endAt) : null;
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}
