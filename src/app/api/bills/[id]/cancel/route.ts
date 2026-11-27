import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireConfiguredSchool,
  schoolConfigurationErrorResponse,
} from "@/lib/school-api";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  _request: Request,
  context: RouteContext,
) {
  try {
    const school = await requireConfiguredSchool();
    const { id } = await context.params;
    const bill = await prisma.bill.findFirst({
      where: {
        id,
        student: { is: { schoolId: school.id } },
        academicYear: { is: { schoolId: school.id } },
      },
      select: {
        id: true,
        studentId: true,
        academicYearId: true,
      },
    });

    if (!bill) {
      return NextResponse.json(
        { error: "Bill not found." },
        { status: 404 },
      );
    }

    const cancelledBill = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(
              ${`${bill.studentId}:${bill.academicYearId}`},
              0
            )
          )
        `;
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`billing:bill:${id}`}, 0)
          )
        `;

        const currentBill = await tx.bill.findUnique({
          where: { id },
          include: {
            payments: { select: { id: true } },
            creditApplications: {
              select: {
                id: true,
                amount: true,
                reversedAt: true,
                creditId: true,
              },
            },
          },
        });

        if (!currentBill) {
          throw new Error("BILL_NOT_FOUND");
        }

        if (currentBill.status === "CANCELLED") {
          return currentBill;
        }

        if (currentBill.payments.length > 0) {
          throw new Error("BILL_HAS_SETTLEMENTS");
        }

        const activeCreditApplications =
          currentBill.creditApplications.filter(
            (application) => application.reversedAt === null,
          );
        if (activeCreditApplications.length > 0) {
          const assessment =
            await tx.admissionFeeAssessment.findFirst({
              where: { billId: id, historicalCreditId: { not: null } },
              select: { historicalCreditId: true },
            });
          const historicalCreditIds =
            assessment?.historicalCreditId
              ? new Set([assessment.historicalCreditId])
              : new Set<string>();
          const hasNonHistoricalApplication =
            activeCreditApplications.some(
              (application) =>
                !historicalCreditIds.has(application.creditId),
            );
          if (hasNonHistoricalApplication) {
            throw new Error("BILL_HAS_SETTLEMENTS");
          }

          for (const application of activeCreditApplications) {
            await tx.billCreditApplication.update({
              where: { id: application.id },
              data: {
                reversedAt: new Date(),
                reversalReason:
                  "Admission-fee bill cancelled; historical credit released for replacement bill.",
              },
            });
            await tx.studentCredit.update({
              where: { id: application.creditId },
              data: {
                appliedAmount: {
                  decrement: application.amount,
                },
              },
            });
          }
        }

        const updatedBill = await tx.bill.update({
          where: { id },
          data: { status: "CANCELLED" },
        });

        await tx.studentChargeApplication.updateMany({
          where: {
            billId: id,
            isActive: true,
          },
          data: {
            isActive: false,
            releasedAt: new Date(),
            releaseReason: "CANCELLED_UNPAID",
          },
        });

        return updatedBill;
      },
      { maxWait: 10000, timeout: 20000 },
    );

    return NextResponse.json({
      message: "Bill cancelled successfully.",
      bill: cancelledBill,
    });
  } catch (error) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    if (error instanceof Error) {
      if (error.message === "BILL_NOT_FOUND") {
        return NextResponse.json(
          { error: "Bill not found." },
          { status: 404 },
        );
      }

      if (error.message === "BILL_HAS_SETTLEMENTS") {
        return NextResponse.json(
          {
            error:
              "This bill cannot be cancelled while payments or credits are applied. Reverse or refund them first.",
          },
          { status: 409 },
        );
      }
    }

    console.error("Failed to cancel bill:", error);
    return NextResponse.json(
      { error: "Failed to cancel bill." },
      { status: 500 },
    );
  }
}
