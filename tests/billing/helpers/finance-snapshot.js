import { createHash } from "node:crypto";

export async function captureFinanceSnapshot(prisma) {
  const [
    schools,
    academicYears,
    enrollments,
    fees,
    discounts,
    charges,
    bills,
    credits,
    expenses,
    salaries,
  ] = await Promise.all([
    prisma.school.findMany({ orderBy: { id: "asc" } }),
    prisma.academicYear.findMany({ orderBy: { id: "asc" } }),
    prisma.enrollment.findMany({
      orderBy: [{ studentId: "asc" }, { academicYearId: "asc" }],
      include: {
        student: { select: { schoolId: true } },
        academicYear: { select: { schoolId: true } },
        class: { select: { schoolId: true } },
      },
    }),
    prisma.feeStructure.findMany({
      orderBy: { id: "asc" },
      include: {
        academicYear: { select: { schoolId: true } },
        class: { select: { schoolId: true } },
      },
    }),
    prisma.studentDiscount.findMany({
      orderBy: { id: "asc" },
      include: {
        feeTypes: { orderBy: { id: "asc" } },
        student: { select: { schoolId: true } },
        academicYear: { select: { schoolId: true } },
      },
    }),
    prisma.studentCharge.findMany({
      orderBy: { id: "asc" },
      include: {
        student: { select: { schoolId: true } },
        academicYear: { select: { schoolId: true } },
      },
    }),
    prisma.bill.findMany({
      orderBy: { id: "asc" },
      include: {
        student: { select: { schoolId: true } },
        academicYear: { select: { schoolId: true } },
        items: { orderBy: { id: "asc" } },
        payments: { orderBy: { id: "asc" } },
        creditApplications: { orderBy: { id: "asc" } },
        studentChargeApplications: { orderBy: { id: "asc" } },
      },
    }),
    prisma.studentCredit.findMany({
      orderBy: { id: "asc" },
      include: {
        student: { select: { schoolId: true } },
        academicYear: { select: { schoolId: true } },
        applications: { orderBy: { id: "asc" } },
      },
    }),
    prisma.expense.findMany({
      orderBy: { id: "asc" },
      include: { academicYear: { select: { schoolId: true } } },
    }),
    prisma.teacherSalary.findMany({
      orderBy: { id: "asc" },
      include: {
        teacher: { select: { schoolId: true } },
        academicYear: { select: { schoolId: true } },
        payments: { orderBy: { id: "asc" } },
      },
    }),
  ]);

  const snapshot = {
    schools,
    academicYears,
    enrollments,
    fees,
    discounts,
    charges,
    bills,
    credits,
    expenses,
    salaries,
  };
  const counts = {
    schools: schools.length,
    academicYears: academicYears.length,
    enrollments: enrollments.length,
    fees: fees.length,
    discounts: discounts.length,
    charges: charges.length,
    bills: bills.length,
    billItems: bills.reduce((sum, bill) => sum + bill.items.length, 0),
    payments: bills.reduce((sum, bill) => sum + bill.payments.length, 0),
    chargeApplications: bills.reduce(
      (sum, bill) => sum + bill.studentChargeApplications.length,
      0,
    ),
    credits: credits.length,
    creditApplications: credits.reduce(
      (sum, credit) => sum + credit.applications.length,
      0,
    ),
    expenses: expenses.length,
    salaries: salaries.length,
    salaryPayments: salaries.reduce(
      (sum, salary) => sum + salary.payments.length,
      0,
    ),
  };
  const hash = createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex");

  return { hash, counts };
}
