
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireConfiguredSchool,
  schoolConfigurationErrorResponse,
} from "@/lib/school-api";
import {
  calculateStatementOutstandingCents,
  centsToMoney,
  moneyToCents,
  statementBillOutstandingCents,
} from "@/lib/finance/student-credit-rules";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const school = await requireConfiguredSchool();
    const { id } = await params;

    const { searchParams } = new URL(request.url);
    const academicYearId = searchParams.get("academicYearId");

    if (!id) {
      return NextResponse.json(
        { error: "Student ID is required." },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // STUDENT
    // ---------------------------------------------------------

    const student = await prisma.student.findFirst({
      where: {
        id,
        schoolId: school.id,
      },
      include: {
        enrollments: {
          where: {
            academicYear: { is: { schoolId: school.id } },
            class: { is: { schoolId: school.id } },
          },
          include: {
            academicYear: true,
            class: true,
          },
          orderBy: {
            academicYear: {
              startDate: "desc",
            },
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json(
        { error: "Student not found." },
        { status: 404 }
      );
    }

    // ---------------------------------------------------------
    // SELECT ACADEMIC YEAR
    // ---------------------------------------------------------

    const selectedEnrollment = academicYearId
      ? student.enrollments.find(
          (enrollment) =>
            enrollment.academicYearId === academicYearId
        )
      : student.enrollments[0];

    const selectedAcademicYearId =
      academicYearId || selectedEnrollment?.academicYearId;

    // Student has no academic enrollment yet
    if (!selectedAcademicYearId) {
      return NextResponse.json({
        student: {
          id: student.id,
          admissionNumber: student.admissionNumber,
          firstName: student.firstName,
          middleName: student.middleName,
          lastName: student.lastName,
          dateOfBirth: student.dateOfBirth,
          gender: student.gender,
          address: student.address,
          phone: student.phone,
          email: student.email,
          fatherName: student.fatherName,
          motherName: student.motherName,
          guardianName: student.guardianName,
          guardianPhone: student.guardianPhone,
        },

        academicYears: [],

        selectedAcademicYear: null,

        enrollment: null,

        financial: {
          summary: {
            totalBilled: 0,
            totalDiscounts: 0,
            totalPaid: 0,
            totalWaivers: 0,
            totalCreditsApplied: 0,
            remainingDue: 0,
            currentPeriodDue: 0,
            broughtForwardDue: 0,
            totalDue: 0,
          },
          bills: [],
          payments: [],
          discounts: [],
          charges: [],
          credits: [],
        },

        academic: {
          exams: [],
        },
      });
    }

    // ---------------------------------------------------------
    // ACADEMIC YEAR
    // ---------------------------------------------------------

    const academicYear = await prisma.academicYear.findFirst({
      where: {
        id: selectedAcademicYearId,
        schoolId: school.id,
      },
    });

    if (!academicYear) {
      return NextResponse.json(
        { error: "Academic year not found." },
        { status: 404 }
      );
    }

    // ---------------------------------------------------------
    // ENROLLMENT FOR SELECTED YEAR
    // ---------------------------------------------------------

    const enrollment = student.enrollments.find(
      (item) =>
        item.academicYearId === selectedAcademicYearId
    );

    // ---------------------------------------------------------
    // FINANCIAL RECORDS
    // ---------------------------------------------------------

    const bills = await prisma.bill.findMany({
      where: {
        studentId: student.id,
        academicYearId: selectedAcademicYearId,
      },
      include: {
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

    const priorBills = await prisma.bill.findMany({
      where: {
        studentId: student.id,
        academicYear: {
          is: {
            schoolId: school.id,
            startDate: { lt: academicYear.startDate },
          },
        },
      },
      select: {
        totalAmount: true,
        status: true,
        payments: {
          select: {
            amount: true,
            waiverAmount: true,
          },
        },
        creditApplications: {
          select: {
            amount: true,
            reversedAt: true,
          },
        },
      },
    });

    const discounts = await prisma.studentDiscount.findMany({
      where: {
        studentId: student.id,
        academicYearId: selectedAcademicYearId,
      },
      include: {
        feeTypes: true,
      },
      orderBy: {
        startDate: "desc",
      },
    });

    const charges = await prisma.studentCharge.findMany({
      where: {
        studentId: student.id,
        academicYearId: selectedAcademicYearId,
      },
      orderBy: {
        startDate: "desc",
      },
    });

    const credits = await prisma.studentCredit.findMany({
      where: {
        studentId: student.id,
        academicYearId: selectedAcademicYearId,
      },
      include: {
        applications: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // ---------------------------------------------------------
    // FINANCIAL CALCULATIONS
    // ---------------------------------------------------------

    let totalBilled = 0;
    let totalDiscounts = 0;
    let totalPaid = 0;
    let totalWaivers = 0;
    let totalCreditsApplied = 0;
    const statementBalances = calculateStatementOutstandingCents({
      previousAcademicYearBills: priorBills.map((bill) => ({
        totalAmount: bill.totalAmount,
        status: bill.status,
        payments: bill.payments,
        applications: bill.creditApplications,
      })),
      selectedAcademicYearBills: bills.map((bill) => ({
        totalAmount: bill.totalAmount,
        status: bill.status,
        payments: bill.payments,
        applications: bill.creditApplications,
        periodStartYear: bill.periodStartYear,
        periodStartMonth: bill.periodStartMonth,
        periodEndYear: bill.periodEndYear,
        periodEndMonth: bill.periodEndMonth,
      })),
    });
    const remainingDue = centsToMoney(
      statementBalances.selectedAcademicYearCents,
    );
    const currentPeriodDue = centsToMoney(
      statementBalances.currentPeriodCents,
    );
    const broughtForwardDue = centsToMoney(
      statementBalances.broughtForwardCents,
    );
    const totalDue = centsToMoney(statementBalances.totalDueCents);

    const formattedBills = bills.map((bill) => {
      const totalAmount = Number(bill.totalAmount);
      const discountAmount = Number(bill.discountAmount);
      const paidCents = bill.payments.reduce(
        (sum, payment) => sum + moneyToCents(payment.amount),
        0,
      );
      const paidAmount = centsToMoney(paidCents);

      const waiverCents = bill.payments.reduce(
        (sum, payment) =>
          sum + moneyToCents(payment.waiverAmount),
        0,
      );
      const waiverAmount = centsToMoney(waiverCents);

      const creditAppliedCents = bill.creditApplications
        .filter((application) => !application.reversedAt)
        .reduce(
          (sum, application) => sum + moneyToCents(application.amount),
          0,
        );
      const creditApplied = centsToMoney(creditAppliedCents);

      const remainingAmount = centsToMoney(
        statementBillOutstandingCents({
          totalAmount: bill.totalAmount,
          status: bill.status,
          payments: bill.payments,
          applications: bill.creditApplications,
        }),
      );

      if (bill.status !== "CANCELLED") {
        totalBilled += totalAmount;
        totalDiscounts += discountAmount;
        totalWaivers += waiverAmount;
        totalCreditsApplied += creditApplied;
      }
      totalPaid += paidAmount;

      return {
        id: bill.id,
        billNumber: bill.billNumber,
        billingDate: bill.billingDate,
        dueDate: bill.dueDate,
        periodStartYear: bill.periodStartYear,
        periodStartMonth: bill.periodStartMonth,
        periodEndYear: bill.periodEndYear,
        periodEndMonth: bill.periodEndMonth,

        totalAmount,
        discountAmount,
        paidAmount,
        waiverAmount,
        creditApplied,
        remainingAmount,

        status: bill.status,
        notes: bill.notes,

        items: bill.items.map((item) => ({
          id: item.id,
          feeType: item.feeType,
          description: item.description,
          quantity: Number(item.quantity),
          rate: Number(item.rate),
          amount: Number(item.amount),
          discountAmount: Number(
            item.discountAmount
          ),
          discountPercent: Number(
            item.discountPercent
          ),
          netAmount: Number(item.netAmount),
        })),
      };
    });

    const formattedPayments = bills
      .flatMap((bill) =>
        bill.payments.map((payment) => ({
          id: payment.id,
          billId: bill.id,
          billNumber: bill.billNumber,
          amount: Number(payment.amount),
          paymentDate: payment.paymentDate,
          method: payment.method,
          reference: payment.reference,
          notes: payment.notes,
          waiverAmount: Number(
            payment.waiverAmount
          ),
          waiverReason: payment.waiverReason,
        }))
      )
      .sort(
        (a, b) =>
          new Date(b.paymentDate).getTime() -
          new Date(a.paymentDate).getTime()
      );

    // ---------------------------------------------------------
    // ACADEMIC RECORDS
    // ---------------------------------------------------------
    //
    // IMPORTANT:
    // We do NOT query Mark separately using examSubject.
    //
    // Instead:
    //
    // Exam
    //   ↓
    // ExamSubject
    //   ↓
    // Mark
    //
    // This avoids the TypeScript/Prisma issue you were seeing.
    // ---------------------------------------------------------

    let formattedExams: Array<{
      id: string;
      name: string;
      term: { id: string; name: string; order: number };
      startDate: Date | null;
      endDate: Date | null;
      subjects: Array<{
        id: string;
        subject: { id: string; name: string; code: string | null };
        theoryFullMarks: number;
        practicalFullMarks: number;
        theoryMarks: number | null;
        practicalMarks: number | null;
        totalMarks: number | null;
      }>;
    }> = [];

    if (enrollment) {
      const exams = await prisma.exam.findMany({
        where: {
          classId: enrollment.classId,

          term: {
            academicYearId: selectedAcademicYearId,
          },
        },

        include: {
          term: true,

          subjects: {
            include: {
              subject: true,

              marks: {
                where: {
                  studentId: student.id,
                },
              },
            },
          },
        },

        orderBy: [
          {
            term: {
              order: "asc",
            },
          },
          {
            startDate: "asc",
          },
        ],
      });

      formattedExams = exams.map((exam) => {
        const subjects = exam.subjects.map(
          (examSubject) => {
            const mark = examSubject.marks[0];

            const theoryMarks = mark
              ? Number(mark.theoryMarks)
              : null;

            const practicalMarks = mark
              ? Number(mark.practicalMarks)
              : null;

            const totalMarks =
              theoryMarks !== null &&
              practicalMarks !== null
                ? theoryMarks + practicalMarks
                : null;

            return {
              id: examSubject.id,

              subject: {
                id: examSubject.subject.id,
                name: examSubject.subject.name,
                code: examSubject.subject.code,
              },

              theoryFullMarks: Number(
                examSubject.theoryFullMarks
              ),

              practicalFullMarks: Number(
                examSubject.practicalFullMarks
              ),

              theoryMarks,
              practicalMarks,
              totalMarks,
            };
          }
        );

        return {
          id: exam.id,
          name: exam.name,

          term: {
            id: exam.term.id,
            name: exam.term.name,
            order: exam.term.order,
          },

          startDate: exam.startDate,
          endDate: exam.endDate,

          subjects,
        };
      });
    }

    // ---------------------------------------------------------
    // RESPONSE
    // ---------------------------------------------------------

    return NextResponse.json({
      student: {
        id: student.id,
        admissionNumber: student.admissionNumber,
        firstName: student.firstName,
        middleName: student.middleName,
        lastName: student.lastName,
        dateOfBirth: student.dateOfBirth,
        gender: student.gender,
        address: student.address,
        phone: student.phone,
        email: student.email,
        fatherName: student.fatherName,
        motherName: student.motherName,
        guardianName: student.guardianName,
        guardianPhone: student.guardianPhone,
      },

      // Every year in which this student has an enrollment
      academicYears: student.enrollments.map(
        (item) => ({
          id: item.academicYear.id,
          name: item.academicYear.name,
          startDate: item.academicYear.startDate,
          endDate: item.academicYear.endDate,
          isActive: item.academicYear.isActive,

          class: {
            id: item.class.id,
            name: item.class.name,
          },

          rollNumber: item.rollNumber,
        })
      ),

      selectedAcademicYear: {
        id: academicYear.id,
        name: academicYear.name,
        startDate: academicYear.startDate,
        endDate: academicYear.endDate,
      },

      enrollment: enrollment
        ? {
            id: enrollment.id,

            class: {
              id: enrollment.class.id,
              name: enrollment.class.name,
            },

            rollNumber: enrollment.rollNumber,
          }
        : null,

      financial: {
        summary: {
          totalBilled,
          totalDiscounts,
          totalPaid,
          totalWaivers,
          totalCreditsApplied,
          remainingDue,
          currentPeriodDue,
          broughtForwardDue,
          totalDue,
        },

        bills: formattedBills,

        payments: formattedPayments,

        discounts: discounts.map(
          (discount) => ({
            id: discount.id,
            name: discount.name,
            percentage: Number(
              discount.percentage
            ),
            startDate: discount.startDate,
            endDate: discount.endDate,
            isActive: discount.isActive,
            notes: discount.notes,

            feeTypes: discount.feeTypes.map(
              (item) => item.feeType
            ),
          })
        ),

        charges: charges.map(
          (charge) => ({
            id: charge.id,
            description: charge.description,
            quantity: Number(charge.quantity),
            rate: Number(charge.rate),
            amount: Number(charge.amount),
            feeType: charge.feeType,
            frequency: charge.frequency,
            startDate: charge.startDate,
            endDate: charge.endDate,
            notes: charge.notes,
          })
        ),

        credits: credits.map(
          (credit) => ({
            id: credit.id,
            amount: Number(credit.amount),
            appliedAmount: Number(
              credit.appliedAmount
            ),
            remainingAmount: Math.max(
              0,
              Number(credit.amount) -
                Number(credit.appliedAmount)
            ),
            source: credit.source,
            notes: credit.notes,
            createdAt: credit.createdAt,
          })
        ),
      },

      academic: {
        exams: formattedExams,
      },
    });
  } catch (error) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) return configurationResponse;

    console.error(
      "Failed to fetch student profile:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to fetch student profile.",
      },
      { status: 500 }
    );
  }
}
