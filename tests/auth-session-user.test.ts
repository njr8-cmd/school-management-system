import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getCurrentSessionUser,
  refreshSessionToken,
} from "../src/lib/auth/session-user";

test("missing and deleted users have no current session identity", async () => {
  let lookups = 0;
  const findUser = async () => {
    lookups += 1;
    return null;
  };

  assert.equal(await getCurrentSessionUser(undefined, findUser), null);
  assert.equal(await getCurrentSessionUser("", findUser), null);
  assert.equal(await getCurrentSessionUser("deleted-user", findUser), null);
  assert.equal(lookups, 1);
});

test("current database role replaces the role carried by an old JWT", async () => {
  const token = await refreshSessionToken(
    { id: "qa-user", role: "ADMIN", sub: "qa-user" },
    "qa-user",
    async (id) => ({
      id,
      name: "QA Accountant",
      email: "qa.accountant@example.test",
      role: "ACCOUNTANT",
    }),
  );

  assert.deepEqual(token, {
    id: "qa-user",
    role: "ACCOUNTANT",
    sub: "qa-user",
    name: "QA Accountant",
    email: "qa.accountant@example.test",
  });
  assert.deepEqual(await getCurrentSessionUser(
    "qa-user",
    async (id) => ({
      id,
      name: "QA Accountant",
      email: "qa.accountant@example.test",
      role: "ACCOUNTANT",
    }),
  ), {
    id: "qa-user",
    name: "QA Accountant",
    email: "qa.accountant@example.test",
    role: "ACCOUNTANT",
  });
});

test("unknown database roles fail closed", async () => {
  assert.equal(
    await getCurrentSessionUser("unknown-role-user", async (id) => ({
      id,
      name: "Invalid",
      email: "invalid@example.test",
      role: "BOARD_MEMBER",
    })),
    null,
  );
});

test("database lookup errors propagate instead of granting a session", async () => {
  await assert.rejects(
    getCurrentSessionUser("qa-user", async () => {
      throw new Error("QA database unavailable");
    }),
    /QA database unavailable/,
  );
});
