type BillAmount = string | number | null | undefined;

type BillTotal = {
  status: string;
  totalAmount: BillAmount;
};

export function sumActiveBilledAmount(
  bills: readonly BillTotal[],
): number {
  return bills.reduce((total, bill) => {
    if (bill.status === "CANCELLED") {
      return total;
    }

    const amount = Number(bill.totalAmount ?? 0);
    return total + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}
