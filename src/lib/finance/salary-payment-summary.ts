type MoneyValue = string | number | { toNumber(): number };

type SalaryStatus = "PENDING" | "PARTIAL" | "PAID";

type SalaryPaymentSummaryInput = {
  netAmount: MoneyValue;
  status: SalaryStatus;
  payments: { amount: MoneyValue }[];
};

export type SalaryPaymentSummary = {
  paidAmount: number;
  remainingAmount: number;
  status: SalaryStatus | "UNRECONCILED";
};

function moneyToCents(value: MoneyValue): number {
  const amount = typeof value === "object" ? value.toNumber() : Number(value);
  if (!Number.isFinite(amount)) {
    throw new Error("Invalid salary amount.");
  }
  const cents = Math.round((amount + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Salary amount is outside the supported range.");
  }
  return cents;
}

export function getSalaryPaymentSummary(
  salary: SalaryPaymentSummaryInput,
): SalaryPaymentSummary {
  const netCents = moneyToCents(salary.netAmount);
  const paidCents = salary.payments.reduce(
    (sum, payment) => sum + moneyToCents(payment.amount),
    0,
  );
  const remainingCents = Math.max(0, netCents - paidCents);
  const unreconciled =
    salary.payments.length === 0 && salary.status !== "PENDING";

  return {
    paidAmount: paidCents / 100,
    remainingAmount: remainingCents / 100,
    status: unreconciled
      ? "UNRECONCILED"
      : remainingCents === 0 && netCents > 0
        ? "PAID"
        : paidCents > 0
          ? "PARTIAL"
          : "PENDING",
  };
}
