import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createUserSchema,
  updateUserSchema,
} from "../src/lib/auth/user-account-validation";

test("user creation accepts only the two approved roles", () => {
  const base = {
    name: "Test User",
    email: "test@example.test",
    password: "a-secure-test-password",
  };

  assert.equal(
    createUserSchema.safeParse({ ...base, role: "ADMIN" }).success,
    true,
  );
  assert.equal(
    createUserSchema.safeParse({ ...base, role: "ACCOUNTANT" }).success,
    true,
  );
  assert.equal(
    createUserSchema.safeParse({ ...base, role: "BOARD_MEMBER" }).success,
    false,
  );
  assert.equal(
    createUserSchema.safeParse({
      ...base,
      password: "short",
      role: "ACCOUNTANT",
    }).success,
    false,
  );
});

test("account updates accept role changes but reject empty or password updates", () => {
  assert.equal(updateUserSchema.safeParse({ role: "ACCOUNTANT" }).success, true);
  assert.equal(updateUserSchema.safeParse({ role: "ADMIN" }).success, true);
  assert.equal(updateUserSchema.safeParse({}).success, false);
  assert.equal(
    updateUserSchema.safeParse({ password: "new-password-value" }).success,
    false,
  );
});
