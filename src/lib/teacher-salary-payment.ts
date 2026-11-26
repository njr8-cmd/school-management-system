import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";

export class SalaryPaymentRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type RecordSalaryPaymentInput = {
  teacherSalaryId: string;
  amount: number;
  paymentDate: Date;
  method: "CASH" | "BANK" | "ONLINE" | "OTHER";
  reference: string | null;
  notes: string | null;
  recordedByUserId: string;
  idempotencyKey: string;
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function recordTeacherSalaryPayment(
  tx: Prisma.TransactionClient,
  input: RecordSalaryPaymentInput,
) {
  const amount = roundMoney(input.amount);
  const idempotencyKey = input.idempotencyKey.trim();
  const reference = input.reference?.trim() || null;
  const notes = input.notes?.trim() || null;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new SalaryPaymentRequestError(
      "Payment amount must be greater than zero.",
      400,
    );
  }
  if (
    !idempotencyKey ||
    idempotencyKey.length > 200 ||
    !input.recordedByUserId.trim() ||
    Number.isNaN(input.paymentDate.getTime())
  ) {
    throw new SalaryPaymentRequestError(
      "A valid payment date, user, and idempotency key are required.",
      400,
    );
  }

  const idempotencyRequestHash = createHash("sha256")
    .update(
      JSON.stringify({
        teacherSalaryId: input.teacherSalaryId,
        amount,
        paymentDate: input.paymentDate.toISOString(),
        method: input.method,
        reference,
        notes,
        recordedByUserId: input.recordedByUserId,
      }),
    )
    .digest("hex");

  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`teacher-salary-payment:${idempotencyKey}`}, 0)
    )
  `;

  const previousPayment = await tx.teacherSalaryPayment.findUnique({
    where: { idempotencyKey },
  });
  if (previousPayment) {
    if (previousPayment.idempotencyRequestHash !== idempotencyRequestHash) {
      throw new SalaryPaymentRequestError(
        "This idempotency key was already used for a different salary payment.",
        409,
      );
    }

    const previousSalary = await tx.teacherSalary.findUnique({
      where: { id: previousPayment.teacherSalaryId },
      include: {
        teacher: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            basicSalary: true,
            position: true,
          },
        },
        academicYear: {
          select: {
            id: true,
            name: true,
            isActive: true,
          },
        },
        payments: {
          include: {
            recordedBy: { select: { id: true, name: true } },
          },
          orderBy: { paymentDate: "desc" },
        },
      },
    });

    if (!previousSalary) {
      throw new SalaryPaymentRequestError(
        "Teacher salary record not found.",
        404,
      );
    }

    return previousSalary;
  }

  await tx.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "TeacherSalary"
    WHERE "id" = ${input.teacherSalaryId}
    FOR UPDATE
  `;

  const existing = await tx.teacherSalary.findUnique({
    where: { id: input.teacherSalaryId },
    include: { payments: true },
  });

  if (!existing) {
    throw new SalaryPaymentRequestError(
      "Teacher salary record not found.",
      404,
    );
  }

  if (
    existing.payments.length === 0 &&
    (existing.status === "PAID" || existing.status === "PARTIAL")
  ) {
    throw new SalaryPaymentRequestError(
      "This is a legacy salary record without payment history. Reconcile its previous payments before adding another payment.",
      409,
    );
  }

  const paidBefore = roundMoney(
    existing.payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    ),
  );
  const netAmount = Number(existing.netAmount);
  const remaining = roundMoney(Math.max(0, netAmount - paidBefore));

  if (amount > remaining + 0.009) {
    throw new SalaryPaymentRequestError(
      `Payment exceeds the remaining salary balance of Rs. ${remaining.toLocaleString("en-NP", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}.`,
      400,
    );
  }

  await tx.teacherSalaryPayment.create({
    data: {
      teacherSalaryId: input.teacherSalaryId,
      amount,
      paymentDate: input.paymentDate,
      method: input.method,
      reference,
      notes,
      recordedByUserId: input.recordedByUserId,
      idempotencyKey,
      idempotencyRequestHash,
    },
  });

  const totalPaid = roundMoney(paidBefore + amount);
  const status =
    totalPaid >= netAmount - 0.009
      ? "PAID"
      : totalPaid > 0
        ? "PARTIAL"
        : "PENDING";

  await tx.teacherSalary.update({
    where: { id: input.teacherSalaryId },
    data: {
      status,
      paymentDate: input.paymentDate,
      paymentMethod: input.method,
      reference,
    },
  });

  return tx.teacherSalary.findUnique({
    where: { id: input.teacherSalaryId },
    include: {
      teacher: {
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          basicSalary: true,
          position: true,
        },
      },
      academicYear: {
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      },
      payments: {
        include: {
          recordedBy: { select: { id: true, name: true } },
        },
        orderBy: { paymentDate: "desc" },
      },
    },
  });
}
