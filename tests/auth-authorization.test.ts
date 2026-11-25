import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizeSession } from "../src/lib/auth/authorization";
import { isAppRole } from "../src/lib/auth/roles";

test("both application roles are valid and unknown roles are rejected", () => {
  assert.equal(isAppRole("ADMIN"), true);
  assert.equal(isAppRole("ACCOUNTANT"), true);
  assert.equal(isAppRole("UNKNOWN"), false);
});

test("ADMIN and ACCOUNTANT are both authorized for operational access", () => {
  for (const role of ["ADMIN", "ACCOUNTANT"] as const) {
    assert.deepEqual(
      authorizeSession({ user: { id: "user-1", role } }, [
        "ADMIN",
        "ACCOUNTANT",
      ]),
      { ok: true, userId: "user-1", role },
    );
  }
});

test("only ADMIN is authorized for account management", () => {
  assert.equal(
    authorizeSession(
      { user: { id: "admin-1", role: "ADMIN" } },
      ["ADMIN"],
    ).ok,
    true,
  );
  assert.deepEqual(
    authorizeSession(
      { user: { id: "accountant-1", role: "ACCOUNTANT" } },
      ["ADMIN"],
    ),
    {
      ok: false,
      status: 403,
      message: "You do not have permission to perform this action.",
    },
  );
});

test("anonymous or malformed sessions are rejected", () => {
  const anonymous = authorizeSession(null, ["ADMIN"]);
  const invalidRole = authorizeSession(
    { user: { id: "unknown-1", role: "UNKNOWN" } },
    ["ADMIN"],
  );
  const missingId = authorizeSession(
    { user: { id: "", role: "ADMIN" } },
    ["ADMIN"],
  );

  for (const result of [anonymous, invalidRole, missingId]) {
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
    }
  }
});
