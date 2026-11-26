
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  requireConfiguredSchool,
  schoolConfigurationErrorResponse,
} from "@/lib/school-api";
import { parseFiniteNumberInput } from "@/lib/finance/number-input";

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 },
      );
    }

    const school = await requireConfiguredSchool();
    const url = new URL(request.url);
    const academicYearId =
      url.searchParams.get("academicYearId");

    const salaries = await prisma.teacherSalary.findMany({
      where: academicYearId
        ? {
            academicYearId,
            teacher: { is: { schoolId: school.id } },
            academicYear: { is: { schoolId: school.id } },
          }
        : {
            teacher: { is: { schoolId: school.id } },
            academicYear: { is: { schoolId: school.id } },
          },
      include: {
        teacher: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            phone: true,
            position: true,
            basicSalary: true,
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
            recordedBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            paymentDate: "desc",
          },
        },
      },
      orderBy: [
        { year: "desc" },
        { month: "desc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json(salaries);
  } catch (error) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    console.error("Failed to load teacher salaries:", error);

    return NextResponse.json(
      { error: "Failed to load teacher salaries." },
      { status: 500 },
    );
  }
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

    const teacherId = String(body.teacherId ?? "").trim();
    const academicYearId = String(
      body.academicYearId ?? "",
    ).trim();

    const month = parseFiniteNumberInput(body.month);
    const year = parseFiniteNumberInput(body.year);
    const deduction = parseFiniteNumberInput(body.deduction ?? 0);

    if (!teacherId || !academicYearId) {
      return NextResponse.json(
        { error: "Teacher and academic year are required." },
        { status: 400 },
      );
    }

    if (
      month === null ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      return NextResponse.json(
        { error: "BS month must be between 1 and 12." },
        { status: 400 },
      );
    }

    if (
      year === null ||
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2200
    ) {
      return NextResponse.json(
        { error: "Enter a valid Bikram Sambat year." },
        { status: 400 },
      );
    }

    if (deduction === null || deduction < 0) {
      return NextResponse.json(
        { error: "Deduction cannot be negative." },
        { status: 400 },
      );
    }

    const [teacher, academicYear] = await Promise.all([
      prisma.teacher.findUnique({
        where: { id: teacherId },
        select: {
          id: true,
          schoolId: true,
          basicSalary: true,
        },
      }),
      prisma.academicYear.findUnique({
        where: { id: academicYearId },
        select: {
          id: true,
          schoolId: true,
          name: true,
        },
      }),
    ]);

    if (!teacher) {
      return NextResponse.json(
        { error: "Teacher not found." },
        { status: 404 },
      );
    }

    if (!academicYear) {
      return NextResponse.json(
        { error: "Academic year not found." },
        { status: 404 },
      );
    }

    if (teacher.schoolId !== academicYear.schoolId) {
      return NextResponse.json(
        {
          error:
            "The teacher and academic year must belong to the same school.",
        },
        { status: 400 },
      );
    }
    if (
      teacher.schoolId !== school.id ||
      academicYear.schoolId !== school.id
    ) {
      return NextResponse.json(
        { error: "Teacher and academic year must belong to the configured school." },
        { status: 400 },
      );
    }

    const submittedSalary =
      body.salaryAmount === undefined ||
      body.salaryAmount === null ||
      body.salaryAmount === ""
        ? Number(teacher.basicSalary ?? 0)
        : parseFiniteNumberInput(body.salaryAmount);

    if (
      submittedSalary === null ||
      submittedSalary <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Enter a salary greater than zero or update the teacher's basic salary first.",
        },
        { status: 400 },
      );
    }

    const salaryAmount = roundMoney(submittedSalary);
    const roundedDeduction = roundMoney(deduction);

    if (roundedDeduction > salaryAmount) {
      return NextResponse.json(
        { error: "Deduction cannot exceed the gross salary." },
        { status: 400 },
      );
    }

    const netAmount = roundMoney(
      salaryAmount - roundedDeduction,
    );

    const salary = await prisma.teacherSalary.create({
      data: {
        teacherId,
        academicYearId,
        month,
        year,
        salaryAmount,
        deduction: roundedDeduction,
        netAmount,
        status: "PENDING",
        notes:
          typeof body.notes === "string"
            ? body.notes.trim() || null
            : null,
      },
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
        payments: true,
      },
    });

    return NextResponse.json(
      {
        message: "Teacher salary record created successfully.",
        salary,
      },
      { status: 201 },
    );
  } catch (error) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    const errorCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error
        ? error.code
        : undefined;

    if (errorCode === "P2002") {
      return NextResponse.json(
        {
          error:
            "A salary record already exists for this teacher, academic year, and BS month/year.",
        },
        { status: 409 },
      );
    }

    console.error("Failed to create teacher salary:", error);

    return NextResponse.json(
      { error: "Failed to create the teacher salary record." },
      { status: 500 },
    );
  }
}
