#!/usr/bin/env node
/**
 * Unit tests for the pure security helpers in src/lib — the functions the
 * audit (TEST-001) named as the highest-risk untested modules:
 * secretCompare, privateAddress, loginProof, and the request guards
 * sameOrigin (SEC-002) and rateLimit's clientIp (SEC-005). All are
 * exercised through the real modules; none needs a database.
 *
 *   pnpm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { secretMatches } from "../src/lib/secretCompare.ts";
import { isPrivateAddress } from "../src/lib/privateAddress.ts";
import { crossSiteRequest } from "../src/lib/sameOrigin.ts";
import { clientIp } from "../src/lib/rateLimit.ts";

process.env.AUTH_SECRET ??= "test-secret-for-login-proof";
const { issueLoginProof, verifyLoginProof } = await import("../src/lib/loginProof.ts");

describe("secretMatches", () => {
  const secret = "a-very-long-cron-secret";
  it("accepts the exact secret", () => {
    assert.equal(secretMatches(secret, secret), true);
  });
  it("rejects a different, a longer, and an empty guess", () => {
    assert.equal(secretMatches(secret, "a-very-long-cron-secreX"), false);
    assert.equal(secretMatches(secret, secret + "x"), false);
    assert.equal(secretMatches(secret, ""), false);
  });
  it("refuses a stored secret too short to be worth checking", () => {
    assert.equal(secretMatches("short", "short"), false);
    assert.equal(secretMatches("", ""), false);
  });
});

describe("isPrivateAddress", () => {
  it("flags loopback, private, link-local and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.9", "172.16.0.1", "172.31.255.255", "169.254.169.254", "0.0.0.0", "::1", "::ffff:127.0.0.1", "fe80::1", "fd00::1"]) {
      assert.equal(isPrivateAddress(ip), true, ip);
    }
  });
  it("passes ordinary public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "203.0.113.7", "2606:4700:4700::1111"]) {
      assert.equal(isPrivateAddress(ip), false, ip);
    }
  });
  it("treats input it cannot parse as private (fail closed)", () => {
    assert.equal(isPrivateAddress("not-an-ip"), true);
    assert.equal(isPrivateAddress("999.1.1.1"), true);
  });
});

describe("loginProof", () => {
  it("verifies a proof it issued, for the same email", () => {
    const proof = issueLoginProof("Admin@Example.com");
    assert.equal(verifyLoginProof(proof, "admin@example.com"), true);
  });
  it("rejects a proof issued for someone else, and tampering", () => {
    const proof = issueLoginProof("admin@example.com");
    assert.equal(verifyLoginProof(proof, "other@example.com"), false);
    const tampered = proof.slice(0, -2) + (proof.endsWith("AA") ? "BB" : "AA");
    assert.equal(verifyLoginProof(tampered, "admin@example.com"), false);
    assert.equal(verifyLoginProof("garbage", "admin@example.com"), false);
    assert.equal(verifyLoginProof(null, "admin@example.com"), false);
  });
});

describe("crossSiteRequest (SEC-002)", () => {
  const req = (method, url, headers) => ({ method, url, headers: new Headers(headers) });
  it("allows a same-origin write and blocks a sibling subdomain", () => {
    assert.equal(crossSiteRequest(req("POST", "https://cms.example.com/api/settings", { origin: "https://cms.example.com", host: "cms.example.com" })), false);
    assert.equal(crossSiteRequest(req("POST", "https://cms.example.com/api/settings", { origin: "https://evil.example.com", host: "cms.example.com" })), true);
  });
  it("blocks an explicit cross-site fetch, allows header-less callers", () => {
    assert.equal(crossSiteRequest(req("POST", "https://cms.example.com/api/posts", { "sec-fetch-site": "cross-site", origin: "https://other.org", host: "cms.example.com" })), true);
    assert.equal(crossSiteRequest(req("POST", "https://cms.example.com/api/cron/x", { host: "cms.example.com" })), false);
  });
  it("never blocks safe methods or NextAuth's own routes", () => {
    assert.equal(crossSiteRequest(req("GET", "https://cms.example.com/api/posts", { origin: "https://other.org", host: "cms.example.com" })), false);
    assert.equal(crossSiteRequest(req("POST", "https://cms.example.com/api/auth/signin", { origin: "https://other.org", host: "cms.example.com" })), false);
  });
});

describe("clientIp (SEC-005)", () => {
  const req = (h) => ({ headers: { get: (n) => h[n.toLowerCase()] ?? null } });
  it("ignores CDN headers a direct visitor forged", () => {
    assert.equal(clientIp(req({ "x-forwarded-for": "9.9.9.9", "true-client-ip": "1.1.1.1", "cf-connecting-ip": "2.2.2.2" })), "9.9.9.9");
  });
  it("believes cf-connecting-ip when the last hop is Cloudflare", () => {
    assert.equal(clientIp(req({ "x-forwarded-for": "203.0.113.7, 104.16.5.4", "cf-connecting-ip": "203.0.113.7" })), "203.0.113.7");
    assert.equal(clientIp(req({ "x-forwarded-for": "2001:db8::1, 2606:4700:4700::1", "cf-connecting-ip": "2001:db8::1" })), "2001:db8::1");
  });
  it("falls back to the last forwarded hop, then x-real-ip, then unknown", () => {
    assert.equal(clientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.2" })), "10.0.0.2");
    assert.equal(clientIp(req({ "x-real-ip": "198.51.100.3" })), "198.51.100.3");
    assert.equal(clientIp(req({})), "unknown");
  });
  it("honours CDN headers under an operator-asserted trusted proxy", () => {
    process.env.TRUST_PROXY_HEADERS = "1";
    try {
      assert.equal(clientIp(req({ "x-forwarded-for": "9.9.9.9", "true-client-ip": "1.1.1.1" })), "1.1.1.1");
    } finally {
      delete process.env.TRUST_PROXY_HEADERS;
    }
  });
});
