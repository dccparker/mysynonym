import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isRecoveryCallback, cooldownRemaining, describeResetError, friendlyAuthError, isObfuscatedDuplicateSignup, isUnconfirmedEmail, validatePassword } from "./auth-messages.ts";

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

describe("password reset errors", () => {
  test("per-user cooldown reports the wait", () => {
    const r = describeResetError({ message: "For security purposes, you can only request this after 42 seconds.", status: 429 });
    assert.equal(r.cooldownSeconds, 42);
    assert.match(r.message, /42 seconds/);
  });
  test("hourly email limit is explained differently", () => {
    const r = describeResetError({ message: "email rate limit exceeded", code: "over_email_send_rate_limit", status: 429 });
    assert.match(r.message, /hour/);
    assert.ok(r.cooldownSeconds > 0);
  });
  test("network and unknown errors", () => {
    assert.match(describeResetError({ message: "Failed to fetch" }).message, /reach MySynonym/);
    assert.match(describeResetError({ message: "boom" }).message, /couldn't send/);
  });
  test("cooldown countdown", () => {
    assert.equal(cooldownRemaining(null, 1000), 0);
    assert.equal(cooldownRemaining(6000, 1000), 5);
    assert.equal(cooldownRemaining(500, 1000), 0);
  });
});

describe("recovery link detection", () => {
  test("detects recovery in hash or query", () => {
    assert.equal(isRecoveryCallback("#access_token=a&refresh_token=b&type=recovery"), true);
    assert.equal(isRecoveryCallback("", "?type=recovery&token_hash=x"), true);
  });
  test("ignores other callbacks", () => {
    assert.equal(isRecoveryCallback("#access_token=a&type=signup"), false);
    assert.equal(isRecoveryCallback("", ""), false);
  });
});
