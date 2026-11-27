import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAdminSessionCurrent } from "./admin-session";

describe("administrator session generation guard", () => {
  it("accepts a completion only for the same active administrator and generation", () => {
    assert.equal(isAdminSessionCurrent(4, 4, "admin-a", "admin-a"), true);
  });

  it("rejects a completion after the administrator identity changes", () => {
    assert.equal(isAdminSessionCurrent(4, 4, "admin-a", "admin-b"), false);
  });

  it("rejects a completion after the session generation changes", () => {
    assert.equal(isAdminSessionCurrent(4, 5, "admin-a", "admin-a"), false);
  });

  it("fails closed when either identity is absent or empty", () => {
    assert.equal(isAdminSessionCurrent(4, 4, null, "admin-a"), false);
    assert.equal(isAdminSessionCurrent(4, 4, "admin-a", null), false);
    assert.equal(isAdminSessionCurrent(4, 4, "", ""), false);
  });
});
