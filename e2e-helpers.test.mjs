import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isCompletedRumNavigationLifecycle } = require("./tests/e2e/helpers");

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
