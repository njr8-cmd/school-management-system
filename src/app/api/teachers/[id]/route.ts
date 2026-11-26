import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireConfiguredSchool,
  schoolConfigurationErrorResponse,
} from "@/lib/school-api";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const school = await requireConfiguredSchool();
    const { id } = await context.params;

    const teacher = await prisma.teacher.findFirst({
      where: { id, schoolId: school.id },
      include: {
        salaryRecords: {
          where: {
            academicYear: { is: { schoolId: school.id } },
          },
          include: {
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
          ],
        },
        assignments: {
          where: {
            class: { is: { schoolId: school.id } },
            academicYear: { is: { schoolId: school.id } },
          },
          include: {
            class: true,
            subject: true,
            academicYear: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!teacher) {
      return NextResponse.json(
        { error: "Teacher not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(teacher);
  } catch (error) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    console.error("Failed to fetch teacher profile:", error);
    return NextResponse.json(
      { error: "Failed to fetch teacher profile." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext
) {
  try {
    const school = await requireConfiguredSchool();
    const { id } = await context.params;
    const body = await request.json();

    const existingTeacher = await prisma.teacher.findFirst({
      where: {
        id,
        schoolId: school.id,
      },
    });

    if (!existingTeacher) {
      return NextResponse.json(
        { error: "Teacher not found." },
        { status: 404 }
      );
    }

    const firstName = body.firstName?.trim();

    if (!firstName) {
      return NextResponse.json(
        { error: "First name is required." },
        { status: 400 }
      );
    }

    const teacher = await prisma.teacher.update({
      where: {
        id,
      },
      data: {
        firstName,
        middleName: body.middleName?.trim() || null,
        lastName: body.lastName?.trim() || null,
        dateOfBirth: body.dateOfBirth
          ? new Date(body.dateOfBirth)
          : null,
        gender: body.gender?.trim() || null,
        address: body.address?.trim() || null,
        phone: body.phone?.trim() || null,
        email: body.email?.trim() || null,
        position: body.position?.trim() || null,
        joiningDate: body.joiningDate
          ? new Date(body.joiningDate)
          : null,
        basicSalary:
          body.basicSalary !== undefined &&
          body.basicSalary !== ""
            ? Number(body.basicSalary)
            : null,
      },
    });

    return NextResponse.json(teacher);
  } catch (error) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    console.error("Failed to update teacher:", error);

    return NextResponse.json(
      { error: "Failed to update teacher." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext
) {
  try {
    const school = await requireConfiguredSchool();
    const { id } = await context.params;

    const teacher = await prisma.teacher.findFirst({
      where: {
        id,
        schoolId: school.id,
      },
      include: {
        assignments: true,
      },
    });

    if (!teacher) {
      return NextResponse.json(
        { error: "Teacher not found." },
        { status: 404 }
      );
    }

    if (teacher.assignments.length > 0) {
      return NextResponse.json(
        {
          error:
            "This teacher cannot be deleted because they are already assigned to a class or subject.",
        },
        { status: 409 }
      );
    }

    await prisma.teacher.delete({
      where: {
        id,
      },
    });

    return NextResponse.json({
      message: "Teacher deleted successfully.",
    });
  } catch (error) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    console.error("Failed to delete teacher:", error);

    return NextResponse.json(
      { error: "Failed to delete teacher." },
      { status: 500 }
    );
  }
}