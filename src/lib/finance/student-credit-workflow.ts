import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import {
  getConfiguredSchool,
  SCHOOL_SETUP_REQUIRED_MESSAGE,
} from "@/lib/school";
import {
  availableCreditCents,
  billStatusAfterSettlement,
  centsToMoney,
  isAuditableManualCredit,
  issueDateWithinAcademicYear,
  moneyToCents,
} from "@/lib/finance/student-credit-rules";

type CreditTransaction = Prisma.TransactionClient;

export class StudentCreditWorkflowError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type IssuanceInput = {
  studentId: string;
  academicYearId: string;
  amountCents: number;
  issueDate: Date;
  reason: string;
  notes: string;
  issuedByUserId: string;
  idempotencyKey: string;
};

type ApplicationInput = {
  creditId: string;
  billId: string;
  billItemId?: string;
  amountCents: number;
  appliedByUserId: string;
  idempotencyKey: string;
};

type ReversalInput = {
  applicationId: string;
  reversedByUserId: string;
  reason: string;
};

function requestHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function validateIdempotencyKey(key: string) {
  if (!key.trim() || key.length > 200) {
    throw new StudentCreditWorkflowError(
      "A valid idempotency key is required.",
      400,
    );
  }
}

function validateAmountCents(amountCents: number) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new StudentCreditWorkflowError(
      "Amount must be positive and have at most two decimal places.",
      400,
    );
  }
}

async function lockIdempotencyKey(
  tx: CreditTransaction,
  namespace: string,
  key: string,
) {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`${namespace}:${key}`}, 0)
    )
  `;
}

async function lockCreditAndBill(
  tx: CreditTransaction,
  creditId: string,
  billId: string,
) {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`billing:credit:${creditId}`}, 0)
    )
  `;
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`billing:bill:${billId}`}, 0)
    )
  `;
}

function activeApplicationTotalCents(
  amounts: { amount: Prisma.Decimal }[],
): number {
  return amounts.reduce(
    (sum, application) => sum + moneyToCents(application.amount),
    0,
  );
}

function ensureCreditIsAuditable(credit: {
  source: string;
  sourcePaymentId: string | null;
  issueDate: Date | null;
  reason: string | null;
  notes: string | null;
  issuedByUserId: string | null;
}) {
  if (!isAuditableManualCredit(credit)) {
    throw new StudentCreditWorkflowError(
      "This credit has incomplete or unsupported audit information and cannot be applied. Review it before use.",
      409,
    );
  }
}

export async function issueStudentCredit(
  tx: CreditTransaction,
  input: IssuanceInput,
) {
  validateAmountCents(input.amountCents);
  validateIdempotencyKey(input.idempotencyKey);
  const reason = input.reason.trim();
  const notes = input.notes.trim();
  if (!reason || reason.length > 300) {
    throw new StudentCreditWorkflowError(
      "A reason of 1 to 300 characters is required.",
      400,
    );
  }
  if (!notes || notes.length > 500) {
    throw new StudentCreditWorkflowError(
      "An approval reference or note of 1 to 500 characters is required.",
      400,
    );
  }
  if (
    Number.isNaN(input.issueDate.getTime()) ||
    !input.studentId.trim() ||
    !input.academicYearId.trim() ||
    !input.issuedByUserId.trim()
  ) {
    throw new StudentCreditWorkflowError(
      "Student, academic year, issue date, and issuing Accountant are required.",
      400,
    );
  }

  await lockIdempotencyKey(
    tx,
    "student-credit-issuance",
    input.idempotencyKey,
  );

  const hash = requestHash({
    studentId: input.studentId,
    academicYearId: input.academicYearId,
    amountCents: input.amountCents,
    issueDate: input.issueDate.toISOString(),
    reason,
    notes,
    issuedByUserId: input.issuedByUserId,
  });

  const existing = await tx.studentCredit.findUnique({
    where: { issuanceIdempotencyKey: input.idempotencyKey },
  });

  if (existing) {
    if (existing.issuanceRequestHash !== hash) {
      throw new StudentCreditWorkflowError(
        "This idempotency key was already used for a different credit request.",
        409,
      );
    }

    return {
      credit: existing,
      replayed: true,
    };
  }

  const school = await getConfiguredSchool(tx);
  if (!school) {
    throw new StudentCreditWorkflowError(
      SCHOOL_SETUP_REQUIRED_MESSAGE,
      404,
    );
  }

  const student = await tx.student.findFirst({
    where: {
      id: input.studentId,
      schoolId: school.id,
    },
    select: { id: true },
  });
  const academicYear = await tx.academicYear.findFirst({
    where: {
      id: input.academicYearId,
      schoolId: school.id,
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
    },
  });

  if (!student) {
    throw new StudentCreditWorkflowError("Student not found.", 404);
  }
  if (!academicYear) {
    throw new StudentCreditWorkflowError("Academic year not found.", 404);
  }
  if (
    input.issueDate < academicYear.startDate ||
    input.issueDate > academicYear.endDate
  ) {
    throw new StudentCreditWorkflowError(
      "Credit issue date must fall within the selected academic year.",
      400,
    );
  }

  const credit = await tx.studentCredit.create({
    data: {
      studentId: student.id,
      academicYearId: academicYear.id,
      amount: centsToMoney(input.amountCents),
      appliedAmount: 0,
      source: "MANUAL_ADJUSTMENT",
      notes,
      issueDate: input.issueDate,
      reason,
      issuedByUserId: input.issuedByUserId,
      issuanceIdempotencyKey: input.idempotencyKey,
      issuanceRequestHash: hash,
    },
  });

  return {
    credit,
    replayed: false,
  };
}

export async function applyStudentCredit(
  tx: CreditTransaction,
  input: ApplicationInput,
) {
  validateAmountCents(input.amountCents);
  validateIdempotencyKey(input.idempotencyKey);
  if (
    !input.creditId.trim() ||
    !input.billId.trim() ||
    !input.appliedByUserId.trim()
  ) {
    throw new StudentCreditWorkflowError(
      "Credit, bill, and applying Accountant are required.",
      400,
    );
  }

  await lockIdempotencyKey(
    tx,
    "bill-credit-application",
    input.idempotencyKey,
  );
  await lockCreditAndBill(tx, input.creditId, input.billId);

  const hash = requestHash({
    creditId: input.creditId,
    billId: input.billId,
    billItemId: input.billItemId ?? null,
    amountCents: input.amountCents,
    appliedByUserId: input.appliedByUserId,
  });

  const existingApplication =
    await tx.billCreditApplication.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });

  if (existingApplication) {
    if (existingApplication.idempotencyRequestHash !== hash) {
      throw new StudentCreditWorkflowError(
        "This idempotency key was already used for a different application.",
        409,
      );
    }

    return {
      application: existingApplication,
      replayed: true,
    };
  }

  const credit = await tx.studentCredit.findUnique({
    where: { id: input.creditId },
  });
  const bill = await tx.bill.findUnique({
    where: { id: input.billId },
  });

  if (!credit) {
    throw new StudentCreditWorkflowError("Credit not found.", 404);
  }
  if (!bill) {
    throw new StudentCreditWorkflowError("Bill not found.", 404);
  }

  const school = await getConfiguredSchool(tx);
  if (!school) {
    throw new StudentCreditWorkflowError(
      SCHOOL_SETUP_REQUIRED_MESSAGE,
      404,
    );
  }
  const student = await tx.student.findFirst({
    where: {
      id: credit.studentId,
      schoolId: school.id,
    },
    select: { id: true },
  });
  const academicYear = await tx.academicYear.findFirst({
    where: {
      id: credit.academicYearId,
      schoolId: school.id,
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
    },
  });
  if (!student || !academicYear) {
    throw new StudentCreditWorkflowError("Credit not found.", 404);
  }
  ensureCreditIsAuditable(credit);
  if (
    !issueDateWithinAcademicYear(
      credit.issueDate,
      academicYear.startDate,
      academicYear.endDate,
    )
  ) {
    throw new StudentCreditWorkflowError(
      "Credit issue date does not match its academic year.",
      409,
    );
  }

  if (
    credit.studentId !== bill.studentId ||
    credit.academicYearId !== bill.academicYearId
  ) {
    throw new StudentCreditWorkflowError(
      "Credit can only be applied to the same student's bill in the same academic year.",
      400,
    );
  }
  if (bill.status === "CANCELLED") {
    throw new StudentCreditWorkflowError(
      "Credit cannot be applied to a cancelled bill.",
      400,
    );
  }

  const creditApplications =
    await tx.billCreditApplication.findMany({
      where: {
        creditId: credit.id,
        reversedAt: null,
      },
      select: { amount: true },
    });
  const billPayments = await tx.payment.findMany({
    where: { billId: bill.id },
    select: {
      amount: true,
      waiverAmount: true,
    },
  });
  const billApplications =
    await tx.billCreditApplication.findMany({
      where: {
        billId: bill.id,
        reversedAt: null,
      },
      select: { amount: true },
    });

  const appliedBeforeCents =
    activeApplicationTotalCents(creditApplications);
  if (moneyToCents(credit.appliedAmount) !== appliedBeforeCents) {
    throw new StudentCreditWorkflowError(
      "Credit application totals do not match the credit balance. Reconcile this credit before applying it.",
      409,
    );
  }

  const availableBeforeCents = availableCreditCents(
    credit.amount,
    creditApplications,
  );
  const paidAmountCents = billPayments.reduce(
    (sum, payment) =>
      sum + moneyToCents(payment.amount),
    0,
  );
  const waiverAmountCents = billPayments.reduce(
    (sum, payment) => sum + moneyToCents(payment.waiverAmount),
    0,
  );
  const billPaymentCents = paidAmountCents + waiverAmountCents;
  const billCreditCents =
    activeApplicationTotalCents(billApplications);
  const outstandingBeforeCents =
    moneyToCents(bill.totalAmount) -
    billPaymentCents -
    billCreditCents;

  if (availableBeforeCents <= 0) {
    throw new StudentCreditWorkflowError(
      "This credit has no available balance.",
      400,
    );
  }
  if (outstandingBeforeCents <= 0) {
    throw new StudentCreditWorkflowError(
      "This bill has no outstanding balance.",
      400,
    );
  }
  if (input.billItemId) {
    const billItem = await tx.billItem.findFirst({
      where: { id: input.billItemId, billId: bill.id },
      select: { id: true, netAmount: true, feeType: true },
    });
    if (!billItem) {
      throw new StudentCreditWorkflowError(
        "The selected bill item does not belong to this bill.",
        400,
      );
    }
    if (billItem.feeType !== "ADMISSION") {
      throw new StudentCreditWorkflowError(
        "Historical admission credits can only be applied to an admission-fee bill item.",
        400,
      );
    }
    const itemApplications =
      await tx.billCreditApplication.findMany({
        where: {
          billItemId: billItem.id,
          reversedAt: null,
        },
        select: { amount: true },
      });
    const itemOutstandingCents =
      moneyToCents(billItem.netAmount) -
      activeApplicationTotalCents(itemApplications);
    if (input.amountCents > itemOutstandingCents) {
      throw new StudentCreditWorkflowError(
        `Application exceeds the admission-fee item balance of Rs. ${centsToMoney(Math.max(0, itemOutstandingCents)).toFixed(2)}.`,
        400,
      );
    }
  }
  if (input.amountCents > availableBeforeCents) {
    throw new StudentCreditWorkflowError(
      `Application exceeds available credit of Rs. ${centsToMoney(availableBeforeCents).toFixed(2)}.`,
      400,
    );
  }
  if (input.amountCents > outstandingBeforeCents) {
    throw new StudentCreditWorkflowError(
      `Application exceeds the bill balance of Rs. ${centsToMoney(outstandingBeforeCents).toFixed(2)}.`,
      400,
    );
  }

  const application = await tx.billCreditApplication.create({
    data: {
      billId: bill.id,
      creditId: credit.id,
      billItemId: input.billItemId ?? null,
      amount: centsToMoney(input.amountCents),
      appliedByUserId: input.appliedByUserId,
      idempotencyKey: input.idempotencyKey,
      idempotencyRequestHash: hash,
    },
  });

  const appliedAfterCents =
    appliedBeforeCents + input.amountCents;
  const outstandingAfterCents =
    outstandingBeforeCents - input.amountCents;

  await tx.studentCredit.update({
    where: { id: credit.id },
    data: { appliedAmount: centsToMoney(appliedAfterCents) },
  });
  await tx.bill.update({
    where: { id: bill.id },
    data: {
      status: billStatusAfterSettlement({
        totalAmountCents: moneyToCents(bill.totalAmount),
        paidAmountCents,
        waiverAmountCents,
        appliedCreditCents: billCreditCents + input.amountCents,
      }),
    },
  });

  return {
    application,
    replayed: false,
    availableCreditAmount: centsToMoney(
      availableBeforeCents - input.amountCents,
    ),
    outstandingAmount: centsToMoney(outstandingAfterCents),
  };
}

export async function reverseStudentCreditApplication(
  tx: CreditTransaction,
  input: ReversalInput,
) {
  const reason = input.reason.trim();
  if (
    !input.applicationId.trim() ||
    !input.reversedByUserId.trim() ||
    !reason ||
    reason.length > 300
  ) {
    throw new StudentCreditWorkflowError(
      "Application, reversing Accountant, and a reason of 1 to 300 characters are required.",
      400,
    );
  }

  const initialApplication =
    await tx.billCreditApplication.findUnique({
      where: { id: input.applicationId },
      select: {
        id: true,
        creditId: true,
        billId: true,
      },
    });

  if (!initialApplication) {
    throw new StudentCreditWorkflowError(
      "Credit application not found.",
      404,
    );
  }

  await lockCreditAndBill(
    tx,
    initialApplication.creditId,
    initialApplication.billId,
  );

  const application =
    await tx.billCreditApplication.findUnique({
      where: { id: initialApplication.id },
    });
  if (!application) {
    throw new StudentCreditWorkflowError(
      "Credit application not found.",
      404,
    );
  }
  if (application.reversedAt) {
    throw new StudentCreditWorkflowError(
      "This credit application has already been reversed.",
      409,
    );
  }

  const credit = await tx.studentCredit.findUnique({
    where: { id: application.creditId },
  });
  const bill = await tx.bill.findUnique({
    where: { id: application.billId },
  });
  const creditApplications =
    await tx.billCreditApplication.findMany({
      where: {
        creditId: application.creditId,
        reversedAt: null,
      },
      select: { amount: true },
    });

  if (!credit || !bill) {
    throw new StudentCreditWorkflowError(
      "Credit application is missing its credit or bill.",
      409,
    );
  }
  const school = await getConfiguredSchool(tx);
  if (!school) {
    throw new StudentCreditWorkflowError(
      SCHOOL_SETUP_REQUIRED_MESSAGE,
      404,
    );
  }
  const student = await tx.student.findFirst({
    where: {
      id: credit.studentId,
      schoolId: school.id,
    },
    select: { id: true },
  });
  const academicYear = await tx.academicYear.findFirst({
    where: {
      id: credit.academicYearId,
      schoolId: school.id,
    },
    select: { id: true },
  });
  if (
    !student ||
    !academicYear ||
    bill.studentId !== student.id ||
    bill.academicYearId !== credit.academicYearId
  ) {
    throw new StudentCreditWorkflowError(
      "Credit application not found.",
      404,
    );
  }

  const appliedBeforeCents =
    activeApplicationTotalCents(creditApplications);
  if (moneyToCents(credit.appliedAmount) !== appliedBeforeCents) {
    throw new StudentCreditWorkflowError(
      "Credit application totals do not match the credit balance. Reconcile this credit before reversing it.",
      409,
    );
  }

  const updatedApplication =
    await tx.billCreditApplication.update({
      where: { id: application.id },
      data: {
        reversedAt: new Date(),
        reversedByUserId: input.reversedByUserId,
        reversalReason: reason,
      },
    });

  const activeApplicationsAfter =
    await tx.billCreditApplication.findMany({
      where: {
        creditId: credit.id,
        reversedAt: null,
      },
      select: { amount: true },
    });
  const appliedAfterCents =
    activeApplicationTotalCents(activeApplicationsAfter);

  await tx.studentCredit.update({
    where: { id: credit.id },
    data: { appliedAmount: centsToMoney(appliedAfterCents) },
  });

  if (bill.status !== "CANCELLED") {
    const payments = await tx.payment.findMany({
      where: { billId: bill.id },
      select: {
        amount: true,
        waiverAmount: true,
      },
    });
    const billApplications =
      await tx.billCreditApplication.findMany({
        where: {
          billId: bill.id,
          reversedAt: null,
        },
        select: { amount: true },
      });
    const paidAmountCents = payments.reduce(
      (sum, payment) => sum + moneyToCents(payment.amount),
      0,
    );
    const waiverAmountCents = payments.reduce(
      (sum, payment) => sum + moneyToCents(payment.waiverAmount),
      0,
    );
    const appliedCreditCents =
      activeApplicationTotalCents(billApplications);

    await tx.bill.update({
      where: { id: bill.id },
      data: {
        status: billStatusAfterSettlement({
          totalAmountCents: moneyToCents(bill.totalAmount),
          paidAmountCents,
          waiverAmountCents,
          appliedCreditCents,
        }),
      },
    });
  }

  return {
    application: updatedApplication,
    availableCreditAmount: centsToMoney(
      moneyToCents(credit.amount) - appliedAfterCents,
    ),
  };
}
