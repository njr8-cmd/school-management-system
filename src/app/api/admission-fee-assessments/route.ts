import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireConfiguredSchool,
  schoolConfigurationErrorResponse,
} from "@/lib/school-api";

export async function GET(request: Request) {
  try {
    const school = await requireConfiguredSchool();
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");
    const academicYearId = searchParams.get("academicYearId");

    if (!studentId || !academicYearId) {
      return NextResponse.json(
        { error: "Student and academic year are required." },
        { status: 400 },
      );
    }

    const assessments = await prisma.admissionFeeAssessment.findMany({
      where: {
        studentId,
        academicYearId,
        student: { is: { schoolId: school.id } },
        academicYear: { is: { schoolId: school.id } },
      },
      include: {
        feeStructure: {
          select: { id: true, name: true, amount: true, frequency: true },
        },
        historicalCredit: {
          select: { id: true, amount: true, appliedAmount: true },
        },
        discount: { select: { id: true, percentage: true, notes: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ assessments });
  } catch (error) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;
    console.error("Failed to load admission-fee assessments:", error);
    return NextResponse.json(
      { error: "Failed to load admission-fee assessments." },
      { status: 500 },
    );
  }
}
