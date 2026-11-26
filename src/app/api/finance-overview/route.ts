import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireConfiguredSchool,
  schoolConfigurationErrorResponse,
} from "@/lib/school-api";
import {
  BS_MONTHS,
  bsMonthIndex,
  bsToDate,
  dateToBS,
} from "@/lib/nepali-date";

type Period = "daily" | "weekly" | "monthly" | "termly" | "yearly";

function parseBSDate(value: string | null): Date | null {
  if (!value) return null;
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

function dateFromMonthIndex(index: number) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return bsToDate(year, month, 1);
}

function paymentWhere(from: Date, to: Date, schoolId: string) {
  return {
    paymentDate: { gte: from, lt: to },
    bill: {
      is: {
        student: { is: { schoolId } },
        academicYear: { is: { schoolId } },
      },
    },
  };
}

function salaryPaymentWhere(from: Date, to: Date, schoolId: string) {
  return {
    paymentDate: { gte: from, lt: to },
    teacherSalary: {
      is: {
        teacher: { is: { schoolId } },
        academicYear: { is: { schoolId } },
      },
    },
  };
}

function expenseWhere(from: Date, to: Date, schoolId: string) {
  return {
    expenseDate: { gte: from, lt: to },
    academicYear: { is: { schoolId } },
    voidedAt: null,
  };
}

function unreconciledSalaryWhere(schoolId: string) {
  return {
    status: { in: ["PAID", "PARTIAL"] as ("PAID" | "PARTIAL")[] },
    payments: { none: {} },
    teacher: { is: { schoolId } },
    academicYear: { is: { schoolId } },
  };
}

export async function GET(request: Request) {
  try {
    const school = await requireConfiguredSchool();
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") as Period | null;
    const date = parseBSDate(searchParams.get("date"));
    let from: Date;
    let to: Date;

    if (!period || !["daily", "weekly", "monthly", "termly", "yearly"].includes(period)) {
      return NextResponse.json({ error: "Select a valid reporting period." }, { status: 400 });
    }

    if (period === "yearly" || period === "termly") {
      const academicYearId = searchParams.get("academicYearId");
      if (!academicYearId) {
        return NextResponse.json({ error: "Academic year is required." }, { status: 400 });
      }
      const academicYear = await prisma.academicYear.findUnique({
        where: { id: academicYearId, schoolId: school.id },
        include: {
          terms: { orderBy: { order: "asc" } },
        },
      });
      if (!academicYear) {
        return NextResponse.json({ error: "Academic year not found." }, { status: 404 });
      }

      if (period === "yearly") {
        from = academicYear.startDate;
        to = new Date(academicYear.endDate.getTime() + 24 * 60 * 60 * 1000);
      } else {
        const termId = searchParams.get("termId");
        const termIndex = academicYear.terms.findIndex((term) => term.id === termId);
        if (termIndex < 0) {
          return NextResponse.json({ error: "Select a term for this academic year." }, { status: 400 });
        }
        if (academicYear.terms.length === 0) {
          return NextResponse.json({ error: "No terms are configured for this academic year." }, { status: 400 });
        }

        const yearStart = dateToBS(academicYear.startDate);
        const yearEnd = dateToBS(academicYear.endDate);
        const firstMonth = bsMonthIndex(yearStart.year, yearStart.month);
        const lastMonth = bsMonthIndex(yearEnd.year, yearEnd.month);
        const monthCount = lastMonth - firstMonth + 1;
        const termCount = academicYear.terms.length;
        const baseMonths = Math.floor(monthCount / termCount);
        const extraMonths = monthCount % termCount;
        let offset = 0;
        for (let index = 0; index < termIndex; index += 1) {
          offset += baseMonths + (index < extraMonths ? 1 : 0);
        }
        const selectedMonthCount = baseMonths + (termIndex < extraMonths ? 1 : 0);
        from = dateFromMonthIndex(firstMonth + offset);
        to = dateFromMonthIndex(firstMonth + offset + selectedMonthCount);
      }
    } else {
      if (!date) {
        return NextResponse.json({ error: "A valid BS date is required." }, { status: 400 });
      }
      const selectedBS = dateToBS(date);
      if (period === "monthly") {
        from = bsToDate(selectedBS.year, selectedBS.month, 1);
        const nextMonthIndex = bsMonthIndex(selectedBS.year, selectedBS.month) + 1;
        to = dateFromMonthIndex(nextMonthIndex);
      } else if (period === "daily") {
        from = date;
        to = new Date(date.getTime() + 24 * 60 * 60 * 1000);
      } else {
        const nepalLocalDate = new Date(
          date.getTime() + 5 * 60 * 60 * 1000 + 45 * 60 * 1000,
        );
        const dayOfWeek = nepalLocalDate.getUTCDay();
        from = new Date(date.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
        to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
      }
    }

    const [
      feeAggregate,
      waiverAggregate,
      salaryAggregate,
      unreconciledSalaryCount,
      expenseAggregate,
      expenseGroups,
      chartFees,
      chartWaivers,
      chartSalaries,
      chartExpenses,
    ] =
      await Promise.all([
        prisma.payment.aggregate({
          where: paymentWhere(from, to, school.id),
          _sum: { amount: true },
          _count: { _all: true },
        }),
        prisma.payment.aggregate({
          where: {
            ...paymentWhere(from, to, school.id),
            waiverAmount: { gt: 0 },
          },
          _sum: { waiverAmount: true },
          _count: { _all: true },
        }),
        prisma.teacherSalaryPayment.aggregate({
          where: salaryPaymentWhere(from, to, school.id),
          _sum: { amount: true },
          _count: { _all: true },
        }),
        prisma.teacherSalary.count({
          where: unreconciledSalaryWhere(school.id),
        }),
        prisma.expense.aggregate({
          where: expenseWhere(from, to, school.id),
          _sum: { amount: true },
          _count: { _all: true },
        }),
        prisma.expense.groupBy({
          by: ["category"],
          where: expenseWhere(from, to, school.id),
          _sum: { amount: true },
          _count: { _all: true },
          orderBy: { _sum: { amount: "desc" } },
        }),
        prisma.payment.findMany({
          where: paymentWhere(from, to, school.id),
          select: { amount: true, paymentDate: true },
        }),
        prisma.payment.findMany({
          where: {
            ...paymentWhere(from, to, school.id),
            waiverAmount: { gt: 0 },
          },
          select: { waiverAmount: true, paymentDate: true },
        }),
        prisma.teacherSalaryPayment.findMany({
          where: salaryPaymentWhere(from, to, school.id),
          select: { amount: true, paymentDate: true },
        }),
        prisma.expense.findMany({
          where: expenseWhere(from, to, school.id),
          select: { amount: true, expenseDate: true },
        }),
      ]);

    const dailyBuckets = period === "daily" || period === "weekly" || period === "monthly";
    const bucketIntervals: { from: Date; to: Date; label: string }[] = [];
    if (dailyBuckets) {
      for (let cursor = from; cursor < to; cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)) {
        const bucketEnd = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
        const bs = dateToBS(cursor);
        bucketIntervals.push({
          from: cursor,
          to: bucketEnd,
          label: period === "daily"
            ? `${bs.day} ${BS_MONTHS[bs.month - 1]}`
            : `${bs.day}`,
        });
      }
    } else {
      let cursor = bsMonthIndex(dateToBS(from).year, dateToBS(from).month);
      while (dateFromMonthIndex(cursor) < to) {
        const monthStart = dateFromMonthIndex(cursor);
        const monthEnd = dateFromMonthIndex(cursor + 1);
        const bs = dateToBS(monthStart);
        bucketIntervals.push({
          from: monthStart < from ? from : monthStart,
          to: monthEnd > to ? to : monthEnd,
          label: `${BS_MONTHS[bs.month - 1]} ${bs.year}`,
        });
        cursor += 1;
      }
    }

    const chartData = bucketIntervals.map((bucket) => ({
      label: bucket.label,
      fees: chartFees.reduce(
        (sum, item) =>
          item.paymentDate >= bucket.from && item.paymentDate < bucket.to
            ? sum + Number(item.amount)
            : sum,
        0,
      ),
      waivers: chartWaivers.reduce(
        (sum, item) =>
          item.paymentDate >= bucket.from && item.paymentDate < bucket.to
            ? sum + Number(item.waiverAmount)
            : sum,
        0,
      ),
      salaries:
        chartSalaries.reduce(
          (sum, item) =>
            item.paymentDate >= bucket.from && item.paymentDate < bucket.to
              ? sum + Number(item.amount)
              : sum,
          0,
        ),
      expenses: chartExpenses.reduce(
        (sum, item) =>
          item.expenseDate >= bucket.from && item.expenseDate < bucket.to
            ? sum + Number(item.amount)
            : sum,
        0,
      ),
    }));

    const [
      recentFees,
      recentWaivers,
      recentSalaries,
      recentExpenses,
    ] =
      await Promise.all([
        prisma.payment.findMany({
          where: paymentWhere(from, to, school.id),
          include: {
            bill: {
              select: {
                billNumber: true,
                student: { select: { firstName: true, middleName: true, lastName: true } },
              },
            },
          },
          orderBy: { paymentDate: "desc" },
          take: 10,
        }),
        prisma.payment.findMany({
          where: {
            ...paymentWhere(from, to, school.id),
            waiverAmount: { gt: 0 },
          },
          include: {
            bill: {
              select: {
                billNumber: true,
                student: { select: { firstName: true, middleName: true, lastName: true } },
              },
            },
          },
          orderBy: { paymentDate: "desc" },
          take: 10,
        }),
        prisma.teacherSalaryPayment.findMany({
          where: salaryPaymentWhere(from, to, school.id),
          include: {
            teacherSalary: {
              select: {
                month: true,
                year: true,
                teacher: { select: { firstName: true, middleName: true, lastName: true } },
              },
            },
          },
          orderBy: { paymentDate: "desc" },
          take: 10,
        }),
        prisma.expense.findMany({
          where: expenseWhere(from, to, school.id),
          orderBy: { expenseDate: "desc" },
          take: 10,
        }),
      ]);

    const transactions = [
      ...recentFees.map((payment) => ({
        id: payment.id,
        date: payment.paymentDate,
        type: "fee" as const,
        description: `Student fee — ${[
          payment.bill.student.firstName,
          payment.bill.student.middleName,
          payment.bill.student.lastName,
        ].filter(Boolean).join(" ")} (${payment.bill.billNumber})`,
        amount: Number(payment.amount),
      })),
      ...recentWaivers.map((payment) => ({
          id: `${payment.id}-waiver`,
          date: payment.paymentDate,
          type: "waiver" as const,
          description: `Fee waiver — ${[
            payment.bill.student.firstName,
            payment.bill.student.middleName,
            payment.bill.student.lastName,
          ].filter(Boolean).join(" ")} (${payment.bill.billNumber})${payment.waiverReason ? `: ${payment.waiverReason}` : ""}`,
          amount: Number(payment.waiverAmount),
        })),
      ...recentSalaries.map((payment) => ({
        id: payment.id,
        date: payment.paymentDate,
        type: "salary" as const,
        description: `Teacher salary — ${[
          payment.teacherSalary.teacher.firstName,
          payment.teacherSalary.teacher.middleName,
          payment.teacherSalary.teacher.lastName,
        ].filter(Boolean).join(" ")}`,
        amount: -Number(payment.amount),
      })),
      ...recentExpenses.map((expense) => ({
        id: expense.id,
        date: expense.expenseDate,
        type: "expense" as const,
        description: expense.description,
        amount: -Number(expense.amount),
      })),
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);

    const feeIncome = Number(feeAggregate._sum.amount ?? 0);
    const salaryPaid = Number(salaryAggregate._sum.amount ?? 0);
    const otherExpenses = Number(expenseAggregate._sum.amount ?? 0);

    return NextResponse.json({
      period,
      from,
      to: new Date(to.getTime() - 1),
      feeIncome,
      waivers: Number(waiverAggregate._sum.waiverAmount ?? 0),
      salaryPaid,
      otherExpenses,
      totalExpenses: salaryPaid + otherExpenses,
      netCashflow: feeIncome - salaryPaid - otherExpenses,
      counts: {
        feePayments: feeAggregate._count._all,
        waivers: waiverAggregate._count._all,
        salaryPayments: salaryAggregate._count._all,
        unreconciledSalaries: unreconciledSalaryCount,
        expenses: expenseAggregate._count._all,
      },
      expenseCategories: expenseGroups.map((group) => ({
        category: group.category,
        amount: Number(group._sum.amount ?? 0),
        count: group._count._all,
      })),
      chartData,
      transactions,
    });
  } catch (error) {
    const configurationResponse =
      schoolConfigurationErrorResponse(error);
    if (configurationResponse) {
      return configurationResponse;
    }

    console.error("Failed to load finance overview:", error);
    return NextResponse.json(
      { error: "Failed to load finance overview." },
      { status: 500 },
    );
  }
}
