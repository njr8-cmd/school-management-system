import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authorizeSession } from "@/lib/auth/authorization";
import { voidExpenseRecord } from "@/lib/finance/expense-void";
import { prisma } from "@/lib/prisma";
import { bsToDate, dateToBS } from "@/lib/nepali-date";
import { parseFiniteNumberInput } from "@/lib/finance/number-input";
import {
  requireConfiguredSchool,
  schoolConfigurationErrorResponse,
} from "@/lib/school-api";

const categories = [
  "OFFICE_SUPPLIES",
  "ELECTRICITY",
  "WATER",
  "INTERNET",
  "MAINTENANCE",
  "TRANSPORT",
  "MEDICAL",
  "SALARY",
  "FOOD",
  "RENT",
  "TAX",
  "OTHER",
] as const;

const paymentMethods = ["CASH", "BANK", "ONLINE", "OTHER"] as const;

function parseVoidReason(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  const reason = (value as Record<string, unknown>).reason;
  return typeof reason === "string" ? reason.trim() : "";
}

function parseBSDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  try {
    const [year, month, day] = match.slice(1).map(Number);
    const date = bsToDate(year, month, day);
    const converted = dateToBS(date);
    return converted.year === year &&
      converted.month === month &&
      converted.day === day
      ? date
      : null;
  } catch {
    return null;
  }
}

function parseExpense(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Expense information must be an object." };
  }
  const body = value as Record<string, unknown>;
  const academicYearId =
    typeof body.academicYearId === "string"
      ? body.academicYearId.trim()
      : "";
  const category = body.category;
  const description =
    typeof body.description === "string"
      ? body.description.trim()
      : "";
  const amount = parseFiniteNumberInput(body.amount);
  const expenseDate = parseBSDate(body.expenseDate);
  const paymentMethod = body.paymentMethod ?? "CASH";

  if (!academicYearId || !description || !expenseDate) {
    return { error: "Academic year, description, and a valid BS date are required." };
  }
  if (!categories.includes(category as (typeof categories)[number])) {
    return { error: "Select a valid expense category." };
  }
  if (amount === null || amount <= 0) {
    return { error: "Expense amount must be greater than zero." };
  }
  if (!paymentMethods.includes(paymentMethod as (typeof paymentMethods)[number])) {
    return { error: "Select a valid payment method." };
  }

  return {
    data: {
      academicYearId,
      category: category as (typeof categories)[number],
      description,
      amount,
      expenseDate,
      paymentMethod: paymentMethod as (typeof paymentMethods)[number],
      paidTo:
        typeof body.paidTo === "string" ? body.paidTo.trim() || null : null,
      reference:
        typeof body.reference === "string"
          ? body.reference.trim() || null
          : null,
      notes:
        typeof body.notes === "string" ? body.notes.trim() || null : null,
    },
  };
}

export async function GET(request: Request) {
  try {
    const school = await requireConfiguredSchool();
    const { searchParams } = new URL(request.url);
    const academicYearId = searchParams.get("academicYearId");
    const expenses = await prisma.expense.findMany({
      where: {
        academicYear: { is: { schoolId: school.id } },
        ...(academicYearId && { academicYearId }),
      },
      include: {
        academicYear: { select: { id: true, name: true } },
        voidedBy: { select: { id: true, name: true } },
      },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(expenses);
  } catch (error) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    console.error("Failed to load expenses:", error);
    return NextResponse.json(
      { error: "Failed to load expenses." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const school = await requireConfiguredSchool();
    const body = await request.json();
    const parsed = parseExpense(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const academicYear = await prisma.academicYear.findUnique({
      where: { id: parsed.data.academicYearId, schoolId: school.id },
      select: { id: true },
    });
    if (!academicYear) {
      return NextResponse.json(
        { error: "Academic year not found." },
        { status: 404 },
      );
    }

    const expense = await prisma.expense.create({ data: parsed.data });
    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    console.error("Failed to record expense:", error);
    return NextResponse.json(
      { error: "Failed to record expense." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const school = await requireConfiguredSchool();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Expense ID is required." }, { status: 400 });
    }

    const body = await request.json();
    const parsed = parseExpense(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const academicYear = await prisma.academicYear.findFirst({
      where: {
        id: parsed.data.academicYearId,
        schoolId: school.id,
      },
      select: { id: true },
    });
    if (!academicYear) {
      return NextResponse.json(
        { error: "Academic year not found." },
        { status: 404 },
      );
    }

    const existing = await prisma.expense.findFirst({
      where: {
        id,
        academicYear: { is: { schoolId: school.id } },
        voidedAt: null,
      },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Expense not found." },
        { status: 404 },
      );
    }

    const updated = await prisma.expense.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json(updated);
  } catch (error) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    console.error("Failed to update expense:", error);
    return NextResponse.json(
      { error: "Failed to update expense." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const authorization = authorizeSession(await auth(), [
      "ADMIN",
      "ACCOUNTANT",
    ]);
    if (!authorization.ok) {
      return NextResponse.json(
        { error: authorization.message },
        { status: authorization.status },
      );
    }

    const school = await requireConfiguredSchool();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Expense ID is required." }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "A reason is required to void an expense." },
        { status: 400 },
      );
    }
    const reason = parseVoidReason(body);
    if (!reason || reason.length > 500) {
      return NextResponse.json(
        { error: "A reason of 1–500 characters is required to void an expense." },
        { status: 400 },
      );
    }

    const existing = await prisma.expense.findFirst({
      where: {
        id,
        academicYear: { is: { schoolId: school.id } },
      },
      select: { id: true, voidedAt: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Expense not found." },
        { status: 404 },
      );
    }
    if (existing.voidedAt) {
      return NextResponse.json(
        { error: "Expense has already been voided." },
        { status: 409 },
      );
    }

    const updated = await prisma.$transaction((tx) =>
      voidExpenseRecord(tx, {
        id,
        schoolId: school.id,
        userId: authorization.userId,
        reason,
      }),
    );
    if (updated.count !== 1) {
      return NextResponse.json(
        { error: "Expense has already been voided." },
        { status: 409 },
      );
    }

    const expense = await prisma.expense.findUniqueOrThrow({
      where: { id },
      include: {
        voidedBy: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({
      message: "Expense voided and retained for audit.",
      expense,
    });
  } catch (error) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    console.error("Failed to void expense:", error);
    return NextResponse.json(
      { error: "Failed to void expense." },
      { status: 500 },
    );
  }
}
