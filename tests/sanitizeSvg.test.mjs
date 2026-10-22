#!/usr/bin/env node
/**
 * Unit tests for src/lib/sanitizeSvg.ts — the SVG sanitiser every upload,
 * plugin asset and archive restore passes through.
 *
 * The centre of this file is the SEC-001 table: a quoted ">" inside an
 * attribute value used to end the tag early in the old regex passes, so
 * everything after it — an onload handler, a javascript: href — was
 * emitted unchecked. Those exact inputs are asserted inert here, against
 * the real module, so the bypass cannot come back silently.
 *
 *   pnpm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeSvg } from "../src/lib/sanitizeSvg.ts";

const clean = (input) => {
  const r = sanitizeSvg(input);
  assert.notEqual(r, null, `expected a result for: ${input}`);
  return r;
};

describe("sanitizeSvg — active content is removed", () => {
  it("removes a script element with its contents", () => {
    const r = clean(`<svg><script>alert(1)</script></svg>`);
    assert.ok(!r.svg.includes("script"));
    assert.ok(r.removed.length > 0);
  });

  it("removes event handlers on root and child elements", () => {
    assert.ok(!clean(`<svg onload="alert(1)"></svg>`).svg.includes("onload"));
    assert.ok(!clean(`<svg><rect onload="alert(1)"/></svg>`).svg.includes("onload"));
  });

  it("removes foreignObject and animation elements", () => {
    const r = clean(`<svg><foreignObject><body>x</body></foreignObject></svg>`);
    assert.ok(!r.svg.includes("foreignObject"));
    const a = clean(`<svg><rect><animate attributeName="x" onbegin="alert(1)"/></rect></svg>`);
    assert.ok(!a.svg.includes("animate") && !a.svg.includes("onbegin"));
  });

  it("drops external and javascript: URLs, keeps #ids and data images", () => {
    assert.ok(!clean(`<svg><use href="https://evil.example/x.svg#y"/></svg>`).svg.includes("evil"));
    assert.ok(!clean(`<svg><use href="javascript:alert(1)"/></svg>`).svg.includes("javascript:"));
    assert.ok(clean(`<svg><use href="#gradient"/></svg>`).svg.includes('href="#gradient"'));
    assert.ok(clean(`<svg><image href="data:image/png;base64,iVBORw0KGgo="/></svg>`).svg.includes("data:image/png"));
  });

  it("strips @import and external url() from style blocks", () => {
    const r = clean(`<svg><style>@import url(http://evil.example/x.css);.a{fill:red}</style></svg>`);
    assert.ok(!r.svg.includes("@import"));
    assert.ok(r.svg.includes(".a{fill:red}"));
  });
});

describe("sanitizeSvg — SEC-001: a quoted > must not end the tag early", () => {
  const vectors = [
    `<svg xmlns="http://www.w3.org/2000/svg" title="a>b" onload="alert(1)"></svg>`,
    `<svg><rect title="a>b" onload="alert(1)"/></svg>`,
    `<svg><rect title='a>b' onload='alert(1)'/></svg>`,
    `<svg><rect style="a>b" onclick="x()"/></svg>`,
    `<svg><rect x="1"/onload=alert(1)/></svg>`,
  ];
  for (const input of vectors) {
    it(`inert: ${input.slice(0, 52)}…`, () => {
      const r = clean(input);
      assert.ok(!/on\w+=/i.test(r.svg), `handler survived in: ${r.svg}`);
      assert.ok(r.removed.length > 0, "the removal was recorded");
    });
  }

  it("a javascript: href after a quoted > is dropped", () => {
    const r = clean(`<svg><use title="a>b" href="javascript:alert(1)"/></svg>`);
    assert.ok(!r.svg.includes("javascript:"));
    assert.ok(r.svg.includes('title="a>b"'), "the innocent attribute survives intact");
  });

  it("refuses a tag whose quote never closes", () => {
    const r = sanitizeSvg(`<svg><rect title="abc onload="alert(1)"/></svg>`);
    assert.ok(r === null || !r.svg.includes("onload"));
  });
});

describe("sanitizeSvg — legitimate SVGs pass", () => {
  it("a typical icon is untouched", () => {
    const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 22h20L12 2z" fill="#333"/><circle cx="12" cy="14" r="3"/></svg>`;
    const r = clean(icon);
    assert.deepEqual(r.removed, []);
    assert.ok(r.svg.includes('viewBox="0 0 24 24"'));
  });

  it("gradients, internal references and style blocks survive", () => {
    const r = clean(
      `<svg><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs>` +
        `<style>.a{fill:#123456}.b{fill:url(#g)}</style><rect class="a" fill="url(#g)" width="10" height="10"/></svg>`
    );
    assert.ok(r.svg.includes('stop-color="#fff"'));
    assert.ok(r.svg.includes(".a{fill:#123456}"));
    assert.ok(r.svg.includes('fill="url(#g)"'));
  });

  it("rejects input that is not a single svg document", () => {
    assert.equal(sanitizeSvg(`<div>not an svg</div>`), null);
    assert.equal(sanitizeSvg(``), null);
  });
});
