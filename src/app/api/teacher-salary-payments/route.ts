
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  requireConfiguredSchool,
  schoolConfigurationErrorResponse,
} from "@/lib/school-api";
import {
  recordTeacherSalaryPayment,
  SalaryPaymentRequestError,
} from "@/lib/teacher-salary-payment";
import { parseFiniteNumberInput } from "@/lib/finance/number-input";

const paymentMethods = [
  "CASH",
  "BANK",
  "ONLINE",
  "OTHER",
] as const;

type PaymentMethodValue =
  (typeof paymentMethods)[number];

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isPaymentMethod(
  value: string,
): value is PaymentMethodValue {
  return paymentMethods.some((method) => method === value);
}

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 },
      );
    }

    const school = await requireConfiguredSchool();
    const body = await request.json();

    const teacherSalaryId = String(
      body.teacherSalaryId ?? "",
    ).trim();

    const amount = parseFiniteNumberInput(body.amount);
    const methodValue = String(
      body.method ?? "CASH",
    );

    if (!teacherSalaryId) {
      return NextResponse.json(
        { error: "Salary record is required." },
        { status: 400 },
      );
    }

    if (amount === null || amount <= 0) {
      return NextResponse.json(
        { error: "Payment amount must be greater than zero." },
        { status: 400 },
      );
    }

    const paymentAmount = roundMoney(amount);

    if (!isPaymentMethod(methodValue)) {
      return NextResponse.json(
        { error: "Select a valid payment method." },
        { status: 400 },
      );
    }

    const paymentDateText = String(
      body.paymentDate ?? "",
    ).trim();

    let paymentDate = new Date();

    if (paymentDateText) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(paymentDateText)) {
        paymentDate = new Date(
          `${paymentDateText}T12:00:00.000Z`,
        );

        if (
          paymentDate.toISOString().slice(0, 10) !==
          paymentDateText
        ) {
          return NextResponse.json(
            { error: "Enter a valid payment date." },
            { status: 400 },
          );
        }
      } else {
        paymentDate = new Date(paymentDateText);

        if (Number.isNaN(paymentDate.getTime())) {
          return NextResponse.json(
            { error: "Enter a valid payment date." },
            { status: 400 },
          );
        }
      }
    }

    const reference =
      typeof body.reference === "string"
        ? body.reference.trim() || null
        : null;

    const notes =
      typeof body.notes === "string"
        ? body.notes.trim() || null
        : null;

    const salaryRecord = await prisma.teacherSalary.findFirst({
      where: {
        id: teacherSalaryId,
        teacher: { is: { schoolId: school.id } },
        academicYear: { is: { schoolId: school.id } },
      },
      select: { id: true },
    });
    if (!salaryRecord) {
      return NextResponse.json(
        { error: "Teacher salary record not found." },
        { status: 404 },
      );
    }

    const salary = await prisma.$transaction(
      (tx) =>
        recordTeacherSalaryPayment(tx, {
          teacherSalaryId,
          amount: paymentAmount,
          paymentDate,
          method: methodValue,
          reference,
          notes,
        }),
      { maxWait: 15_000, timeout: 20_000 },
    );

    return NextResponse.json({
      message: "Salary payment recorded successfully.",
      salary,
    });
  } catch (error) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    if (error instanceof SalaryPaymentRequestError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    console.error("Failed to record salary payment:", error);

    return NextResponse.json(
      { error: "Failed to record salary payment." },
      { status: 500 },
    );
  }
}
