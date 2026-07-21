import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  classifyRumXhrNavigationLifecycle,
  isCompletedRumNavigationLifecycle,
} = require("./tests/e2e/helpers");

const completedNavigation = {
  errorText: "net::ERR_ABORTED",
  method: "POST",
  navigationCommitted: true,
  pathname: "/cdn-cgi/rum",
  priorSuccessfulStatus: 204,
  resourceType: "ping",
  sameOrigin: true,
};

test("successful RUM followed by an unload ping and committed navigation is a completed lifecycle", () => {
  assert.equal(isCompletedRumNavigationLifecycle(completedNavigation), true);
});

test("RUM lifecycle requires a prior successful response", () => {
  assert.equal(isCompletedRumNavigationLifecycle({ ...completedNavigation, priorSuccessfulStatus: undefined }), false);
  assert.equal(isCompletedRumNavigationLifecycle({ ...completedNavigation, priorSuccessfulStatus: 500 }), false);
});

test("RUM lifecycle requires a subsequent navigation commit", () => {
  assert.equal(isCompletedRumNavigationLifecycle({ ...completedNavigation, navigationCommitted: false }), false);
});

test("RUM lifecycle does not classify unrelated request failures", () => {
  assert.equal(isCompletedRumNavigationLifecycle({ ...completedNavigation, pathname: "/api/account/state" }), false);
  assert.equal(isCompletedRumNavigationLifecycle({ ...completedNavigation, method: "GET" }), false);
  assert.equal(isCompletedRumNavigationLifecycle({ ...completedNavigation, resourceType: "xhr" }), false);
  assert.equal(isCompletedRumNavigationLifecycle({ ...completedNavigation, sameOrigin: false }), false);
  assert.equal(isCompletedRumNavigationLifecycle({ ...completedNavigation, errorText: "net::ERR_FAILED" }), false);
});

const completedXhrNavigation = {
  canceled: true,
  consoleCspErrorCount: 0,
  contextClosedEpochMs: null,
  destinationCommittedEpochMs: 1_016,
  destinationDocumentUrl: "https://onmyway.olivenrich.com/",
  destinationFrameId: "main-frame",
  destinationLoaderId: "destination-loader",
  errorText: "net::ERR_ABORTED",
  failedEpochMs: 1_003,
  hiddenEpochMs: 1_001,
  initiatorScriptUrls: [
    "https://static.cloudflareinsights.com/beacon.min.js/v4513226cdae34746b4dedf0b4dfa099e1781791509496",
  ],
  initiatorType: "script",
  loadingFailed: true,
  loadingFinished: false,
  mainFrameId: "main-frame",
  method: "POST",
  pageClosedEpochMs: null,
  pagehideEpochMs: 1_000,
  pathname: "/cdn-cgi/rum",
  requestCspFailureCount: 0,
  requestOrigin: "https://onmyway.olivenrich.com",
  requestStartedEpochMs: 1_002,
  resourceType: "xhr",
  responseStatus: null,
  sourceDocumentUrl: "https://onmyway.olivenrich.com/",
  sourceFrameId: "main-frame",
  sourceLoaderId: "source-loader",
};

test("Cloudflare RUM XHR aborted during a proven document reload is a navigation lifecycle", () => {
  assert.deepEqual(classifyRumXhrNavigationLifecycle(completedXhrNavigation), {
    httpCompleted: false,
    navigationLifecycleCompleted: true,
    classification: "xhr-navigation-abort-classified",
  });
});

test("Cloudflare RUM XHR classification keeps HTTP and navigation completion distinct", () => {
  const result = classifyRumXhrNavigationLifecycle(completedXhrNavigation);
  assert.equal(result.httpCompleted, false);
  assert.equal(result.navigationLifecycleCompleted, true);
});

test("Cloudflare RUM XHR lifecycle rejects any missing or unrelated evidence", async (t) => {
  const rejected = [
    ["other path", { pathname: "/api/account/state" }],
    ["other method", { method: "GET" }],
    ["other origin", { requestOrigin: "https://example.com" }],
    ["fetch resource", { resourceType: "fetch" }],
    ["ping resource", { resourceType: "ping" }],
    ["unclear initiator", { initiatorScriptUrls: [] }],
    ["ordinary script initiator", { initiatorScriptUrls: ["https://onmyway.olivenrich.com/script.js"] }],
    ["other Cloudflare script", { initiatorScriptUrls: ["https://static.cloudflareinsights.com/other.js"] }],
    ["lookalike Cloudflare host", { initiatorScriptUrls: ["https://evil.cloudflareinsights.com/beacon.min.js/version"] }],
    ["source is not the main frame", { sourceFrameId: "child-frame" }],
    ["destination is not the main frame", { destinationFrameId: "child-frame" }],
    ["missing pagehide", { pagehideEpochMs: null }],
    ["missing hidden transition", { hiddenEpochMs: null }],
    ["missing navigation", { destinationCommittedEpochMs: null }],
    ["same loader", { destinationLoaderId: "source-loader" }],
    ["missing destination document", { destinationDocumentUrl: "" }],
    ["failed error", { errorText: "net::ERR_FAILED" }],
    ["connection reset", { errorText: "net::ERR_CONNECTION_RESET" }],
    ["CSP console failure", { consoleCspErrorCount: 1 }],
    ["CSP request failure", { requestCspFailureCount: 1 }],
    ["page closed first", { pageClosedEpochMs: 1_002 }],
    ["context closed first", { contextClosedEpochMs: 1_002 }],
    ["page closed before commit", { pageClosedEpochMs: 1_010 }],
    ["not canceled", { canceled: false }],
    ["HTTP response exists", { responseStatus: 204 }],
    ["loading finished", { loadingFinished: true }],
    ["outside timing window", { destinationCommittedEpochMs: 1_103 }],
  ];
  for (const [name, override] of rejected) {
    await t.test(name, () => {
      assert.deepEqual(classifyRumXhrNavigationLifecycle({ ...completedXhrNavigation, ...override }), {
        httpCompleted: false,
        navigationLifecycleCompleted: false,
        classification: "unclassified-failure",
      });
    });
  }
});
