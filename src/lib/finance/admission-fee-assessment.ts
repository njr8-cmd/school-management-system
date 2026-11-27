export type AdmissionFeeStatus =
  | "NOT_PAID"
  | "PARTIAL_PAID"
  | "FULL_PAID"
  | "EXEMPTED";

export function isAdmissionFeeStatus(
  value: unknown,
): value is AdmissionFeeStatus {
  return (
    value === "NOT_PAID" ||
    value === "PARTIAL_PAID" ||
    value === "FULL_PAID" ||
    value === "EXEMPTED"
  );
}

export function admissionFeeReceivableCents(input: {
  applicableAmountCents: number;
  status: AdmissionFeeStatus;
  historicalPaymentAmountCents?: number;
}): number {
  if (input.status === "EXEMPTED") return 0;
  if (input.status === "FULL_PAID") return 0;
  if (input.status !== "PARTIAL_PAID") {
    return input.applicableAmountCents;
  }

  const historicalAmount =
    input.historicalPaymentAmountCents ?? 0;
  if (
    !Number.isSafeInteger(historicalAmount) ||
    historicalAmount < 0 ||
    historicalAmount > input.applicableAmountCents
  ) {
    throw new Error("Invalid partial historical payment amount.");
  }
  return Math.max(
    0,
    input.applicableAmountCents - historicalAmount,
  );
}
