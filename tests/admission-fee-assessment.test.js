import assert from "node:assert/strict";
import test from "node:test";
import {
  admissionFeeReceivableCents,
  isAdmissionFeeStatus,
} from "../src/lib/finance/admission-fee-assessment.ts";

test("admission-fee reconciliation states produce correct receivable amounts", () => {
  assert.equal(
    admissionFeeReceivableCents({
      applicableAmountCents: 500000,
      status: "NOT_PAID",
    }),
    500000,
  );
  assert.equal(
    admissionFeeReceivableCents({
      applicableAmountCents: 500000,
      status: "PARTIAL_PAID",
      historicalPaymentAmountCents: 200000,
    }),
    300000,
  );
  assert.equal(
    admissionFeeReceivableCents({
      applicableAmountCents: 500000,
      status: "FULL_PAID",
    }),
    0,
  );
  assert.equal(
    admissionFeeReceivableCents({
      applicableAmountCents: 500000,
      status: "EXEMPTED",
    }),
    0,
  );
});

test("admission-fee reconciliation rejects invalid partial amounts", () => {
  assert.throws(
    () =>
      admissionFeeReceivableCents({
        applicableAmountCents: 500000,
        status: "PARTIAL_PAID",
        historicalPaymentAmountCents: 500001,
      }),
    /Invalid partial historical payment amount/,
  );
  assert.equal(isAdmissionFeeStatus("PENDING"), false);
  assert.equal(isAdmissionFeeStatus("NOT_PAID"), true);
});

test("historical credit is independent of academic-year carry-forward", () => {
  const yearOne = admissionFeeReceivableCents({
    applicableAmountCents: 500000,
    status: "FULL_PAID",
  });
  const yearTwo = admissionFeeReceivableCents({
    applicableAmountCents: 500000,
    status: "NOT_PAID",
  });
  assert.equal(yearOne, 0);
  assert.equal(yearTwo, 500000);
});
