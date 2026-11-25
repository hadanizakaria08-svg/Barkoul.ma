import test from "node:test";
import assert from "node:assert/strict";
import { getSourceMapMode } from "./build.mjs";

test("production builds do not publish source maps", () => {
  assert.equal(getSourceMapMode(false), false);
});

test("development watch builds retain inline source maps for debugging", () => {
  assert.equal(getSourceMapMode(true), "inline");
});
