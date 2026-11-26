import assert from "node:assert/strict";
import test from "node:test";
import {
  availableCreditCents,
  billOutstandingCents,
  billStatusAfterSettlement,
  calculateStatementOutstandingCents,
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

test("statement carries prior terms forward without duplicating their original bills", () => {
  const statement = calculateStatementOutstandingCents({
    previousAcademicYearBills: [],
    selectedAcademicYearBills: [
      {
        status: "UNPAID",
        totalAmount: "5000.00",
        payments: [],
        applications: [],
        periodStartYear: 2083,
        periodStartMonth: 1,
        periodEndYear: 2083,
        periodEndMonth: 3,
      },
      {
        status: "UNPAID",
        totalAmount: "3000.00",
        payments: [],
        applications: [],
        periodStartYear: 2083,
        periodStartMonth: 4,
        periodEndYear: 2083,
        periodEndMonth: 6,
      },
      {
        status: "UNPAID",
        totalAmount: "8000.00",
        payments: [],
        applications: [],
        periodStartYear: 2083,
        periodStartMonth: 7,
        periodEndYear: 2083,
        periodEndMonth: 9,
      },
    ],
  });

  assert.equal(centsToMoney(statement.broughtForwardCents), 8000);
  assert.equal(centsToMoney(statement.currentPeriodCents), 8000);
  assert.equal(centsToMoney(statement.selectedAcademicYearCents), 16000);
  assert.equal(centsToMoney(statement.totalDueCents), 16000);
  assert.equal(
    statement.broughtForwardCents + statement.currentPeriodCents,
    statement.totalDueCents,
  );
});

test("statement allocates payments and credits per bill and excludes settled/cancelled debt", () => {
  const statement = calculateStatementOutstandingCents({
    previousAcademicYearBills: [
      {
        status: "PARTIAL",
        totalAmount: "4000.00",
        payments: [{ amount: "1000.00", waiverAmount: "0.00" }],
        applications: [{ amount: "500.00", reversedAt: null }],
      },
    ],
    selectedAcademicYearBills: [
      {
        status: "PARTIAL",
        totalAmount: "3000.00",
        payments: [{ amount: "500.00", waiverAmount: "100.00" }],
        applications: [{ amount: "300.00", reversedAt: null }],
        periodStartYear: 2083,
        periodStartMonth: 1,
        periodEndYear: 2083,
        periodEndMonth: 3,
      },
      {
        status: "PAID",
        totalAmount: "2000.00",
        payments: [{ amount: "2000.00", waiverAmount: "0.00" }],
        applications: [],
        periodStartYear: 2083,
        periodStartMonth: 4,
        periodEndYear: 2083,
        periodEndMonth: 6,
      },
      {
        status: "CANCELLED",
        totalAmount: "1000.00",
        payments: [],
        applications: [],
        periodStartYear: 2083,
        periodStartMonth: 4,
        periodEndYear: 2083,
        periodEndMonth: 6,
      },
      {
        status: "PARTIAL",
        totalAmount: "8000.00",
        payments: [{ amount: "3000.00", waiverAmount: "0.00" }],
        applications: [],
        periodStartYear: 2083,
        periodStartMonth: 7,
        periodEndYear: 2083,
        periodEndMonth: 9,
      },
    ],
  });

  assert.equal(centsToMoney(statement.broughtForwardCents), 4600);
  assert.equal(centsToMoney(statement.currentPeriodCents), 5000);
  assert.equal(centsToMoney(statement.selectedAcademicYearCents), 7100);
  assert.equal(centsToMoney(statement.totalDueCents), 9600);
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
