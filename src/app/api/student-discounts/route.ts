import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FeeType } from "@/generated/prisma/client";
import { isPrismaErrorCode } from "@/lib/prisma-error";
import { parseFiniteNumberInput } from "@/lib/finance/number-input";
import {
  requireConfiguredSchool,
  schoolConfigurationErrorResponse,
} from "@/lib/school-api";

const allowedDiscountFeeTypes: FeeType[] = [
  FeeType.TUITION,
  FeeType.ADMISSION,
  FeeType.COMPUTER_LAB,
  FeeType.EXAM,
];

function isAllowedDiscountFeeType(
  value: string
): value is FeeType {
  return allowedDiscountFeeTypes.includes(value as FeeType);
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/**
 * GET
 * /api/student-discounts?academicYearId=...
 * /api/student-discounts?studentId=...
 */
export async function GET(request: NextRequest) {
  try {
    const school = await requireConfiguredSchool();
    const { searchParams } = new URL(request.url);

    const academicYearId =
      searchParams.get("academicYearId");

    const studentId = searchParams.get("studentId");

    const isActiveParam = searchParams.get("isActive");

    const discounts = await prisma.studentDiscount.findMany({
      where: {
        student: { is: { schoolId: school.id } },
        academicYear: { is: { schoolId: school.id } },
        ...(academicYearId && { academicYearId }),
        ...(studentId && { studentId }),

        ...(isActiveParam !== null && {
          isActive: isActiveParam === "true",
        }),
      },

      include: {
        student: true,
        academicYear: true,
        feeTypes: true,
      },

      orderBy: [
        {
          startDate: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
    });

    return NextResponse.json(discounts);
  } catch (error) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    console.error("GET student discounts error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch student discounts.",
      },
      { status: 500 }
    );
  }
}

/**
 * POST
 */
export async function POST(request: NextRequest) {
  try {
    const school = await requireConfiguredSchool();
    const body = await request.json();

    const {
      studentId,
      academicYearId,
      name,
      percentage,
      feeTypes,
      startDate,
      endDate,
      notes,
    } = body;

    if (
      !studentId ||
      !academicYearId ||
      !name ||
      percentage === undefined ||
      !feeTypes ||
      !Array.isArray(feeTypes) ||
      feeTypes.length === 0 ||
      !startDate
    ) {
      return NextResponse.json(
        {
          error:
            "Student, academic year, name, percentage, at least one fee type and start date are required.",
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(feeTypes)) {
      return NextResponse.json(
        {
          error: "Fee types must be an array.",
        },
        { status: 400 }
      );
    }

    const uniqueFeeTypes = [
      ...new Set(feeTypes),
    ] as string[];

    for (const feeType of uniqueFeeTypes) {
      if (!isAllowedDiscountFeeType(feeType)) {
        return NextResponse.json(
          {
            error: `Discounts cannot be applied to ${feeType}. Discounts are only allowed on class-based fees.`,
          },
          { status: 400 }
        );
      }
    }

    const numericPercentage =
      parseFiniteNumberInput(percentage);

    if (
      numericPercentage === null ||
      numericPercentage <= 0 ||
      numericPercentage > 100
    ) {
      return NextResponse.json(
        {
          error:
            "Discount percentage must be greater than 0 and cannot exceed 100.",
        },
        { status: 400 }
      );
    }

    const parsedStartDate = parseDate(startDate);

    if (!parsedStartDate) {
      return NextResponse.json(
        {
          error: "Invalid start date.",
        },
        { status: 400 }
      );
    }

    let parsedEndDate: Date | null = null;

    if (endDate) {
      parsedEndDate = parseDate(endDate);

      if (!parsedEndDate) {
        return NextResponse.json(
          {
            error: "Invalid end date.",
          },
          { status: 400 }
        );
      }

      if (parsedEndDate < parsedStartDate) {
        return NextResponse.json(
          {
            error:
              "End date cannot be before start date.",
          },
          { status: 400 }
        );
      }
    }

    /*
     * Verify student enrollment.
     */
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        studentId,
        academicYearId,
        student: { is: { schoolId: school.id } },
        academicYear: { is: { schoolId: school.id } },
        class: { is: { schoolId: school.id } },
      },
      select: { classId: true },
    });

    if (!enrollment) {
      return NextResponse.json(
        {
          error:
            "This student is not enrolled in the selected academic year.",
        },
        { status: 400 }
      );
    }

    /*
     * Verify that the selected fee types actually exist
     * in the student's class fee structure.
     */
    const configuredFees =
      await prisma.feeStructure.findMany({
        where: {
          academicYearId,
          classId: enrollment.classId,
          feeType: {
            in: uniqueFeeTypes as FeeType[],
          },
          isActive: true,
        },
        select: {
          feeType: true,
        },
      });

    const configuredFeeTypes = new Set(
      configuredFees.map((fee) => fee.feeType)
    );

    const missingFeeTypes = uniqueFeeTypes.filter(
      (feeType) =>
        !configuredFeeTypes.has(
          feeType as FeeType
        )
    );

    if (missingFeeTypes.length > 0) {
      return NextResponse.json(
        {
          error:
            `The following selected fee types are not configured for this student's class: ${missingFeeTypes.join(", ")}.`,
        },
        { status: 400 }
      );
    }

    /*
     * Check for overlapping active discounts.
     *
     * We don't want two discounts applying to the
     * same fee type during overlapping periods.
     */
    const existingDiscounts =
      await prisma.studentDiscount.findMany({
        where: {
          studentId,
          academicYearId,
          isActive: true,
          feeTypes: {
            some: {
              feeType: {
                in: uniqueFeeTypes as FeeType[],
              },
            },
          },
        },
        include: {
          feeTypes: true,
        },
      });

    const overlappingDiscounts =
      existingDiscounts.filter((discount) => {
        const existingStart = discount.startDate;
        const existingEnd =
          discount.endDate ?? new Date("9999-12-31");

        const newEnd =
          parsedEndDate ?? new Date("9999-12-31");

        return (
          parsedStartDate <= existingEnd &&
          newEnd >= existingStart
        );
      });

    if (overlappingDiscounts.length > 0) {
      return NextResponse.json(
        {
          error:
            "An active discount already exists for one or more of these fee types during the selected period.",
        },
        { status: 409 }
      );
    }

    /*
     * Create discount and fee-type records together.
     */
    const discount =
      await prisma.studentDiscount.create({
        data: {
          studentId,
          academicYearId,
          name: name.trim(),
          percentage: numericPercentage,
          startDate: parsedStartDate,
          endDate: parsedEndDate,
          notes:
            typeof notes === "string"
              ? notes.trim() || null
              : null,

          feeTypes: {
            create: uniqueFeeTypes.map(
              (feeType) => ({
                feeType:
                  feeType as FeeType,
              })
            ),
          },
        },

        include: {
          student: true,
          academicYear: true,
          feeTypes: true,
        },
      });

    return NextResponse.json(
      discount,
      { status: 201 }
    );
  } catch (error) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    console.error(
      "POST student discount error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to create student discount.",
      },
      { status: 500 }
    );
  }
}

/**
 * PUT
 */
export async function PUT(request: NextRequest) {
  try {
    const school = await requireConfiguredSchool();
    const body = await request.json();

    const {
      id,
      name,
      percentage,
      feeTypes,
      startDate,
      endDate,
      isActive,
      notes,
    } = body;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Student discount ID is required.",
        },
        { status: 400 }
      );
    }

    const existingDiscount =
      await prisma.studentDiscount.findFirst({
        where: {
          id,
          student: { is: { schoolId: school.id } },
          academicYear: { is: { schoolId: school.id } },
        },

        include: {
          feeTypes: true,
        },
      });

    if (!existingDiscount) {
      return NextResponse.json(
        {
          error: "Student discount not found.",
        },
        { status: 404 }
      );
    }

    const data: {
      name?: string;
      percentage?: number;
      startDate?: Date;
      endDate?: Date | null;
      isActive?: boolean;
      notes?: string | null;
    } = {};

    if (name !== undefined) {
      if (
        typeof name !== "string" ||
        !name.trim()
      ) {
        return NextResponse.json(
          {
            error:
              "Discount name cannot be empty.",
          },
          { status: 400 }
        );
      }

      data.name = name.trim();
    }

    if (percentage !== undefined) {
      const numericPercentage =
        parseFiniteNumberInput(percentage);

      if (
        numericPercentage === null ||
        numericPercentage <= 0 ||
        numericPercentage > 100
      ) {
        return NextResponse.json(
          {
            error:
              "Discount percentage must be greater than 0 and cannot exceed 100.",
          },
          { status: 400 }
        );
      }

      data.percentage =
        numericPercentage;
    }

    if (startDate !== undefined) {
      const parsedStartDate =
        parseDate(startDate);

      if (!parsedStartDate) {
        return NextResponse.json(
          {
            error:
              "Invalid start date.",
          },
          { status: 400 }
        );
      }

      data.startDate =
        parsedStartDate;
    }

    if (endDate !== undefined) {
      if (!endDate) {
        data.endDate = null;
      } else {
        const parsedEndDate =
          parseDate(endDate);

        if (!parsedEndDate) {
          return NextResponse.json(
            {
              error:
                "Invalid end date.",
            },
            { status: 400 }
          );
        }

        const comparisonStart =
          data.startDate ??
          existingDiscount.startDate;

        if (
          parsedEndDate <
          comparisonStart
        ) {
          return NextResponse.json(
            {
              error:
                "End date cannot be before start date.",
            },
            { status: 400 }
          );
        }

        data.endDate =
          parsedEndDate;
      }
    }

    if (isActive !== undefined) {
      if (
        typeof isActive !==
        "boolean"
      ) {
        return NextResponse.json(
          {
            error:
              "isActive must be a boolean.",
          },
          { status: 400 }
        );
      }

      data.isActive =
        isActive;
    }

    if (notes !== undefined) {
      data.notes =
        typeof notes === "string"
          ? notes.trim() || null
          : null;
    }

    /*
     * Handle fee types if provided.
     */
    let newFeeTypes:
      | string[]
      | undefined;

    if (feeTypes !== undefined) {
      if (
        !Array.isArray(feeTypes) ||
        feeTypes.length === 0
      ) {
        return NextResponse.json(
          {
            error:
              "At least one fee type must be selected.",
          },
          { status: 400 }
        );
      }

      newFeeTypes = [
        ...new Set(feeTypes),
      ] as string[];

      for (const feeType of newFeeTypes) {
        if (
          !isAllowedDiscountFeeType(
            feeType
          )
        ) {
          return NextResponse.json(
            {
              error:
                `Discounts cannot be applied to ${feeType}.`,
            },
            { status: 400 }
          );
        }
      }

      /*
       * Verify the student's enrollment and
       * class fee structure.
       */
      const enrollment =
        await prisma.enrollment.findFirst({
          where: {
            studentId: existingDiscount.studentId,
            academicYearId: existingDiscount.academicYearId,
            student: { is: { schoolId: school.id } },
            academicYear: { is: { schoolId: school.id } },
            class: { is: { schoolId: school.id } },
          },
          select: {
            classId: true,
          },
        });

      if (!enrollment) {
        return NextResponse.json(
          {
            error:
              "Student enrollment was not found.",
          },
          { status: 400 }
        );
      }

      const configuredFees =
        await prisma.feeStructure.findMany({
          where: {
            academicYearId:
              existingDiscount.academicYearId,
            classId:
              enrollment.classId,
            feeType: {
              in: newFeeTypes as FeeType[],
            },
            isActive: true,
          },

          select: {
            feeType: true,
          },
        });

      const configuredFeeTypes =
        new Set(
          configuredFees.map(
            (fee) => fee.feeType
          )
        );

      const missingFeeTypes =
        newFeeTypes.filter(
          (feeType) =>
            !configuredFeeTypes.has(
              feeType as FeeType
            )
        );

      if (
        missingFeeTypes.length > 0
      ) {
        return NextResponse.json(
          {
            error:
              `The following fee types are not configured for this student's class: ${missingFeeTypes.join(", ")}.`,
          },
          { status: 400 }
        );
      }

      /*
       * Check overlapping discounts,
       * excluding the current discount.
       */
      const effectiveStart =
        data.startDate ??
        existingDiscount.startDate;

      const effectiveEnd =
        data.endDate !== undefined
          ? data.endDate
          : existingDiscount.endDate;

      const activeState =
        data.isActive !== undefined
          ? data.isActive
          : existingDiscount.isActive;

      if (activeState) {
        const otherDiscounts =
          await prisma.studentDiscount.findMany({
            where: {
              id: {
                not: id,
              },

              studentId:
                existingDiscount.studentId,

              academicYearId:
                existingDiscount.academicYearId,

              isActive: true,

              feeTypes: {
                some: {
                  feeType: {
                    in: newFeeTypes as FeeType[],
                  },
                },
              },
            },

            include: {
              feeTypes: true,
            },
          });

        const newEnd =
          effectiveEnd ??
          new Date("9999-12-31");

        const conflict =
          otherDiscounts.some(
            (discount) => {
              const existingEnd =
                discount.endDate ??
                new Date("9999-12-31");

              return (
                effectiveStart <=
                  existingEnd &&
                newEnd >=
                  discount.startDate
              );
            }
          );

        if (conflict) {
          return NextResponse.json(
            {
              error:
                "Another active discount already exists for one or more of these fee types during the selected period.",
            },
            { status: 409 }
          );
        }
      }
    }

    const discount =
      await prisma.$transaction(
        async (tx) => {
          await tx.studentDiscount.update({
              where: { id },

              data,
            });

          if (
            newFeeTypes !==
            undefined
          ) {
            await tx.studentDiscountFee.deleteMany(
              {
                where: {
                  discountId: id,
                },
              }
            );

            await tx.studentDiscountFee.createMany(
              {
                data: newFeeTypes.map(
                  (feeType) => ({
                    discountId: id,
                    feeType:
                      feeType as FeeType,
                  })
                ),
              }
            );
          }

          return tx.studentDiscount.findUnique(
            {
              where: { id },

              include: {
                student: true,
                academicYear: true,
                feeTypes: true,
              },
            }
          );
        }
      );

    return NextResponse.json(
      discount
    );
  } catch (error: unknown) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    console.error(
      "PUT student discount error:",
      error
    );

    if (
      isPrismaErrorCode(error, "P2025")
    ) {
      return NextResponse.json(
        {
          error:
            "Student discount not found.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error:
          "Failed to update student discount.",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE
 */
export async function DELETE(
  request: NextRequest
) {
  try {
    const school = await requireConfiguredSchool();
    const { searchParams } =
      new URL(request.url);

    const id =
      searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Student discount ID is required.",
        },
        { status: 400 }
      );
    }

    const existing = await prisma.studentDiscount.findFirst({
      where: {
        id,
        student: { is: { schoolId: school.id } },
        academicYear: { is: { schoolId: school.id } },
      },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Student discount not found." },
        { status: 404 },
      );
    }

    await prisma.studentDiscount.delete({
      where: { id },
    });

    return NextResponse.json({
      message:
        "Student discount deleted successfully.",
    });
  } catch (error: unknown) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    console.error(
      "DELETE student discount error:",
      error
    );

    if (
      isPrismaErrorCode(error, "P2025")
    ) {
      return NextResponse.json(
        {
          error:
            "Student discount not found.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error:
          "Failed to delete student discount.",
      },
      { status: 500 }
    );
  }
}