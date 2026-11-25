import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FeeType, FeeFrequency } from "@/generated/prisma/client";
import { isPrismaErrorCode } from "@/lib/prisma-error";
import { parseFiniteNumberInput } from "@/lib/finance/number-input";
import {
  requireConfiguredSchool,
  schoolConfigurationErrorResponse,
} from "@/lib/school-api";

export async function GET(request: NextRequest) {
  try {
    const school = await requireConfiguredSchool();
    const { searchParams } = new URL(request.url);

    const academicYearId = searchParams.get("academicYearId");
    const classId = searchParams.get("classId");

    const fees = await prisma.feeStructure.findMany({
      where: {
        academicYear: { is: { schoolId: school.id } },
        class: { is: { schoolId: school.id } },
        ...(academicYearId && { academicYearId }),
        ...(classId && { classId }),
      },
      include: {
        class: true,
        academicYear: true,
      },
      orderBy: [
        { classId: "asc" },
        { feeType: "asc" },
        { name: "asc" },
      ],
    });

    return NextResponse.json(fees);
  } catch (error) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    console.error("GET fees error:", error);

    return NextResponse.json(
      { error: "Failed to fetch fee structures" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const school = await requireConfiguredSchool();
    const body = await request.json();

    const {
      academicYearId,
      classId,
      feeType,
      name,
      amount,
      frequency,
    } = body;

    if (
      !academicYearId ||
      !classId ||
      !feeType ||
      !name ||
      amount === undefined ||
      !frequency
    ) {
      return NextResponse.json(
        { error: "All required fields must be provided" },
        { status: 400 }
      );
    }

    if (!Object.values(FeeType).includes(feeType)) {
      return NextResponse.json(
        { error: "Invalid fee type" },
        { status: 400 }
      );
    }

    if (!Object.values(FeeFrequency).includes(frequency)) {
      return NextResponse.json(
        { error: "Invalid fee frequency" },
        { status: 400 }
      );
    }

    const numericAmount = parseFiniteNumberInput(amount);

    if (numericAmount === null || numericAmount < 0) {
      return NextResponse.json(
        { error: "Amount must be a valid non-negative number" },
        { status: 400 }
      );
    }

    const [academicYear, schoolClass] = await Promise.all([
      prisma.academicYear.findFirst({
        where: { id: academicYearId, schoolId: school.id },
        select: { id: true },
      }),
      prisma.class.findFirst({
        where: { id: classId, schoolId: school.id },
        select: { id: true },
      }),
    ]);
    if (!academicYear || !schoolClass) {
      return NextResponse.json(
        { error: "Class and academic year must belong to the configured school." },
        { status: 400 },
      );
    }

    const fee = await prisma.feeStructure.create({
      data: {
        academicYearId,
        classId,
        feeType,
        name: name.trim(),
        amount: numericAmount,
        frequency,
      },
      include: {
        class: true,
        academicYear: true,
      },
    });

    return NextResponse.json(fee, { status: 201 });
  } catch (error: unknown) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    console.error("POST fees error:", error);

    if (isPrismaErrorCode(error, "P2002")) {
      return NextResponse.json(
        {
          error:
            "A fee with this type and name already exists for this class and academic year",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create fee structure" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const school = await requireConfiguredSchool();
    const body = await request.json();

    const {
      id,
      name,
      amount,
      frequency,
      feeType,
      isActive,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Fee ID is required" },
        { status: 400 }
      );
    }

    const data: {
      name?: string;
      amount?: number;
      frequency?: FeeFrequency;
      feeType?: FeeType;
      isActive?: boolean;
    } = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json(
          { error: "Name must be a non-empty string" },
          { status: 400 }
        );
      }

      data.name = name.trim();
    }

    if (amount !== undefined) {
      const numericAmount = parseFiniteNumberInput(amount);

      if (numericAmount === null || numericAmount < 0) {
        return NextResponse.json(
          { error: "Amount must be a valid non-negative number" },
          { status: 400 }
        );
      }

      data.amount = numericAmount;
    }

    if (frequency !== undefined) {
      if (!Object.values(FeeFrequency).includes(frequency)) {
        return NextResponse.json(
          { error: "Invalid fee frequency" },
          { status: 400 }
        );
      }

      data.frequency = frequency;
    }

    if (feeType !== undefined) {
      if (!Object.values(FeeType).includes(feeType)) {
        return NextResponse.json(
          { error: "Invalid fee type" },
          { status: 400 }
        );
      }

      data.feeType = feeType;
    }

    if (isActive !== undefined) {
      if (typeof isActive !== "boolean") {
        return NextResponse.json(
          { error: "isActive must be a boolean" },
          { status: 400 }
        );
      }

      data.isActive = isActive;
    }

    const existingFee = await prisma.feeStructure.findFirst({
      where: {
        id,
        academicYear: { is: { schoolId: school.id } },
        class: { is: { schoolId: school.id } },
      },
      select: { id: true },
    });
    if (!existingFee) {
      return NextResponse.json(
        { error: "Fee structure not found." },
        { status: 404 },
      );
    }

    const fee = await prisma.feeStructure.update({
      where: { id },
      data,
      include: {
        class: true,
        academicYear: true,
      },
    });

    return NextResponse.json(fee);
  } catch (error: unknown) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    console.error("PUT fees error:", error);

    if (isPrismaErrorCode(error, "P2025")) {
      return NextResponse.json(
        { error: "Fee structure not found" },
        { status: 404 }
      );
    }

    if (isPrismaErrorCode(error, "P2002")) {
      return NextResponse.json(
        {
          error:
            "Another fee with this type and name already exists for this class and academic year",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update fee structure" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const school = await requireConfiguredSchool();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Fee ID is required" },
        { status: 400 }
      );
    }

    const existingFee = await prisma.feeStructure.findFirst({
      where: {
        id,
        academicYear: { is: { schoolId: school.id } },
        class: { is: { schoolId: school.id } },
      },
      select: { id: true },
    });
    if (!existingFee) {
      return NextResponse.json(
        { error: "Fee structure not found." },
        { status: 404 },
      );
    }

    await prisma.feeStructure.delete({
      where: { id },
    });

    return NextResponse.json({
      message: "Fee structure deleted successfully",
    });
  } catch (error: unknown) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    console.error("DELETE fees error:", error);

    if (isPrismaErrorCode(error, "P2025")) {
      return NextResponse.json(
        { error: "Fee structure not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to delete fee structure" },
      { status: 500 }
    );
  }
}