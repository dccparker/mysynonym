import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { friendlyAuthError, isObfuscatedDuplicateSignup, isUnconfirmedEmail, validatePassword } from "./auth-messages.ts";

describe("auth messages", () => {
  test("unverified email is recognised and explained", () => {
    assert.ok(isUnconfirmedEmail({ message: "Email not confirmed" }));
    assert.match(friendlyAuthError({ message: "x", code: "email_not_confirmed" }, "signin"), /not verified/);
  });
  test("bad credentials", () => {
    assert.match(friendlyAuthError({ message: "Invalid login credentials" }, "signin"), /don't match/);
  });
  test("duplicate signup detection", () => {
    assert.equal(isObfuscatedDuplicateSignup({ identities: [] }), true);
    assert.equal(isObfuscatedDuplicateSignup({ identities: [{}] }), false);
    assert.equal(isObfuscatedDuplicateSignup(null), false);
  });
  test("password validation", () => {
    assert.equal(validatePassword("short"), "Use at least 8 characters.");
    assert.equal(validatePassword("longenough"), null);
  });
});
