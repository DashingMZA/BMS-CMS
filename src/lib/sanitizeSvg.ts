// Makes an uploaded SVG safe to serve from the site's own origin.
//
// An SVG is a document, not a picture: it can carry <script>, event handler
// attributes, links to javascript:, and <foreignObject> with arbitrary HTML
// inside. Served from public/uploads it runs with the site's origin, so an
// uploaded icon could read an administrator's session the moment they opened
// its URL. That is why SVG was refused entirely until now.
//
// This is an allowlist of what an icon or logo legitimately needs — shapes,
// paths, gradients, text, groups, styles — and everything else is dropped.
// It is deliberately conservative: an SVG that uses a filter primitive we did
// not list renders without it, which is a worse icon, not a security hole.
// Anything that fails to parse as a single <svg> document is rejected.
//
// The passes used to be regular expressions over the raw text. That was the
// hole an audit found (SEC-001): a tag pattern stops at the first ">",
// including one inside a quoted attribute value — <svg title="a>b"
// onload="…"> — so everything after that ">" was emitted without ever being
// attribute-checked, handler and all. Tags are now read by a small
// quote-aware scanner that either accounts for every byte of a tag or
// rejects the document, and the finished output is asserted inert before
// it is returned: a sanitiser that cannot prove its output is safe refuses
// the file instead of passing it through.

const ALLOWED_TAGS = new Set([
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "textPath", "title", "desc", "defs", "symbol", "use", "clipPath",
  "mask", "pattern", "marker", "linearGradient", "radialGradient", "stop", "image",
  "style", "filter", "feGaussianBlur", "feOffset", "feBlend", "feColorMatrix",
  "feFlood", "feComposite", "feMerge", "feMergeNode", "feDropShadow", "metadata",
]);

const URL_ATTRS = new Set(["href", "xlink:href", "src"]);

export interface SanitizedSvg {
  svg: string;
  /** What was removed, for the upload response. Empty means untouched. */
  removed: string[];
}

function safeUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  // Same-document references (#id) and inline data images only. No http(s),
  // no javascript:, no external files of any kind.
  return v.startsWith("#") || v.startsWith("data:image/");
}

/** Matches a run of tag attributes, honouring quoted values. */
const ATTRS = String.raw`(?:[^>"']|"[^"]*"|'[^']*')*`;

interface ScannedAttr {
  name: string;
  value: string;
  /** The attribute exactly as written, name through value. */
  raw: string;
}

interface ScannedTag {
  closing: boolean;
  name: string;
  attrs: ScannedAttr[];
  selfClosing: boolean;
  /** Index just past the tag's closing ">". */
  end: number;
}

/**
 * Reads the tag starting at s[lt] === "<", honouring quoted attribute
 * values: a ">" inside quotes is data, not the end of the tag. Returns null
 * when the tag cannot be fully accounted for — an unterminated quote, a
 * missing ">", a malformed attribute — because passing a half-understood
 * tag through on a guess is how SEC-001 happened.
 */
function scanTag(s: string, lt: number): ScannedTag | null {
  let i = lt + 1;
  let closing = false;
  if (s[i] === "/") {
    closing = true;
    i++;
  }
  const nameMatch = /^[a-zA-Z][\w:-]*/.exec(s.slice(i, i + 64));
  if (!nameMatch) return null;
  const name = nameMatch[0];
  i += name.length;
  const attrs: ScannedAttr[] = [];
  let selfClosing = false;
  for (;;) {
    // Separators between attributes: whitespace and solidus both count —
    // `<rect x="1"/onload=alert(1)/>` put a live handler past a rule that
    // only looked for whitespace. A "/" immediately before ">" makes the
    // tag self-closing.
    let sawSlash = false;
    while (i < s.length && (s[i] === "/" || /\s/.test(s[i]))) {
      if (s[i] === "/") sawSlash = true;
      i++;
    }
    if (i >= s.length) return null;
    if (s[i] === ">") {
      selfClosing = sawSlash;
      i++;
      break;
    }
    if (closing) return null; // a closing tag carries no attributes
    const attrStart = i;
    const attrMatch = /^[a-zA-Z_:][\w:.-]*/.exec(s.slice(i, i + 128));
    if (!attrMatch) return null;
    const attrName = attrMatch[0];
    i += attrName.length;
    // Optional value, with whitespace allowed around the "=".
    let j = i;
    while (j < s.length && /\s/.test(s[j])) j++;
    let value = "";
    if (s[j] === "=") {
      j++;
      while (j < s.length && /\s/.test(s[j])) j++;
      const q = s[j];
      if (q === '"' || q === "'") {
        const close = s.indexOf(q, j + 1);
        if (close === -1) return null; // unterminated quote
        value = s.slice(j + 1, close);
        j = close + 1;
      } else {
        const bare = /^[^\s>]+/.exec(s.slice(j));
        if (!bare) return null;
        value = bare[0];
        j += bare[0].length;
      }
      i = j;
    }
    attrs.push({ name: attrName, value, raw: s.slice(attrStart, i) });
  }
  return { closing, name, attrs, selfClosing, end: i };
}

/** The rules every attribute of an allowed tag must pass, in one place. */
function attrProblem(attr: ScannedAttr): "handler" | "url" | "style" | null {
  const a = attr.name.toLowerCase();
  if (a.startsWith("on")) return "handler";
  if (URL_ATTRS.has(a) && !safeUrl(attr.value)) return "url";
  if (a === "style" && /url\s*\(|expression\s*\(|@import|javascript:/i.test(attr.value)) return "style";
  return null;
}

/**
 * Re-scans finished output and confirms nothing the rules exist to remove
 * is still there. The passes above are believed correct; this is the check
 * that makes a future bypass fail closed (file refused) instead of fail
 * open (script served).
 */
function assertInert(s: string): boolean {
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf("<", i);
    if (lt === -1) return true;
    const tag = scanTag(s, lt);
    if (!tag) return false;
    i = tag.end;
    if (!ALLOWED_TAGS.has(tag.name)) return false;
    for (const attr of tag.attrs) if (attrProblem(attr)) return false;
  }
  return true;
}

export function sanitizeSvg(input: string): SanitizedSvg | null {
  let s = input.replace(/^﻿/, "").trim();
  // A single root <svg>; anything else is not an image.
  const start = s.search(/<svg[\s>]/i);
  if (start === -1 || !/<\/svg>\s*$/i.test(s)) return null;
  // Leading XML declaration and DOCTYPE are fine; entities in a DOCTYPE are
  // not (billion laughs). Drop the DOCTYPE entirely.
  s = s.replace(/<!DOCTYPE[^>]*(\[[\s\S]*?\])?[^>]*>/gi, "");
  s = s.slice(s.search(/<svg[\s>]/i));

  const removed: string[] = [];
  const note = (what: string) => {
    if (!removed.includes(what)) removed.push(what);
  };

  // Comments and CDATA wrappers (a script hiding inside CDATA in <style>).
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");

  // Whole elements that are never acceptable, with their contents. The
  // opening-tag pattern is quote-aware for the same reason as the scanner.
  for (const tag of ["script", "foreignObject", "iframe", "object", "embed", "animate", "set", "animateTransform", "animateMotion", "a"]) {
    const re = new RegExp(String.raw`<${tag}\b${ATTRS}>[\s\S]*?</${tag}\s*>|<${tag}\b${ATTRS}/?>`, "gi");
    if (re.test(s)) {
      note(`<${tag}>`);
      s = s.replace(re, "");
    }
  }

  // The tag pass: scan, don't match. Text between tags is copied verbatim;
  // every tag is either rebuilt from just the attributes that pass the
  // rules (kept exactly as written) or dropped — its children remain as
  // text, as they did under the regex passes.
  let out = "";
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf("<", i);
    if (lt === -1) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, lt);
    const tag = scanTag(s, lt);
    if (!tag) return null; // a tag we cannot fully account for: refuse the file
    i = tag.end;
    if (tag.closing) {
      if (ALLOWED_TAGS.has(tag.name)) out += `</${tag.name}>`;
      else note(`<${tag.name}>`);
      continue;
    }
    if (!ALLOWED_TAGS.has(tag.name)) {
      note(`<${tag.name}>`);
      continue;
    }
    let rebuilt = `<${tag.name}`;
    for (const attr of tag.attrs) {
      const problem = attrProblem(attr);
      if (problem === "handler") {
        note(`${attr.name} attribute`);
        continue;
      }
      if (problem === "url") {
        note(`external ${attr.name}`);
        continue;
      }
      if (problem === "style") {
        note("style with url()");
        continue;
      }
      rebuilt += ` ${attr.raw}`;
    }
    out += rebuilt + (tag.selfClosing ? "/>" : ">");
  }
  s = out;

  // <style> blocks: no @import, no url() to anything but #ids, no javascript.
  s = s.replace(new RegExp(String.raw`<style\b(${ATTRS})>([\s\S]*?)</style>`, "gi"), (m, attrs: string, css: string) => {
    const cleaned = css
      .replace(/@import[^;]*;?/gi, () => {
        note("@import");
        return "";
      })
      .replace(/url\s*\(\s*(['"]?)(?!#)[^)]*\)/gi, () => {
        note("url() in style");
        return "none";
      })
      .replace(/javascript:/gi, "");
    return `<style${attrs}>${cleaned}</style>`;
  });

  if (!/<svg[\s>]/i.test(s) || !/<\/svg>/i.test(s)) return null;
  if (!assertInert(s)) return null;
  return { svg: s, removed };
}
