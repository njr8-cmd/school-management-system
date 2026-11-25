import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseFiniteNumberInput } from "@/lib/finance/number-input";
import {
  requireConfiguredSchool,
  schoolConfigurationErrorResponse,
} from "@/lib/school-api";

const validPaymentMethods = [
  "CASH",
  "BANK",
  "ONLINE",
  "OTHER",
] as const;

// ==================================================
// GET /api/payments
// Get payment history
// ==================================================
export async function GET(request: Request) {
  try {
    const school = await requireConfiguredSchool();
    const { searchParams } = new URL(request.url);

    const billId = searchParams.get("billId");
    const method = searchParams.get("method");

    const payments = await prisma.payment.findMany({
      where: {
        bill: {
          is: {
            student: { is: { schoolId: school.id } },
            academicYear: { is: { schoolId: school.id } },
          },
        },
        ...(billId ? { billId } : {}),
        ...(method
          ? {
              method: method as (typeof validPaymentMethods)[number],
            }
          : {}),
      },

      include: {
        bill: {
          include: {
            student: true,
            academicYear: true,
          },
        },
      },

      orderBy: {
        paymentDate: "desc",
      },
    });

    return NextResponse.json({
      payments,
      count: payments.length,
    });
  } catch (error) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    console.error("Failed to fetch payments:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch payments.",
      },
      { status: 500 }
    );
  }
}

// ==================================================
// POST /api/payments
// Record a payment
// ==================================================
export async function POST(request: Request) {
  try {
    const school = await requireConfiguredSchool();
    const body = await request.json();
    const idempotencyKey =
      request.headers.get("Idempotency-Key")?.trim();

    const {
      billId,
      amount,
      method = "CASH",
      reference,
      notes,
      waiverAmount = 0,
      waiverReason,
      paymentDate,
    } = body;

    if (
      !idempotencyKey ||
      idempotencyKey.length > 200
    ) {
      return NextResponse.json(
        {
          error:
            "A valid Idempotency-Key header is required.",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // Basic validation
    // --------------------------------------------------

    if (!billId) {
      return NextResponse.json(
        {
          error: "Bill ID is required.",
        },
        { status: 400 }
      );
    }

    const paymentAmount =
      parseFiniteNumberInput(amount);
    const paymentWaiver =
      waiverAmount === undefined
        ? 0
        : parseFiniteNumberInput(waiverAmount);
    const normalizedReference =
      typeof reference === "string"
        ? reference.trim() || null
        : null;
    const normalizedNotes =
      typeof notes === "string"
        ? notes.trim() || null
        : null;
    const normalizedWaiverReason =
      paymentWaiver !== null &&
      paymentWaiver > 0 &&
      typeof waiverReason === "string"
        ? waiverReason.trim()
        : null;

    if (
      paymentAmount === null ||
      paymentAmount <= 0
    ) {
      return NextResponse.json(
        {
          error: "Payment amount must be greater than 0.",
        },
        { status: 400 }
      );
    }

    if (
      paymentWaiver === null ||
      paymentWaiver < 0
    ) {
      return NextResponse.json(
        {
          error: "Waiver amount cannot be negative.",
        },
        { status: 400 }
      );
    }

    if (!validPaymentMethods.includes(method)) {
      return NextResponse.json(
        {
          error: "Invalid payment method.",
        },
        { status: 400 }
      );
    }

    if (
      paymentWaiver > 0 &&
      !normalizedWaiverReason
    ) {
      return NextResponse.json(
        {
          error:
            "Waiver reason is required when a waiver is given.",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // Payment date
    // --------------------------------------------------

    let parsedPaymentDate: Date | undefined;

    if (paymentDate) {
      parsedPaymentDate = new Date(paymentDate);

      if (Number.isNaN(parsedPaymentDate.getTime())) {
        return NextResponse.json(
          {
            error: "Invalid payment date.",
          },
          { status: 400 }
        );
      }
    }

    const idempotencyRequestHash = createHash("sha256")
      .update(
        JSON.stringify({
          billId,
          amount: paymentAmount,
          method,
          reference: normalizedReference,
          notes: normalizedNotes,
          waiverAmount: paymentWaiver,
          waiverReason: normalizedWaiverReason,
          paymentDate:
            parsedPaymentDate?.toISOString() ?? null,
        })
      )
      .digest("hex");

    // --------------------------------------------------
    // Transaction
    // --------------------------------------------------

    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(
              ${`payment-idempotency:${idempotencyKey}`},
              0
            )
          )
        `;
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`billing:bill:${billId}`}, 0)
          )
        `;

        const existingPayment =
          await tx.payment.findUnique({
            where: {
              idempotencyKey,
            },
          });

        if (existingPayment) {
          if (
            existingPayment.idempotencyRequestHash !==
            idempotencyRequestHash
          ) {
            throw new Error(
              "IDEMPOTENCY_KEY_REUSED"
            );
          }

          const existingBill =
            await tx.bill.findFirst({
              where: {
                id: existingPayment.billId,
                student: { is: { schoolId: school.id } },
                academicYear: { is: { schoolId: school.id } },
              },
            });

          if (!existingBill) {
            throw new Error("BILL_NOT_FOUND");
          }

          const [
            paymentTotals,
            creditTotals,
          ] = await Promise.all([
            tx.payment.aggregate({
              where: {
                billId: existingBill.id,
              },
              _sum: {
                amount: true,
                waiverAmount: true,
              },
            }),
            tx.billCreditApplication.aggregate({
              where: {
                billId: existingBill.id,
                reversedAt: null,
              },
              _sum: {
                amount: true,
              },
            }),
          ]);

          const previousPaidAmount = Number(
            paymentTotals._sum.amount ?? 0
          );
          const previousWaiverAmount = Number(
            paymentTotals._sum.waiverAmount ?? 0
          );
          const previousCreditAmount = Number(
            creditTotals._sum.amount ?? 0
          );
          const totalSettled =
            previousPaidAmount +
            previousWaiverAmount +
            previousCreditAmount;

          return {
            payment: existingPayment,
            bill: existingBill,
            previousPaidAmount,
            previousWaiverAmount,
            previousCreditAmount,
            totalSettled,
            remainingDue: Math.max(
              0,
              Number(existingBill.totalAmount) -
                totalSettled
            ),
            replayed: true,
          };
        }

        // ----------------------------------------------
        // Find bill
        // ----------------------------------------------

        const bill = await tx.bill.findFirst({
          where: {
            id: billId,
            student: { is: { schoolId: school.id } },
            academicYear: { is: { schoolId: school.id } },
          },
        });

        if (!bill) {
          throw new Error("BILL_NOT_FOUND");
        }

        if (bill.status === "CANCELLED") {
          throw new Error("BILL_CANCELLED");
        }

        // ----------------------------------------------
        // Get all previous payments
        // ----------------------------------------------

        const previousPayments =
          await tx.payment.findMany({
            where: {
              billId,
            },
            select: {
              amount: true,
              waiverAmount: true,
            },
          });

        // ----------------------------------------------
        // Get credit applications
        // ----------------------------------------------

        const creditApplications =
          await tx.billCreditApplication.findMany({
            where: {
              billId,
              reversedAt: null,
            },
            select: {
              amount: true,
            },
          });

        // ----------------------------------------------
        // Calculate previous settlement
        //
        // Actual money:
        //   sum(Payment.amount)
        //
        // Waivers:
        //   sum(Payment.waiverAmount)
        //
        // Credits:
        //   sum(BillCreditApplication.amount)
        // ----------------------------------------------

        const previousPaidAmount =
          previousPayments.reduce(
            (sum, payment) =>
              sum + Number(payment.amount),
            0
          );

        const previousWaiverAmount =
          previousPayments.reduce(
            (sum, payment) =>
              sum + Number(payment.waiverAmount),
            0
          );

        const previousCreditAmount =
          creditApplications.reduce(
            (sum, application) =>
              sum + Number(application.amount),
            0
          );

        const totalAmount = Number(
          bill.totalAmount
        );

        const previouslySettled =
          previousPaidAmount +
          previousWaiverAmount +
          previousCreditAmount;

        const currentOutstanding =
          totalAmount - previouslySettled;

        // ----------------------------------------------
        // Already fully settled
        // ----------------------------------------------

        if (currentOutstanding <= 0) {
          throw new Error(
            "BILL_NO_OUTSTANDING_BALANCE"
          );
        }

        // ----------------------------------------------
        // Payment + waiver cannot exceed outstanding
        // ----------------------------------------------

        const settlementAmount =
          paymentAmount + paymentWaiver;

        if (
          settlementAmount >
          currentOutstanding
        ) {
          throw new Error(
            `PAYMENT_EXCEEDS_BALANCE:${currentOutstanding}`
          );
        }

        // ----------------------------------------------
        // Create payment
        // ----------------------------------------------

        const payment =
          await tx.payment.create({
            data: {
              billId,
              amount: paymentAmount,
              method,
              reference: normalizedReference,
              notes: normalizedNotes,
              waiverAmount: paymentWaiver,
              waiverReason: normalizedWaiverReason,
              idempotencyKey,
              idempotencyRequestHash,

              ...(parsedPaymentDate
                ? {
                    paymentDate:
                      parsedPaymentDate,
                  }
                : {}),
            },
          });

        // ----------------------------------------------
        // Calculate new totals
        // ----------------------------------------------

        const newPaidAmount =
          previousPaidAmount +
          paymentAmount;

        const newWaiverAmount =
          previousWaiverAmount +
          paymentWaiver;

        const newSettledAmount =
          newPaidAmount +
          newWaiverAmount +
          previousCreditAmount;

        const newOutstanding =
          totalAmount -
          newSettledAmount;

        // ----------------------------------------------
        // Determine bill status
        // ----------------------------------------------

        let status:
          | "UNPAID"
          | "PARTIAL"
          | "PAID";

        if (newOutstanding <= 0) {
          status = "PAID";
        } else if (
          newPaidAmount > 0 ||
          newWaiverAmount > 0 ||
          previousCreditAmount > 0
        ) {
          status = "PARTIAL";
        } else {
          status = "UNPAID";
        }

        // ----------------------------------------------
        // Update bill
        //
        // paidAmount = actual money received ONLY
        // ----------------------------------------------

        const updatedBill =
          await tx.bill.update({
            where: {
              id: billId,
            },
            data: {
              paidAmount: newPaidAmount,
              status,
            },
          });

        return {
          payment,
          bill: updatedBill,
          previousPaidAmount,
          previousWaiverAmount,
          previousCreditAmount,
          totalSettled: newSettledAmount,
          remainingDue: Math.max(
            0,
            newOutstanding
          ),
          replayed: false,
        };
      },
      {
        maxWait: 10000,
        timeout: 20000,
      }
    );

    // --------------------------------------------------
    // Response
    // --------------------------------------------------

    return NextResponse.json(
      {
        message: result.replayed
          ? "This payment request was already recorded."
          : "Payment recorded successfully.",
        payment: result.payment,
        bill: result.bill,
        settlement: {
          previousPaidAmount:
            result.previousPaidAmount,
          previousWaiverAmount:
            result.previousWaiverAmount,
          previousCreditAmount:
            result.previousCreditAmount,
          totalSettled:
            result.totalSettled,
          remainingDue:
            result.remainingDue,
        },
      },
      { status: result.replayed ? 200 : 201 }
    );
  } catch (error) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    console.error(
      "Failed to record payment:",
      error
    );

    if (error instanceof Error) {
      if (
        error.message ===
        "BILL_NOT_FOUND"
      ) {
        return NextResponse.json(
          {
            error: "Bill not found.",
          },
          { status: 404 }
        );
      }

      if (
        error.message ===
        "IDEMPOTENCY_KEY_REUSED"
      ) {
        return NextResponse.json(
          {
            error:
              "This Idempotency-Key has already been used for a different payment request.",
          },
          { status: 409 }
        );
      }

      if (
        error.message ===
        "BILL_CANCELLED"
      ) {
        return NextResponse.json(
          {
            error:
              "Payment cannot be recorded against a cancelled bill.",
          },
          { status: 400 }
        );
      }

      if (
        error.message ===
        "BILL_NO_OUTSTANDING_BALANCE"
      ) {
        return NextResponse.json(
          {
            error:
              "This bill has no outstanding balance.",
          },
          { status: 400 }
        );
      }

      if (
        error.message.startsWith(
          "PAYMENT_EXCEEDS_BALANCE:"
        )
      ) {
        const outstanding =
          error.message.split(":")[1];

        return NextResponse.json(
          {
            error: `Payment plus waiver cannot exceed the outstanding balance of Rs. ${Number(
              outstanding
            ).toFixed(2)}.`,
          },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      {
        error:
          "Failed to record payment.",
      },
      { status: 500 }
    );
  }
}