import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decidePlanSync, hashPlan } from "./plan-sync.ts";

const plan = (n: number) => JSON.stringify([{ id: `s${n}` }]);
const base = { userId: "u1", localOwner: "u1", local: plan(1), remote: plan(1), lastSyncedHash: hashPlan(plan(1)) };

describe("plan sync decisions", () => {
  test("identical copies need nothing", () => {
    assert.equal(decidePlanSync(base), "noop");
  });
  test("an existing local plan is uploaded when the server has none (migration of old data)", () => {
    assert.equal(decidePlanSync({ ...base, localOwner: null, remote: null, lastSyncedHash: null }), "push");
  });
  test("a new device adopts the server plan", () => {
    assert.equal(decidePlanSync({ ...base, localOwner: null, local: null, lastSyncedHash: null }), "pull");
  });
  test("local edits since the last sync are pushed", () => {
    assert.equal(decidePlanSync({ ...base, local: plan(2) }), "push");
  });
  test("a newer server plan replaces an unedited local copy", () => {
    assert.equal(decidePlanSync({ ...base, remote: plan(3) }), "pull");
  });
  test("another account's plan is never uploaded or kept", () => {
    assert.equal(decidePlanSync({ ...base, localOwner: "someone-else", local: plan(9), remote: plan(1) }), "clear-local-and-pull");
  });
  test("both empty is a no-op", () => {
    assert.equal(decidePlanSync({ ...base, local: "[]", remote: null }), "noop");
  });
  test("unowned local data that differs from the server is treated as unsynced edits only when owned", () => {
    assert.equal(decidePlanSync({ ...base, localOwner: null, local: plan(2), remote: plan(3), lastSyncedHash: null }), "pull");
  });
});
