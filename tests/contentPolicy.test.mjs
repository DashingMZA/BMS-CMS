#!/usr/bin/env node
/**
 * Adversarial tests for src/lib/contentPolicy.ts's stripActiveHtml — the
 * cleaner every HTML Embed block passes through (SEC-010).
 *
 * The function is deliberately bounded, not a full HTML parser: scripts,
 * inline handlers, plugin tags, srcdoc and executable URLs/schemes are
 * removed, repeatedly, because one pass over a split payload
 * (`<scr<script></script>ipt>`) leaves fragments that close up into a
 * working tag. These tests hold it to exactly that documented surface —
 * the bypass spellings it claims to catch (entity-encoded and
 * tab-separated schemes, unquoted handlers, SVG animate) are asserted
 * here so a future "simplification" of the patterns fails loudly —
 * and to leaving ordinary markup alone.
 *
 *   pnpm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stripActiveHtml } from "../src/lib/contentPolicy.ts";

const gone = (input, needle) => {
  const out = stripActiveHtml(input);
  assert.ok(!out.toLowerCase().includes(needle.toLowerCase()), `"${needle}" survived in: ${out}`);
};
const kept = (input, needle) => {
  assert.ok(stripActiveHtml(input).includes(needle), `"${needle}" was removed from: ${input}`);
};

describe("stripActiveHtml — active content is removed", () => {
  it("removes scripts, including the split-tag reassembly", () => {
    gone(`<script>alert(1)</script><p>hi</p>`, "<script");
    gone(`<scr<script></script>ipt>alert(1)</scr<script></script>ipt>`, "<script");
    gone(`<scr<script></script>ipt>alert(1)</scr<script></script>ipt>`, "alert(1)</scr");
  });

  it("removes inline handlers, quoted or not", () => {
    gone(`<div onclick="steal()">hi</div>`, "onclick");
    gone(`<img src=x onerror=alert(1)>`, "onerror");
  });

  it("blanks executable URL schemes in every spelling a browser resolves", () => {
    gone(`<a href="javascript:alert(1)">x</a>`, "javascript:");
    gone(`<a href="java&#115;cript:alert(1)">x</a>`, "cript:alert"); // entity-encoded
    gone(`<a href="java\tscript:alert(1)">x</a>`, "script:alert"); // tab inside the scheme
    gone(`<a href="data:text/html,<script>alert(1)</script>">x</a>`, "data:text/html");
    gone(`<button formaction="javascript:alert(1)">go</button>`, "javascript:");
  });

  it("removes srcdoc and the plugin/redirect tags", () => {
    gone(`<iframe srcdoc="<script>alert(1)</script>"></iframe>`, "srcdoc");
    gone(`<object data="x.swf"></object>`, "<object");
    gone(`<base href="https://evil.example/">`, "<base");
    gone(`<meta http-equiv="refresh" content="0;url=https://evil.example">`, "http-equiv");
  });

  it("removes SVG animation elements and executable CSS", () => {
    gone(`<svg><animate attributeName="href" values="javascript:alert(1)"/></svg>`, "<animate");
    gone(`<div style="width: expression(alert(1))">x</div>`, "expression(");
    gone(`<div style="background: url(javascript:alert(1))">x</div>`, "javascript:");
  });
});

describe("stripActiveHtml — ordinary markup is left alone", () => {
  it("keeps links, images, embeds and formatting", () => {
    kept(`<a href="https://example.com/page">x</a>`, "https://example.com/page");
    kept(`<img src="/uploads/cat.jpg" alt="cat">`, "/uploads/cat.jpg");
    kept(`<iframe src="https://www.youtube.com/embed/abc" allowfullscreen></iframe>`, "youtube.com/embed/abc");
    kept(`<p>Hello <strong>world</strong></p>`, "<strong>world</strong>");
    kept(`<div style="color: red">x</div>`, "color: red");
  });
});
