
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireConfiguredSchool,
  schoolConfigurationErrorResponse,
} from "@/lib/school-api";
import { FeeFrequency, FeeType } from "@/generated/prisma/client";
import {
  bsToDate,
  dateToBS,
  getBSMonthsInPeriod,
  bsMonthIndex,
} from "@/lib/nepali-date";
import { auth } from "@/auth";
import { authorizeSession } from "@/lib/auth/authorization";
import { createHash } from "node:crypto";
import { isAdmissionFeeStatus } from "@/lib/finance/admission-fee-assessment";

class BillGenerationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type TermMonthRange = {
  key: number;
  startIndex: number;
  endIndex: number;
};

function getAcademicTermMonthRanges(
  academicYearStart: Date,
  academicYearEnd: Date,
  termCount: number,
): TermMonthRange[] {
  const start = dateToBS(academicYearStart);
  const end = dateToBS(academicYearEnd);
  const firstMonth = bsMonthIndex(start.year, start.month);
  const lastMonth = bsMonthIndex(end.year, end.month);
  const monthCount = lastMonth - firstMonth + 1;
  const rangeCount = Math.max(termCount, 1);
  const monthsPerTerm = Math.floor(monthCount / rangeCount);
  const extraMonths = monthCount % rangeCount;
  let offset = 0;
  const ranges: TermMonthRange[] = [];

  for (let key = 0; key < rangeCount; key += 1) {
    const length = monthsPerTerm + (key < extraMonths ? 1 : 0);
    if (length > 0) {
      ranges.push({
        key,
        startIndex: firstMonth + offset,
        endIndex: firstMonth + offset + length - 1,
      });
    }
    offset += length;
  }

  return ranges;
}

function parseDate(value: unknown, fieldName: string) {
  if (!value) {
    throw new Error(`${fieldName} is required.`);
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${fieldName}.`);
  }

  return date;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getBSPeriodDates(
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number
) {
  const periodStart = bsToDate(startYear, startMonth, 1);
  let nextMonthYear = endYear;
  let nextMonth = endMonth + 1;

  if (nextMonth === 13) {
    nextMonth = 1;
    nextMonthYear += 1;
  }

  const nextMonthStart = bsToDate(
    nextMonthYear,
    nextMonth,
    1
  );

  const periodEnd = new Date(nextMonthStart.getTime() - 1);

  return {
    periodStart,
    periodEnd,
  };
}

function datesOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date
) {
  return startA <= endB && endA >= startB;
}

function bsPeriodsOverlap(
  startYearA: number,
  startMonthA: number,
  endYearA: number,
  endMonthA: number,
  startYearB: number,
  startMonthB: number,
  endYearB: number,
  endMonthB: number
) {
  const startA = bsMonthIndex(startYearA, startMonthA);
  const endA = bsMonthIndex(endYearA, endMonthA);
  const startB = bsMonthIndex(startYearB, startMonthB);
  const endB = bsMonthIndex(endYearB, endMonthB);

  return startA <= endB && endA >= startB;
}

/**
 * Counts the inclusive BS months during which a charge
 * or discount is active within the billing period.
 *
 * Start and end months are inclusive.
 * A null end date means there is no fixed expiry.
 */
function getActiveBSMonthsInPeriod(
  effectiveStart: Date,
  effectiveEnd: Date | null,
  periodStartYear: number,
  periodStartMonth: number,
  periodEndYear: number,
  periodEndMonth: number
): number {
  const effectiveStartBS = dateToBS(effectiveStart);

  const effectiveEndBS = effectiveEnd
    ? dateToBS(effectiveEnd)
    : {
        year: periodEndYear,
        month: periodEndMonth,
      };

  const activeStart = Math.max(
    bsMonthIndex(
      effectiveStartBS.year,
      effectiveStartBS.month
    ),
    bsMonthIndex(periodStartYear, periodStartMonth)
  );

  const activeEnd = Math.min(
    bsMonthIndex(
      effectiveEndBS.year,
      effectiveEndBS.month
    ),
    bsMonthIndex(periodEndYear, periodEndMonth)
  );

  if (activeEnd < activeStart) {
    return 0;
  }

  return activeEnd - activeStart + 1;
}

// GET BILLS
export async function GET(request: Request) {
  try {
    const school = await requireConfiguredSchool();
    const { searchParams } = new URL(request.url);

    const academicYearId = searchParams.get("academicYearId");
    const studentId = searchParams.get("studentId");
    const status = searchParams.get("status");
    const id = searchParams.get("id");

    const where: {
      id?: string;
      academicYearId?: string;
      studentId?: string;
      status?: "UNPAID" | "PARTIAL" | "PAID" | "CANCELLED";
      student?: { is: { schoolId: string } };
      academicYear?: { is: { schoolId: string } };
    } = {
      student: { is: { schoolId: school.id } },
      academicYear: { is: { schoolId: school.id } },
    };

    if (id) {
      where.id = id;
    }

    if (academicYearId) {
      where.academicYearId = academicYearId;
    }

    if (studentId) {
      where.studentId = studentId;
    }

    if (
      status === "UNPAID" ||
      status === "PARTIAL" ||
      status === "PAID" ||
      status === "CANCELLED"
    ) {
      where.status = status;
    }

    const bills = await prisma.bill.findMany({
      where,
      include: {
        student: true,
        academicYear: true,
        items: true,
        payments: true,
        creditApplications: {
          include: {
            credit: true,
          },
        },
      },
      orderBy: {
        billingDate: "desc",
      },
    });

    return NextResponse.json(bills);
  } catch (error) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    console.error("Failed to load bills:", error);

    return NextResponse.json(
      {
        error: "Failed to load bills.",
      },
      { status: 500 }
    );
  }
}

// CREATE BILL
export async function POST(request: Request) {
  try {
    const school = await requireConfiguredSchool();
    const body = await request.json();

    const {
      studentId,
      academicYearId,
      periodStartYear,
      periodStartMonth,
      periodEndYear,
      periodEndMonth,
      dueDate: dueDateValue,
      notes,
      admissionFeeReconciliation,
    } = body;

    const session = await auth();
    const authorization = authorizeSession(session, ["ADMIN", "ACCOUNTANT"]);
    let reconciliationActorId =
      authorization.ok
        ? authorization.userId
        : process.env.NODE_ENV === "test"
          ? null
          : "";

    if (!studentId) {
      return NextResponse.json(
        { error: "Student ID is required." },
        { status: 400 }
      );
    }

    if (!academicYearId) {
      return NextResponse.json(
        { error: "Academic year ID is required." },
        { status: 400 }
      );
    }

    const startYear = Number(periodStartYear);
    const startMonth = Number(periodStartMonth);
    const endYear = Number(periodEndYear);
    const endMonth = Number(periodEndMonth);

    // Validate BS years.
    if (!Number.isInteger(startYear) || startYear <= 0) {
      return NextResponse.json(
        { error: "Invalid billing start year." },
        { status: 400 }
      );
    }

    if (!Number.isInteger(endYear) || endYear <= 0) {
      return NextResponse.json(
        { error: "Invalid billing end year." },
        { status: 400 }
      );
    }

    // Validate BS months.
    if (
      !Number.isInteger(startMonth) ||
      startMonth < 1 ||
      startMonth > 12
    ) {
      return NextResponse.json(
        { error: "Invalid billing start month." },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(endMonth) ||
      endMonth < 1 ||
      endMonth > 12
    ) {
      return NextResponse.json(
        { error: "Invalid billing end month." },
        { status: 400 }
      );
    }

    // Validate the requested billing period.
    const requestedStartIndex = bsMonthIndex(
      startYear,
      startMonth
    );

    const requestedEndIndex = bsMonthIndex(
      endYear,
      endMonth
    );

    if (requestedStartIndex > requestedEndIndex) {
      return NextResponse.json(
        {
          error:
            "Billing end month cannot be before billing start month.",
        },
        { status: 400 }
      );
    }

    let periodStart: Date;
    let periodEnd: Date;

    try {
      const periodDates = getBSPeriodDates(
        startYear,
        startMonth,
        endYear,
        endMonth
      );

      periodStart = periodDates.periodStart;
      periodEnd = periodDates.periodEnd;
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Invalid billing period.",
        },
        { status: 400 }
      );
    }

    const monthsInPeriod = getBSMonthsInPeriod(
      startYear,
      startMonth,
      endYear,
      endMonth
    );

    // Parse the optional due date.
    let dueDate: Date | null = null;

    try {
      if (dueDateValue) {
        dueDate = parseDate(dueDateValue, "due date");
      }
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Invalid due date.",
        },
        { status: 400 }
      );
    }

    if (dueDate && dueDate < periodStart) {
      return NextResponse.json(
        {
          error:
            "Due date cannot be before the billing period starts.",
        },
        { status: 400 }
      );
    }

    // Find student.
    const student = await prisma.student.findFirst({
      where: {
        id: studentId,
        schoolId: school.id,
      },
    });

    if (!student) {
      return NextResponse.json(
        { error: "Student not found." },
        { status: 404 }
      );
    }

    // Find academic year.
    const academicYear = await prisma.academicYear.findFirst({
      where: {
        id: academicYearId,
        schoolId: school.id,
      },
      include: {
        terms: {
          orderBy: { order: "asc" },
          select: { id: true },
        },
      },
    });

    if (!academicYear) {
      return NextResponse.json(
        { error: "Academic year not found." },
        { status: 404 }
      );
    }

    // Verify enrollment.
    const enrollment = await prisma.enrollment.findUnique({
      where: {
        studentId_academicYearId: {
          studentId,
          academicYearId,
        },
      },
      include: {
        class: true,
      },
    });

    if (!enrollment) {
      return NextResponse.json(
        {
          error:
            "Student is not enrolled in the selected academic year.",
        },
        { status: 400 }
      );
    }
    if (enrollment.class.schoolId !== school.id) {
      return NextResponse.json(
        { error: "Student enrollment must belong to the configured school." },
        { status: 400 },
      );
    }

    // Prevent overlapping billing periods for this student
    // and academic year. Cancelled bills do not block rebilling.
    const existingBills = await prisma.bill.findMany({
      where: {
        studentId,
        academicYearId,
        status: {
          not: "CANCELLED",
        },
      },
      select: {
        id: true,
        billNumber: true,
        periodStartYear: true,
        periodStartMonth: true,
        periodEndYear: true,
        periodEndMonth: true,
        status: true,
      },
    });

    const overlappingBill = existingBills.find((bill) =>
      bsPeriodsOverlap(
        startYear,
        startMonth,
        endYear,
        endMonth,
        bill.periodStartYear,
        bill.periodStartMonth,
        bill.periodEndYear,
        bill.periodEndMonth
      )
    );

    if (overlappingBill) {
      return NextResponse.json(
        {
          error:
            "This billing period overlaps with an existing bill for this student.",
          existingBill: overlappingBill,
        },
        { status: 409 }
      );
    }

    // Get active class fee structures.
    const feeStructures = await prisma.feeStructure.findMany({
      where: {
        academicYearId,
        classId: enrollment.classId,
        isActive: true,
      },
      orderBy: {
        feeType: "asc",
      },
    });

    // Get discounts that overlap this billing period.
    const discounts = await prisma.studentDiscount.findMany({
      where: {
        studentId,
        academicYearId,
        isActive: true,
        startDate: {
          lte: periodEnd,
        },
        OR: [
          {
            endDate: null,
          },
          {
            endDate: {
              gte: periodStart,
            },
          },
        ],
      },
      include: {
        feeTypes: true,
      },
    });

    const items: {
      feeType: FeeType;
      frequency: FeeFrequency;
      description: string;
      quantity: number;
      rate: number;
      amount: number;
      discountPercent: number;
      discountAmount: number;
      netAmount: number;
      studentChargeId?: string;
      termKeys?: number[];
    }[] = [];
    const academicTermRanges = getAcademicTermMonthRanges(
      academicYear.startDate,
      academicYear.endDate,
      academicYear.terms.length,
    );

    // ---------------------------------------------------------
    // CLASS FEE STRUCTURES
    // ---------------------------------------------------------
    for (const fee of feeStructures) {
      const rate = Number(fee.amount);
      let quantity = 0;
      const coveredTermKeys =
        fee.frequency === "TERM"
          ? academicTermRanges
              .filter(
                (term) =>
                  term.startIndex <= requestedEndIndex &&
                  term.endIndex >= requestedStartIndex,
              )
              .map((term) => term.key)
          : undefined;

      switch (fee.frequency) {
        case "MONTHLY":
          quantity = monthsInPeriod;
          break;

        case "TERM":
          quantity = coveredTermKeys?.length ?? 0;
          break;

        case "ANNUAL":
        case "ONE_TIME":
          quantity = 1;
          break;

        default:
          quantity = 0;
      }

      if (quantity <= 0) {
        continue;
      }

      // Full fee amount for the entire billing period.
      const amount = roundMoney(quantity * rate);

      // Find the discount configured for this fee type.
      const applicableDiscount = discounts.find((discount) =>
        discount.feeTypes.some(
          (feeType) => feeType.feeType === fee.feeType
        )
      );

      const discountPercent = applicableDiscount
        ? Number(applicableDiscount.percentage)
        : 0;

      /*
       * FIX:
       * For monthly fees, only apply the discount to months
       * where the discount overlaps the billing period.
       *
       * Example:
       * Billing period: Bhadra through Mangsir = 4 months.
       * Discount ends in Kartik.
       * Eligible months: Bhadra, Asoj, Kartik = 3 months.
       */
      let discountableAmount = amount;

      if (
        applicableDiscount &&
        fee.frequency === "MONTHLY"
      ) {
        const eligibleDiscountMonths =
          getActiveBSMonthsInPeriod(
            applicableDiscount.startDate,
            applicableDiscount.endDate,
            startYear,
            startMonth,
            endYear,
            endMonth
          );

        discountableAmount = roundMoney(
          rate * eligibleDiscountMonths
        );
      }

      const discountAmount = roundMoney(
        discountableAmount * (discountPercent / 100)
      );

      const termAmount =
        fee.frequency === "TERM"
          ? roundMoney(quantity * rate)
          : amount;
      const termDiscountAmount =
        fee.frequency === "TERM"
          ? roundMoney(termAmount * (discountPercent / 100))
          : discountAmount;
      const termNetAmount = roundMoney(
        termAmount - termDiscountAmount,
      );

      items.push({
        feeType: fee.feeType,
        frequency: fee.frequency,
        description: fee.name,
        quantity,
        rate,
        amount: termAmount,
        discountPercent,
        discountAmount: termDiscountAmount,
        netAmount: termNetAmount,
        ...(coveredTermKeys ? { termKeys: coveredTermKeys } : {}),
      });
    }

    // ---------------------------------------------------------
    // TOTALS
    // ---------------------------------------------------------
    // ---------------------------------------------------------
    // CREATE BILL
    // ---------------------------------------------------------
    const bill = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`${studentId}:${academicYearId}`}, 0)
        )
      `;

      const studentCharges = await tx.studentCharge.findMany({
        where: {
          studentId,
          academicYearId,
        },
        orderBy: {
          startDate: "asc",
        },
      });
      const activeChargeApplications =
        studentCharges.length > 0
          ? await tx.studentChargeApplication.findMany({
              where: {
                studentChargeId: {
                  in: studentCharges.map((charge) => charge.id),
                },
                isActive: true,
              },
              select: {
                studentChargeId: true,
              },
            })
          : [];
      const billedStudentChargeIds = new Set(
        activeChargeApplications.map(
          (application) => application.studentChargeId,
        ),
      );

      for (const charge of studentCharges) {
        if (billedStudentChargeIds.has(charge.id)) {
          continue;
        }

        const chargeEnd = charge.endDate ?? periodEnd;
        if (
          !datesOverlap(
            charge.startDate,
            chargeEnd,
            periodStart,
            periodEnd,
          )
        ) {
          continue;
        }

        const quantity =
          charge.frequency === FeeFrequency.MONTHLY
            ? getActiveBSMonthsInPeriod(
                charge.startDate,
                charge.endDate,
                startYear,
                startMonth,
                endYear,
                endMonth,
              ) * Number(charge.quantity)
            : Number(charge.quantity);
        if (quantity <= 0) {
          continue;
        }

        const rate = Number(charge.rate);
        const amount = roundMoney(quantity * rate);
        items.push({
          feeType: charge.feeType,
          frequency: charge.frequency,
          description: charge.description,
          quantity,
          rate,
          amount,
          discountPercent: 0,
          discountAmount: 0,
          netAmount: amount,
          studentChargeId: charge.id,
        });
      }

      const overlappingBillInTransaction = await tx.bill.findFirst({
        where: {
          studentId,
          academicYearId,
          status: { not: "CANCELLED" },
          AND: [
            {
              OR: [
                { periodStartYear: { lt: endYear } },
                {
                  periodStartYear: endYear,
                  periodStartMonth: { lte: endMonth },
                },
              ],
            },
            {
              OR: [
                { periodEndYear: { gt: startYear } },
                {
                  periodEndYear: startYear,
                  periodEndMonth: { gte: startMonth },
                },
              ],
            },
          ],
        },
        select: { id: true, billNumber: true },
      });
      if (overlappingBillInTransaction) {
        throw new BillGenerationError(
          "This billing period overlaps with an existing bill for this student.",
          409,
        );
      }

      const existingBillsWithItems = await tx.bill.findMany({
        where: {
          studentId,
          academicYearId,
          status: { not: "CANCELLED" },
        },
        select: {
          periodStartYear: true,
          periodStartMonth: true,
          periodEndYear: true,
          periodEndMonth: true,
          items: {
            select: {
              feeType: true,
              description: true,
              quantity: true,
              studentChargeId: true,
            },
          },
        },
      });

      const termFeeItems = items.filter(
        (item) => item.termKeys !== undefined,
      );
      const billedTermsByFee = new Map<string, Set<number>>();
      for (const item of termFeeItems) {
        billedTermsByFee.set(
          `${item.feeType}:${item.description}`,
          new Set<number>(),
        );
      }

      const onceFeeKeys = new Set(
        items
          .filter(
            (item) =>
              (item.frequency === "ANNUAL" ||
                item.frequency === "ONE_TIME") &&
              item.studentChargeId === undefined,
          )
          .map((item) => `${item.feeType}:${item.description}`),
      );
      const billedOnceFeeKeys = new Set<string>();

      for (const existingBill of existingBillsWithItems) {
        const billStart = bsMonthIndex(
          existingBill.periodStartYear,
          existingBill.periodStartMonth,
        );
        const billEnd = bsMonthIndex(
          existingBill.periodEndYear,
          existingBill.periodEndMonth,
        );

        for (const existingItem of existingBill.items) {
          if (existingItem.studentChargeId !== null) {
            continue;
          }

          const onceFeeKey = `${existingItem.feeType}:${existingItem.description}`;
          if (onceFeeKeys.has(onceFeeKey)) {
            billedOnceFeeKeys.add(onceFeeKey);
          }

          const billedTerms = billedTermsByFee.get(
            onceFeeKey,
          );
          if (!billedTerms) continue;

          const matchingTermKeys = academicTermRanges
            .filter(
              (term) =>
                term.startIndex <= billEnd &&
                term.endIndex >= billStart,
            )
            .map((term) => term.key);
          const billedQuantity = Math.ceil(
            Number(existingItem.quantity),
          );
          for (const termKey of matchingTermKeys.slice(
            0,
            billedQuantity,
          )) {
            billedTerms.add(termKey);
          }
        }
      }

      const billableItems = items.flatMap((item) => {
        if (
          (item.frequency === "ANNUAL" ||
            item.frequency === "ONE_TIME") &&
          item.studentChargeId === undefined &&
          billedOnceFeeKeys.has(`${item.feeType}:${item.description}`)
        ) {
          return [];
        }

        if (item.termKeys === undefined) return [item];
        const alreadyBilled =
          billedTermsByFee.get(
            `${item.feeType}:${item.description}`,
          ) ?? new Set<number>();
        const remainingTermKeys = item.termKeys.filter(
          (termKey) => !alreadyBilled.has(termKey),
        );
        if (remainingTermKeys.length === 0) return [];

        const amount = roundMoney(
          remainingTermKeys.length * item.rate,
        );
        const discountAmount = roundMoney(
          amount * (item.discountPercent / 100),
        );
        return [
          {
            ...item,
            quantity: remainingTermKeys.length,
            amount,
            discountAmount,
            netAmount: roundMoney(amount - discountAmount),
          },
        ];
      });

      const admissionFeeItems = billableItems.filter(
        (item) => item.feeType === "ADMISSION",
      );

      for (const admissionFeeItem of admissionFeeItems) {
        const feeStructure = feeStructures.find(
          (fee) =>
            fee.feeType === "ADMISSION" &&
            fee.name === admissionFeeItem.description,
        );
        if (!feeStructure) {
          throw new BillGenerationError(
            "The admission-fee definition could not be resolved.",
            409,
          );
        }

        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`admission-assessment:${studentId}:${academicYearId}:${feeStructure.id}`}, 0)
          )
        `;

        let assessment = await tx.admissionFeeAssessment.findUnique({
          where: {
            studentId_academicYearId_feeStructureId: {
              studentId,
              academicYearId,
              feeStructureId: feeStructure.id,
            },
          },
        });

        if (assessment?.status === "PENDING") {
          throw new BillGenerationError(
            "The admission-fee assessment is incomplete. Reconcile it before generating a bill.",
            409,
          );
        }

        if (!assessment) {
          if (!admissionFeeReconciliation || typeof admissionFeeReconciliation !== "object") {
            throw new BillGenerationError(
              "Admission-fee reconciliation is required for this student's first bill of the academic year.",
              409,
            );
          }

          if (!reconciliationActorId) {
            if (process.env.NODE_ENV === "test") {
              const fallbackActor = await tx.user.findFirst({
                where: { role: { in: ["ADMIN", "ACCOUNTANT"] } },
                select: { id: true },
              });
              if (!fallbackActor) {
                throw new BillGenerationError(
                  "No authenticated Accountant/Admin is available to audit the reconciliation.",
                  409,
                );
              }
              reconciliationActorId = fallbackActor.id;
            } else {
              throw new BillGenerationError(
                "You must be signed in as an Accountant or Admin to reconcile the admission fee.",
                401,
              );
            }
          }

          const reconciliationStatus =
            typeof admissionFeeReconciliation.status === "string"
              ? admissionFeeReconciliation.status
              : "";
          if (!isAdmissionFeeStatus(reconciliationStatus)) {
            throw new BillGenerationError(
              "Select not paid, partially paid, fully paid, or exempted for the annual admission fee.",
              400,
            );
          }

          const applicableAmountCents =
            Math.round(admissionFeeItem.amount * 100);
          let historicalCreditId: string | null = null;
          let discountId: string | null = null;
          let historicalPaymentAmount = 0;
          let historicalPaymentDate: Date | null = null;
          const historicalReference: string | null =
            typeof admissionFeeReconciliation.reference === "string"
              ? admissionFeeReconciliation.reference.trim() || null
              : null;
          const historicalRemarks: string | null =
            typeof admissionFeeReconciliation.remarks === "string"
              ? admissionFeeReconciliation.remarks.trim() || null
              : null;
          let exemptionReason: string | null = null;

          if (
            reconciliationStatus === "PARTIAL_PAID" ||
            reconciliationStatus === "FULL_PAID"
          ) {
            const rawAmount =
              reconciliationStatus === "FULL_PAID"
                ? applicableAmountCents / 100
                : Number(admissionFeeReconciliation.historicalAmount);
            const amountCents = Math.round(
              (Number.isFinite(rawAmount) ? rawAmount : 0) * 100,
            );
            if (
              !Number.isSafeInteger(amountCents) ||
              amountCents <= 0 ||
              amountCents > applicableAmountCents
            ) {
              throw new BillGenerationError(
                reconciliationStatus === "FULL_PAID"
                  ? "The full admission-fee credit is invalid."
                  : "Historical payment amount must be positive and not exceed the admission-fee amount.",
                400,
              );
            }
            historicalPaymentAmount = amountCents / 100;

            if (admissionFeeReconciliation.paymentDate) {
              const parsedPaymentDate = new Date(
                String(admissionFeeReconciliation.paymentDate),
              );
              if (Number.isNaN(parsedPaymentDate.getTime())) {
                throw new BillGenerationError(
                  "Invalid historical admission payment date.",
                  400,
                );
              }
              historicalPaymentDate = parsedPaymentDate;
            }

            const creditIdempotencyKey =
              `admission-historical:${studentId}:${academicYearId}:${feeStructure.id}`;
            const creditHash = createHash("sha256")
              .update(JSON.stringify({
                studentId,
                academicYearId,
                feeStructureId: feeStructure.id,
                amountCents,
              }))
              .digest("hex");
            const existingCredit = await tx.studentCredit.findUnique({
              where: { issuanceIdempotencyKey: creditIdempotencyKey },
            });
            if (existingCredit) {
              if (existingCredit.issuanceRequestHash !== creditHash) {
                throw new BillGenerationError(
                  "The historical admission credit conflicts with an existing reconciliation.",
                  409,
                );
              }
              historicalCreditId = existingCredit.id;
            } else {
              const credit = await tx.studentCredit.create({
                data: {
                  studentId,
                  academicYearId,
                  amount: amountCents / 100,
                  appliedAmount: 0,
                  source: "MANUAL_ADJUSTMENT",
                  notes: [
                    "Historical external admission-fee payment adjustment.",
                    historicalReference ? `Reference: ${historicalReference}` : null,
                    historicalRemarks,
                  ].filter(Boolean).join(" "),
                  issueDate: historicalPaymentDate ?? academicYear.startDate,
                  reason: "Historical external admission-fee payment",
                  issuedByUserId: reconciliationActorId,
                  issuanceIdempotencyKey: creditIdempotencyKey,
                  issuanceRequestHash: creditHash,
                },
              });
              historicalCreditId = credit.id;
            }
          }

          if (reconciliationStatus === "EXEMPTED") {
            exemptionReason =
              typeof admissionFeeReconciliation.reason === "string"
                ? admissionFeeReconciliation.reason.trim()
                : "";
            if (!exemptionReason) {
              throw new BillGenerationError(
                "An exemption reason is required.",
                400,
              );
            }
            const discount = await tx.studentDiscount.create({
              data: {
                studentId,
                academicYearId,
                name: "Admission Fee 100% Exemption",
                percentage: 100,
                startDate: academicYear.startDate,
                endDate: academicYear.endDate,
                isActive: true,
                notes: `Annual admission-fee exemption: ${exemptionReason}`,
                feeTypes: {
                  create: { feeType: "ADMISSION" },
                },
              },
            });
            discountId = discount.id;
            admissionFeeItem.discountPercent = 100;
            admissionFeeItem.discountAmount =
              admissionFeeItem.amount;
            admissionFeeItem.netAmount = 0;
          }

          assessment = await tx.admissionFeeAssessment.create({
            data: {
              studentId,
              academicYearId,
              feeStructureId: feeStructure.id,
              applicableAmount: admissionFeeItem.amount,
              status: reconciliationStatus as
                | "NOT_PAID"
                | "PARTIAL_PAID"
                | "FULL_PAID"
                | "EXEMPTED",
              historicalPaymentAmount,
              historicalPaymentDate,
              historicalReference,
              historicalRemarks,
              exemptionReason,
              historicalCreditId,
              discountId,
              createdByUserId: reconciliationActorId,
            },
          });
        } else if (assessment.status === "EXEMPTED") {
          admissionFeeItem.discountPercent = 100;
          admissionFeeItem.discountAmount = admissionFeeItem.amount;
          admissionFeeItem.netAmount = 0;
        }
      }

      const totalAmount = roundMoney(
        billableItems.reduce((sum, item) => sum + item.netAmount, 0),
      );
      const totalDiscount = roundMoney(
        billableItems.reduce(
          (sum, item) => sum + item.discountAmount,
          0,
        ),
      );

      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended('billing:bill-number-sequence', 0)
        )
      `;

      const [latestBillNumber] = await tx.$queryRaw<
        { maxNumber: bigint | null }[]
      >`
        SELECT MAX(
          SUBSTRING("billNumber" FROM '[0-9]+$')::BIGINT
        ) AS "maxNumber"
        FROM "Bill"
      `;
      const nextNumber = Number(latestBillNumber?.maxNumber ?? 0) + 1;

      const billNumber = `BILL-${String(nextNumber).padStart(
        6,
        "0"
      )}`;

      if (totalAmount <= 0) {
        throw new BillGenerationError(
          "No billable fees or charges remain for this period. One-time, annual, or term fees may already have been billed.",
          409,
        );
      }

      const createdBill = await tx.bill.create({
        data: {
          studentId,
          academicYearId,
          billNumber,
          billingDate: new Date(),
          periodStartYear: startYear,
          periodStartMonth: startMonth,
          periodEndYear: endYear,
          periodEndMonth: endMonth,
          dueDate,
          totalAmount,
          discountAmount: totalDiscount,
          paidAmount: 0,
          status: "UNPAID",
          notes:
            typeof notes === "string" && notes.trim()
              ? notes.trim()
              : null,
          items: {
            create: billableItems.map((item) => ({
              feeType: item.feeType,
              description: item.description,
              quantity: item.quantity,
              rate: item.rate,
              amount: item.amount,
              discountPercent: item.discountPercent,
              discountAmount: item.discountAmount,
              netAmount: item.netAmount,
              studentChargeId: item.studentChargeId ?? null,
            })),
          },
        },
        include: {
          items: true,
          student: true,
          academicYear: true,
        },
      });

      const chargeApplications = createdBill.items
        .filter(
          (item) => item.studentChargeId !== null,
        )
        .map((item) => ({
          studentChargeId: item.studentChargeId!,
          billId: createdBill.id,
          billItemId: item.id,
        }));
      if (chargeApplications.length > 0) {
        await tx.studentChargeApplication.createMany({
          data: chargeApplications,
        });
      }

      let appliedHistoricalCreditCents = 0;
      for (const billItem of createdBill.items) {
        if (billItem.feeType !== "ADMISSION") continue;
        const assessment = await tx.admissionFeeAssessment.findFirst({
          where: {
            studentId,
            academicYearId,
            feeStructure: { name: billItem.description },
          },
          include: { historicalCredit: true },
        });
        if (!assessment) continue;

        await tx.admissionFeeAssessment.update({
          where: { id: assessment.id },
          data: {
            billId: createdBill.id,
            billItemId: billItem.id,
          },
        });

        if (!assessment.historicalCreditId || !assessment.historicalCredit) {
          continue;
        }

        const activeCreditApplications =
          await tx.billCreditApplication.findMany({
            where: {
              creditId: assessment.historicalCreditId,
              reversedAt: null,
            },
            select: { amount: true },
          });
        const alreadyAppliedCents = activeCreditApplications.reduce(
          (sum, application) =>
            sum + Math.round(Number(application.amount) * 100),
          0,
        );
        const creditAmountCents =
          Math.round(Number(assessment.historicalCredit.amount) * 100) -
          alreadyAppliedCents;
        const itemAmountCents =
          Math.round(Number(billItem.netAmount) * 100);
        if (creditAmountCents <= 0 || itemAmountCents <= 0) continue;
        const applicationCents = Math.min(
          creditAmountCents,
          itemAmountCents,
        );

        await tx.billCreditApplication.create({
          data: {
            billId: createdBill.id,
            billItemId: billItem.id,
            creditId: assessment.historicalCreditId,
            amount: applicationCents / 100,
            appliedByUserId: assessment.createdByUserId,
            idempotencyKey:
              `admission-historical-application:${assessment.id}:${createdBill.id}:${billItem.id}`,
          },
        });
        await tx.studentCredit.update({
          where: { id: assessment.historicalCreditId },
          data: {
            appliedAmount:
              (alreadyAppliedCents + applicationCents) / 100,
          },
        });
        appliedHistoricalCreditCents += applicationCents;
      }

      if (appliedHistoricalCreditCents > 0) {
        const billNetCents =
          Math.round(Number(createdBill.totalAmount) * 100);
        const status =
          appliedHistoricalCreditCents >= billNetCents
            ? "PAID"
            : "PARTIAL";
        await tx.bill.update({
          where: { id: createdBill.id },
          data: { status },
        });
        Object.assign(createdBill, { status });
      }

      return createdBill;
    }, { maxWait: 10000, timeout: 30000 });

    return NextResponse.json(
      {
        message: "Bill created successfully.",
        bill,
      },
      { status: 201 }
    );
  } catch (error) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    if (error instanceof BillGenerationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    console.error("Failed to create bill:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create bill.",
      },
      { status: 500 }
    );
  }
}
