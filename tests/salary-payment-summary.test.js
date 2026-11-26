import assert from "node:assert/strict";
import test from "node:test";
import { getSalaryPaymentSummary } from "../src/lib/finance/salary-payment-summary.ts";

test("legacy paid salary without payment rows is unreconciled, not cash paid", () => {
  assert.deepEqual(
    getSalaryPaymentSummary({
      netAmount: "1250.00",
      status: "PAID",
      payments: [],
    }),
    {
      paidAmount: 0,
      remainingAmount: 1250,
      status: "UNRECONCILED",
    },
  );
});

test("recorded payments determine paid amount and remaining salary", () => {
  assert.deepEqual(
    getSalaryPaymentSummary({
      netAmount: "1250.00",
      status: "PAID",
      payments: [{ amount: "400.25" }],
    }),
    {
      paidAmount: 400.25,
      remainingAmount: 849.75,
      status: "PARTIAL",
    },
  );
});
