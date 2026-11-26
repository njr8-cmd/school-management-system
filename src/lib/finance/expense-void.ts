import type { Prisma } from "@/generated/prisma/client";

export async function voidExpenseRecord(
  tx: Prisma.TransactionClient,
  input: {
    id: string;
    schoolId: string;
    userId: string;
    reason: string;
  },
) {
  return tx.expense.updateMany({
    where: {
      id: input.id,
      academicYear: { is: { schoolId: input.schoolId } },
      voidedAt: null,
    },
    data: {
      voidedAt: new Date(),
      voidReason: input.reason,
      voidedByUserId: input.userId,
    },
  });
}
