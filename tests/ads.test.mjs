#!/usr/bin/env node
/**
 * Unit tests for src/lib/ads.ts — the ad targeting and parsing logic.
 *
 * These import the real module (via tsx, a devDependency). They did not
 * always: the first version of this file re-implemented the logic inline
 * as a "contract test" that could never fail — it even asserted a
 * blocksFor default (`?? true`) the real function does not have — which
 * gave the suite, and CI, nothing true to say about the code it claimed
 * to cover (TEST-001). If a case here can pass without importing src/,
 * it does not belong here.
 *
 *   pnpm test
 *
 * Covers the bugs fixed in Oct 2026:
 * - parseAdBlocks: missing page-kind keys must default to true, not false
 * - blocksFor: pageKind filtering
 * - sidebarBlocksFor: slot filtering
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseAdBlocks, serializeAdBlocks, blocksFor, sidebarBlocksFor, isBlockLive, newAdBlock } from "../src/lib/ads.ts";

const live = (over = {}) => ({
  ...newAdBlock(0),
  enabled: true,
  code: "<div>ad</div>",
  position: "before_content",
  ...over,
});

const ALL_PAGES = { posts: true, homepage: true, category: true, static: true, search: true, archive: true };

describe("parseAdBlocks", () => {
  it("returns [] for empty or garbage input", () => {
    assert.deepEqual(parseAdBlocks(null), []);
    assert.deepEqual(parseAdBlocks(undefined), []);
    assert.deepEqual(parseAdBlocks("not json"), []);
    assert.deepEqual(parseAdBlocks("{}"), []);
  });

  it("keeps default true for page kinds a saved block predates", () => {
    // A block saved before some page kinds existed has a partial pages map.
    const [b] = parseAdBlocks(JSON.stringify([{ ...live(), pages: { posts: true, search: false } }]));
    assert.equal(b.pages.posts, true);
    assert.equal(b.pages.search, false); // an explicit false is honoured
    assert.equal(b.pages.homepage, true); // missing kinds stay true — the Oct 2026 bug flipped them
    assert.equal(b.pages.category, true);
    assert.equal(b.pages.archive, true);
  });

  it("falls back to disabled for an unknown position", () => {
    const [b] = parseAdBlocks(JSON.stringify([{ ...live(), position: "moon" }]));
    assert.equal(b.position, "disabled");
  });

  it("old blocks without sticky default to false", () => {
    const [b] = parseAdBlocks(JSON.stringify([{ id: "block-1", position: "sidebar" }]));
    assert.equal(b.sticky, false);
    assert.equal(b.sidebarPosition, "top");
  });

  it("round-trips through serialize", () => {
    const blocks = [live({ name: "Header" })];
    const back = parseAdBlocks(serializeAdBlocks(blocks));
    assert.equal(back.length, 1);
    assert.equal(back[0].name, "Header");
    assert.equal(back[0].position, "before_content");
  });

  it("serializes to null when no block has anything worth storing", () => {
    assert.equal(serializeAdBlocks([{ ...newAdBlock(0) }]), null);
    assert.equal(serializeAdBlocks([]), null);
  });
});

describe("isBlockLive", () => {
  it("requires enabled, a real position and code", () => {
    assert.equal(isBlockLive(live()), true);
    assert.equal(isBlockLive(live({ enabled: false })), false);
    assert.equal(isBlockLive(live({ position: "disabled" })), false);
    assert.equal(isBlockLive(live({ code: "   " })), false);
  });

  it("honours the schedule window", () => {
    const past = new Date(Date.now() - 3600_000).toISOString();
    const future = new Date(Date.now() + 3600_000).toISOString();
    assert.equal(isBlockLive(live({ startAt: future })), false);
    assert.equal(isBlockLive(live({ endAt: past })), false);
    assert.equal(isBlockLive(live({ startAt: past, endAt: future })), true);
  });
});

describe("blocksFor / sidebarBlocksFor", () => {
  const blocks = [
    live({ name: "post-top", position: "before_content" }),
    live({ name: "search-off", position: "before_content", pages: { ...ALL_PAGES, search: false } }),
    live({ name: "side", position: "sidebar", sidebarPosition: "top" }),
    live({ name: "side-bottom", position: "sidebar", sidebarPosition: "bottom" }),
    live({ name: "dead", position: "before_content", enabled: false }),
  ];

  it("filters by position, liveness and page kind", () => {
    assert.deepEqual(blocksFor(blocks, "before_content", "posts").map((b) => b.name), ["post-top", "search-off"]);
    assert.deepEqual(blocksFor(blocks, "before_content", "search").map((b) => b.name), ["post-top"]);
    assert.deepEqual(blocksFor(blocks, "after_content", "posts"), []);
  });

  it("filters sidebar blocks by slot", () => {
    assert.deepEqual(sidebarBlocksFor(blocks, "top", "posts").map((b) => b.name), ["side"]);
    assert.deepEqual(sidebarBlocksFor(blocks, "bottom", "posts").map((b) => b.name), ["side-bottom"]);
    assert.deepEqual(sidebarBlocksFor(blocks, "middle", "posts"), []);
  });
});
