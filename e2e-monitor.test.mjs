import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { isExpectedFirefoxNavigationImageAbort } = require("./tests/e2e/helpers.js");

const expectedAbort = Object.freeze({
  browserName: "firefox",
  errorText: "NS_BINDING_ABORTED",
  method: "GET",
  navigationLinked: true,
  pagePathname: "/app.html",
  pathname: "/assets/logo-ollie-symbol.png",
  resourceType: "image",
  sameOrigin: true,
});

test("accepts only the Firefox logo abort linked to an app navigation", () => {
  assert.equal(isExpectedFirefoxNavigationImageAbort(expectedAbort), true);
});

test("rejects the same Firefox logo abort without a linked navigation", () => {
  assert.equal(isExpectedFirefoxNavigationImageAbort({ ...expectedAbort, navigationLinked: false }), false);
});

test("rejects Firefox aborts for another image or an external logo", () => {
  assert.equal(isExpectedFirefoxNavigationImageAbort({ ...expectedAbort, pathname: "/assets/ollie-action.png" }), false);
  assert.equal(isExpectedFirefoxNavigationImageAbort({ ...expectedAbort, sameOrigin: false }), false);
});

test("rejects Firefox aborts for scripts, fetches, and xhr requests", () => {
  for (const resourceType of ["script", "fetch", "xhr"]) {
    assert.equal(isExpectedFirefoxNavigationImageAbort({ ...expectedAbort, resourceType }), false);
  }
});

test("rejects equivalent abort metadata from Chromium and WebKit", () => {
  for (const browserName of ["chromium", "webkit"]) {
    assert.equal(isExpectedFirefoxNavigationImageAbort({ ...expectedAbort, browserName }), false);
  }
});

test("rejects other Firefox network errors and non-GET requests", () => {
  assert.equal(isExpectedFirefoxNavigationImageAbort({ ...expectedAbort, errorText: "NS_ERROR_NET_RESET" }), false);
  assert.equal(isExpectedFirefoxNavigationImageAbort({ ...expectedAbort, method: "POST" }), false);
});
