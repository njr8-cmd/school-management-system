import assert from "node:assert/strict";
import test from "node:test";
import {
  availableCreditCents,
  billOutstandingCents,
  billStatusAfterSettlement,
  centsToMoney,
  isAuditableManualCredit,
  issueDateWithinAcademicYear,
  parsePositiveAmountToCents,
} from "../../src/lib/finance/student-credit-rules.ts";
import { authorizeCreditSession } from "../../src/lib/finance/credit-authorization.ts";

test("credit amounts require positive values with at most two decimal places", () => {
  assert.equal(parsePositiveAmountToCents("12.34"), 1234);
  assert.equal(parsePositiveAmountToCents(0.01), 1);
  assert.equal(parsePositiveAmountToCents("0"), null);
  assert.equal(parsePositiveAmountToCents("-1.00"), null);
  assert.equal(parsePositiveAmountToCents("1.001"), null);
  assert.equal(parsePositiveAmountToCents("Infinity"), null);
});

test("reversed applications restore credit availability", () => {
  const available = availableCreditCents("100.00", [
    { amount: "35.25", reversedAt: null },
    { amount: "10.00", reversedAt: new Date() },
    { amount: "14.75", reversedAt: null },
  ]);

  assert.equal(available, 5000);
  assert.equal(centsToMoney(available), 50);
});

test("bill balance subtracts payments, waivers, and only active credits", () => {
  const outstanding = billOutstandingCents({
    totalAmount: "100.00",
    payments: [
      { amount: "20.25", waiverAmount: "4.75" },
      { amount: "5.00", waiverAmount: "0.00" },
    ],
    applications: [
      { amount: "10.00", reversedAt: null },
      { amount: "60.00", reversedAt: new Date() },
    ],
  });

  assert.equal(outstanding, 6000);
  assert.equal(centsToMoney(outstanding), 60);
});

test("settlement status accounts for active credits without changing cash paid", () => {
  assert.equal(
    billStatusAfterSettlement({
      totalAmountCents: 10000,
      paidAmountCents: 5000,
      waiverAmountCents: 0,
      appliedCreditCents: 5000,
    }),
    "PAID",
  );
  assert.equal(
    billStatusAfterSettlement({
      totalAmountCents: 10000,
      paidAmountCents: 0,
      waiverAmountCents: 0,
      appliedCreditCents: 2500,
    }),
    "PARTIAL",
  );
  assert.equal(
    billStatusAfterSettlement({
      totalAmountCents: 10000,
      paidAmountCents: 0,
      waiverAmountCents: 0,
      appliedCreditCents: 0,
    }),
    "UNPAID",
  );
});

test("only complete manual adjustment credits are eligible for application", () => {
  const completeCredit = {
    source: "MANUAL_ADJUSTMENT",
    sourcePaymentId: null,
    issueDate: new Date("2026-07-01T12:00:00.000Z"),
    reason: "Approved fee correction",
    notes: "Adjustment ref 123",
    issuedByUserId: "accountant-1",
  };

  assert.equal(isAuditableManualCredit(completeCredit), true);
  assert.equal(
    isAuditableManualCredit({
      ...completeCredit,
      issuedByUserId: null,
    }),
    false,
  );
  assert.equal(
    isAuditableManualCredit({
      ...completeCredit,
      source: "OVERPAYMENT",
    }),
    false,
  );
  assert.equal(
    isAuditableManualCredit({
      ...completeCredit,
      sourcePaymentId: "payment-1",
    }),
    false,
  );
});

test("credit issue dates must be inside their recorded academic year", () => {
  const start = new Date("2026-04-14T00:00:00.000Z");
  const end = new Date("2027-04-13T00:00:00.000Z");

  assert.equal(
    issueDateWithinAcademicYear(
      new Date("2026-04-14T00:00:00.000Z"),
      start,
      end,
    ),
    true,
  );
  assert.equal(
    issueDateWithinAcademicYear(
      new Date("2027-04-14T00:00:00.000Z"),
      start,
      end,
    ),
    false,
  );
  assert.equal(issueDateWithinAcademicYear(null, start, end), false);
});

test("credit management is available to ADMIN and ACCOUNTANT", () => {
  const anonymous = authorizeCreditSession(null);
  const invalidRole = authorizeCreditSession({
    user: { id: "unknown-1", role: "UNKNOWN" },
  });
  const admin = authorizeCreditSession({
    user: { id: "admin-1", role: "ADMIN" },
  });
  const accountant = authorizeCreditSession({
    user: { id: "accountant-1", role: "ACCOUNTANT" },
  });

  assert.equal(anonymous.ok, false);
  if (!anonymous.ok) {
    assert.equal(anonymous.response.status, 401);
  }

  assert.equal(invalidRole.ok, false);
  if (!invalidRole.ok) {
    assert.equal(invalidRole.response.status, 403);
  }

  assert.deepEqual(admin, {
    ok: true,
    actorId: "admin-1",
  });
  assert.deepEqual(accountant, {
    ok: true,
    actorId: "accountant-1",
  });
});
