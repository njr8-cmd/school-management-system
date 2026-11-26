import assert from "node:assert/strict";
import test from "node:test";
import { sumActiveBilledAmount } from "../../src/lib/finance/bill-summary.ts";

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
    { id: "cancelled-1", status: "CANCELLED", totalAmount: "5000.00" },
    { id: "active-2", status: "PARTIAL", totalAmount: "750.00" },
  ];

  assert.equal(sumActiveBilledAmount(bills), 2000);
  assert.equal(sumActiveBilledAmount(bills), 2000);
  assert.equal(bills.length, 3);
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
