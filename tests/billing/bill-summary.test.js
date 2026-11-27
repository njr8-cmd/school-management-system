import assert from "node:assert/strict";
import test from "node:test";
import {
  billOutstandingAmount,
  sumActiveBilledAmount,
} from "../../src/lib/finance/bill-summary.ts";

test("sums one or more active bills", () => {
  assert.equal(
    sumActiveBilledAmount([
      { status: "UNPAID", totalAmount: "1250.00" },
    ]),
    1250,
  );
  assert.equal(
    sumActiveBilledAmount([
      { status: "UNPAID", totalAmount: "1250.00" },
      { status: "PARTIAL", totalAmount: 750 },
      { status: "PAID", totalAmount: 2000 },
    ]),
    4000,
  );
});

test("excludes cancelled bills while retaining their historical rows", () => {
  const bills = [
    { id: "active-1", status: "UNPAID", totalAmount: "1250.00" },
    { id: "cancelled-unpaid", status: "CANCELLED", totalAmount: "5000.00" },
    { id: "cancelled-partial", status: "CANCELLED", totalAmount: "800.00" },
    { id: "cancelled-paid", status: "CANCELLED", totalAmount: "300.00" },
    { id: "active-2", status: "PARTIAL", totalAmount: "750.00" },
  ];

  assert.equal(sumActiveBilledAmount(bills), 2000);
  assert.equal(sumActiveBilledAmount(bills), 2000);
  assert.equal(bills.length, 5);
  assert.equal(bills[1].status, "CANCELLED");
});

test("a cancelled-only list contributes nothing to active billed totals", () => {
  assert.equal(
    sumActiveBilledAmount([
      { status: "CANCELLED", totalAmount: "9000.00" },
    ]),
    0,
  );
});

test("cancelled bills do not affect outstanding or other bills' balances", () => {
  const cancelledBills = [
    { status: "CANCELLED", totalAmount: 1000, paidAmount: 0 },
    { status: "CANCELLED", totalAmount: 1000, paidAmount: 400 },
    { status: "CANCELLED", totalAmount: 1000, paidAmount: 1000 },
  ];

  assert.deepEqual(
    cancelledBills.map((bill) =>
      billOutstandingAmount({
        ...bill,
        waiverAmount: 0,
        creditAmount: 0,
      }),
    ),
    [0, 0, 0],
  );
  assert.equal(
    billOutstandingAmount({
      status: "PARTIAL",
      totalAmount: 2000,
      paidAmount: 500,
      waiverAmount: 100,
      creditAmount: 200,
    }),
    1200,
  );
});
