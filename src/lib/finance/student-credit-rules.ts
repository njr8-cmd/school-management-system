export type MoneyValue = string | number | { toNumber(): number };

export type CreditApplicationAmount = {
  amount: MoneyValue;
  reversedAt?: Date | string | null;
};

export type BillSettlementPayment = {
  amount: MoneyValue;
  waiverAmount: MoneyValue;
};

export function parsePositiveAmountToCents(
  value: unknown,
): number | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  if (typeof value === "string" && !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) {
    return null;
  }

  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const cents = Math.round((amount + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(amount * 100 - cents) > 1e-7) {
    return null;
  }

  return cents;
}

export function moneyToCents(value: MoneyValue): number {
  const amount =
    typeof value === "object" ? value.toNumber() : Number(value);
  if (!Number.isFinite(amount)) {
    throw new Error("Invalid monetary value.");
  }

  const cents = Math.round((amount + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Monetary value is outside the supported range.");
  }

  return cents;
}

export function centsToMoney(cents: number): number {
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Invalid currency amount.");
  }

  return cents / 100;
}

export function availableCreditCents(
  amount: MoneyValue,
  applications: CreditApplicationAmount[],
): number {
  const applied = applications.reduce(
    (sum, application) =>
      application.reversedAt
        ? sum
        : sum + moneyToCents(application.amount),
    0,
  );

  return moneyToCents(amount) - applied;
}

export function billOutstandingCents(input: {
  totalAmount: MoneyValue;
  payments: BillSettlementPayment[];
  applications: CreditApplicationAmount[];
}): number {
  const paidAndWaived = input.payments.reduce(
    (sum, payment) =>
      sum +
      moneyToCents(payment.amount) +
      moneyToCents(payment.waiverAmount),
    0,
  );
  const appliedCredits = input.applications.reduce(
    (sum, application) =>
      application.reversedAt
        ? sum
        : sum + moneyToCents(application.amount),
    0,
  );

  return moneyToCents(input.totalAmount) - paidAndWaived - appliedCredits;
}

type StatementBillBalance = {
  totalAmount: MoneyValue;
  status: string;
  payments: BillSettlementPayment[];
  applications: CreditApplicationAmount[];
};

type StatementPeriodBillBalance = StatementBillBalance & {
  periodStartYear: number;
  periodStartMonth: number;
  periodEndYear: number;
  periodEndMonth: number;
};

export function statementBillOutstandingCents(
  bill: StatementBillBalance,
): number {
  if (bill.status === "CANCELLED") {
    return 0;
  }

  return Math.max(0, billOutstandingCents(bill));
}

export function calculateStatementOutstandingCents(input: {
  previousAcademicYearBills: StatementBillBalance[];
  selectedAcademicYearBills: StatementPeriodBillBalance[];
}): {
  broughtForwardCents: number;
  currentPeriodCents: number;
  selectedAcademicYearCents: number;
  totalDueCents: number;
} {
  const previousAcademicYearCents =
    input.previousAcademicYearBills.reduce(
      (sum, bill) => sum + statementBillOutstandingCents(bill),
      0,
    );
  const currentPeriod = input.selectedAcademicYearBills.reduce<{
    startIndex: number;
    endIndex: number;
  } | null>((latest, bill) => {
    const period = {
      startIndex: bill.periodStartYear * 12 + bill.periodStartMonth,
      endIndex: bill.periodEndYear * 12 + bill.periodEndMonth,
    };
    if (
      latest === null ||
      period.endIndex > latest.endIndex ||
      (period.endIndex === latest.endIndex &&
        period.startIndex > latest.startIndex)
    ) {
      return period;
    }
    return latest;
  }, null);

  let broughtForwardCents = previousAcademicYearCents;
  let currentPeriodCents = 0;
  let selectedAcademicYearCents = 0;

  for (const bill of input.selectedAcademicYearBills) {
    const outstandingCents = statementBillOutstandingCents(bill);
    selectedAcademicYearCents += outstandingCents;

    const billPeriodStartIndex =
      bill.periodStartYear * 12 + bill.periodStartMonth;
    const billPeriodEndIndex =
      bill.periodEndYear * 12 + bill.periodEndMonth;
    if (
      currentPeriod !== null &&
      (billPeriodEndIndex < currentPeriod.endIndex ||
        (billPeriodEndIndex === currentPeriod.endIndex &&
          billPeriodStartIndex < currentPeriod.startIndex))
    ) {
      broughtForwardCents += outstandingCents;
    } else {
      currentPeriodCents += outstandingCents;
    }
  }

  return {
    broughtForwardCents,
    currentPeriodCents,
    selectedAcademicYearCents,
    totalDueCents:
      previousAcademicYearCents + selectedAcademicYearCents,
  };
}

export function billStatusAfterSettlement(input: {
  totalAmountCents: number;
  paidAmountCents: number;
  waiverAmountCents: number;
  appliedCreditCents: number;
}): "UNPAID" | "PARTIAL" | "PAID" {
  const settled =
    input.paidAmountCents +
    input.waiverAmountCents +
    input.appliedCreditCents;

  if (settled >= input.totalAmountCents) {
    return "PAID";
  }

  return settled > 0 ? "PARTIAL" : "UNPAID";
}

export function isAuditableManualCredit(input: {
  source: string;
  sourcePaymentId: string | null;
  issueDate: Date | null;
  reason: string | null;
  notes: string | null;
  issuedByUserId: string | null;
}): boolean {
  return (
    input.source === "MANUAL_ADJUSTMENT" &&
    input.sourcePaymentId === null &&
    input.issueDate !== null &&
    Boolean(input.reason?.trim()) &&
    Boolean(input.notes?.trim()) &&
    input.issuedByUserId !== null
  );
}

export function issueDateWithinAcademicYear(
  issueDate: Date | null,
  startDate: Date,
  endDate: Date,
): boolean {
  return (
    issueDate !== null &&
    issueDate.getTime() >= startDate.getTime() &&
    issueDate.getTime() <= endDate.getTime()
  );
}
