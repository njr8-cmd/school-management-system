import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { captureFinanceSnapshot } from "./billing/helpers/finance-snapshot.js";
import {
  connectToTestDatabase,
  getVerifiedTestTarget,
} from "./billing/helpers/database.js";

const enabled =
  process.env.PHASE6_FINANCE_QA_CONFIRMATION ===
  "PHASE6_FINANCE_QA_ONLY";
const primarySchoolId = "cmwtatkm10000row42cgw4b64";
const foreignSchoolId = "cmwtawdr10000scw4moape0b6";
const approvedHost =
  "ep-green-glade-ayptuugl-pooler.c-5.us-east-2.aws.neon.tech";
const approvedDatabase = "neondb";
const runId = randomUUID();

function request(path, method = "GET", body) {
  return new Request(`http://phase6-qa.local${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}

function rounded(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

test(
  "Phase 6 finance integration QA on isolated database",
  { skip: enabled ? false : "requires explicit isolated Phase 6 QA approval" },
  async (t) => {
    const target = getVerifiedTestTarget();
    assert.equal(target.host, approvedHost);
    assert.equal(target.database, approvedDatabase);

    const previousEnvironment = {
      databaseUrl: process.env.DATABASE_URL,
      schoolId: process.env.SCHOOL_ID,
      nodeEnv: process.env.NODE_ENV,
    };
    process.env.DATABASE_URL = target.connectionString;
    process.env.SCHOOL_ID = primarySchoolId;
    process.env.NODE_ENV = "test";

    const prisma = await connectToTestDatabase();
    const temporaryExpenseIds = new Set();
    const createdExpenseIds = new Set();
    const temporarySalaryIds = new Set();
    const createdSalaryPaymentIds = new Set();
    let appPrisma;
    let baselineSnapshot;
    let finalSnapshot;
    let cleanupError;

    try {
      const databaseInfo = await prisma.$queryRaw`
        SELECT current_database() AS database
      `;
      assert.equal(databaseInfo[0].database, target.database);

      const [schoolCount, primarySchool, primaryYear, foreignYear, teacher] =
        await Promise.all([
          prisma.school.count(),
          prisma.school.findUniqueOrThrow({
            where: { id: primarySchoolId },
            select: { id: true, name: true },
          }),
          prisma.academicYear.findFirstOrThrow({
            where: { schoolId: primarySchoolId, isActive: true },
            orderBy: { startDate: "desc" },
          }),
          prisma.academicYear.findFirst({
            where: { schoolId: foreignSchoolId },
            select: { id: true },
          }),
          prisma.teacher.findFirstOrThrow({
            where: { schoolId: primarySchoolId },
            orderBy: { id: "asc" },
            select: { id: true, schoolId: true },
          }),
        ]);
      assert.equal(schoolCount, 2);
      assert.equal(primarySchool.id, primarySchoolId);
      baselineSnapshot = await captureFinanceSnapshot(prisma);

      if (process.env.PHASE6_VERIFY_CLEANUP_ONLY === "1") {
        const [markedExpenses, markedSalaries, sessionUser] = await Promise.all([
          prisma.expense.findMany({
            where: {
              academicYear: { is: { schoolId: primarySchoolId } },
              description: { startsWith: "PHASE6-" },
            },
            select: { id: true },
          }),
          prisma.teacherSalary.findMany({
            where: {
              teacher: { is: { schoolId: primarySchoolId } },
              academicYear: { is: { schoolId: primarySchoolId } },
              notes: { startsWith: "PHASE6-" },
            },
            select: { id: true, payments: { select: { id: true } } },
          }),
          process.env.PHASE6_SESSION_USER_ID
            ? prisma.user.findUnique({
                where: { id: process.env.PHASE6_SESSION_USER_ID },
                select: { id: true, role: true },
              })
            : Promise.resolve(null),
        ]);
        assert.deepEqual(markedExpenses, []);
        assert.deepEqual(markedSalaries, []);
        console.log(
          "PHASE6_MARKER_CLEANUP " +
            JSON.stringify({
              remainingExpenseIds: [],
              remainingSalaryIds: [],
              remainingSalaryPaymentIds: [],
              browserSessionUserExists: Boolean(sessionUser),
              browserSessionRole: sessionUser?.role ?? null,
            }),
        );
        return;
      }

      const [
        appDatabase,
        expensesApi,
        financeOverviewApi,
        { recordTeacherSalaryPayment, SalaryPaymentRequestError },
        { parseFiniteNumberInput },
        { dateToBS },
      ] = await Promise.all([
        import("../src/lib/prisma.ts"),
        import("../src/app/api/expenses/route.ts"),
        import("../src/app/api/finance-overview/route.ts"),
        import("../src/lib/teacher-salary-payment.ts"),
        import("../src/lib/finance/number-input.ts"),
        import("../src/lib/nepali-date.ts"),
      ]);
      appPrisma = appDatabase.prisma;
      const appDatabaseInfo = await appPrisma.$queryRaw`
        SELECT current_database() AS database
      `;
      assert.equal(appDatabaseInfo[0].database, target.database);

      const primaryYears = await prisma.academicYear.findMany({
        where: { schoolId: primarySchoolId },
        select: { id: true },
      });
      const primaryYearIds = new Set(primaryYears.map(({ id }) => id));

      await t.test("FIN-NUM-01 parser rejects nonnumeric JSON input shapes", () => {
        for (const value of [
          true,
          false,
          [],
          [5],
          {},
          null,
          "",
          Number.NaN,
          Number.POSITIVE_INFINITY,
        ]) {
          assert.equal(parseFiniteNumberInput(value), null);
        }
        assert.equal(parseFiniteNumberInput(12.5), 12.5);
        assert.equal(parseFiniteNumberInput("12.5"), 12.5);
      });

      await t.test("EXP-API-01 lists only configured-school expenses", async () => {
        const response = await expensesApi.GET(request("/api/expenses"));
        assert.equal(response.status, 200);
        const expenses = await response.json();
        assert.ok(Array.isArray(expenses));
        assert.ok(
          expenses.every(
            (expense) =>
              primaryYearIds.has(expense.academicYearId) &&
              expense.academicYear?.id === expense.academicYearId,
          ),
        );
      });

      await t.test("EXP-CRUD-01 creates, updates, filters, and deletes a marked expense", async () => {
        const marker = `PHASE6-${runId}-EXP`;
        const body = {
          academicYearId: primaryYear.id,
          category: "OTHER",
          description: `${marker} initial`,
          amount: 42.75,
          expenseDate: "2083-08-07",
          paidTo: "Phase 6 QA only",
          paymentMethod: "BANK",
          reference: marker,
          notes: "Temporary Phase 6 expense",
        };
        let expenseId;
        try {
          const createdResponse = await expensesApi.POST(
            request("/api/expenses", "POST", body),
          );
          const created = await createdResponse.json();
          assert.equal(createdResponse.status, 201, JSON.stringify(created));
          expenseId = created.id;
          assert.ok(expenseId);
          temporaryExpenseIds.add(expenseId);
          createdExpenseIds.add(expenseId);

          const persisted = await prisma.expense.findUniqueOrThrow({
            where: { id: expenseId },
          });
          assert.equal(Number(persisted.amount), 42.75);
          assert.equal(persisted.description, body.description);
          assert.equal(persisted.reference, marker);

          const updatedResponse = await expensesApi.PATCH(
            request(
              `/api/expenses?id=${encodeURIComponent(expenseId)}`,
              "PATCH",
              { ...body, description: `${marker} updated`, amount: 44.25 },
            ),
          );
          const updated = await updatedResponse.json();
          assert.equal(updatedResponse.status, 200, JSON.stringify(updated));

          const updatedRow = await prisma.expense.findUniqueOrThrow({
            where: { id: expenseId },
          });
          assert.equal(Number(updatedRow.amount), 44.25);
          assert.equal(updatedRow.description, `${marker} updated`);
          assert.equal(updatedRow.notes, body.notes);

          const filteredResponse = await expensesApi.GET(
            request(`/api/expenses?academicYearId=${primaryYear.id}`),
          );
          assert.equal(filteredResponse.status, 200);
          const filtered = await filteredResponse.json();
          assert.ok(filtered.some((expense) => expense.id === expenseId));

          const deletedResponse = await expensesApi.DELETE(
            request(`/api/expenses?id=${encodeURIComponent(expenseId)}`, "DELETE"),
          );
          assert.equal(deletedResponse.status, 200);
          assert.equal(
            await prisma.expense.findUnique({ where: { id: expenseId } }),
            null,
          );
          temporaryExpenseIds.delete(expenseId);
        } finally {
          if (expenseId) {
            await prisma.expense.deleteMany({ where: { id: expenseId } });
            temporaryExpenseIds.delete(expenseId);
          }
        }
      });

      const invalidAmounts = [
        ["EXP-NUM-BOOL-01", true],
        ["EXP-NUM-ARRAY-01", [5]],
        ["EXP-NUM-OBJECT-01", {}],
        ["EXP-NUM-NULL-01", null],
        ["EXP-NUM-EMPTY-01", ""],
        ["EXP-NUM-NAN-01", "NaN"],
        ["EXP-NUM-INFINITY-01", "Infinity"],
        ["EXP-NUM-ZERO-01", 0],
        ["EXP-NUM-NEGATIVE-01", -1],
      ];
      for (const [caseId, amount] of invalidAmounts) {
        await t.test(caseId, async () => {
          const response = await expensesApi.POST(
            request("/api/expenses", "POST", {
              academicYearId: primaryYear.id,
              category: "OTHER",
              description: `PHASE6-${runId}-${caseId}`,
              amount,
              expenseDate: "2083-08-07",
            }),
          );
          const result = await response.json();
          if (response.status === 201 && result.id) {
            temporaryExpenseIds.add(result.id);
            createdExpenseIds.add(result.id);
          }
          assert.equal(response.status, 400, JSON.stringify(result));
        });
      }

      await t.test("EXP-VALID-01 rejects missing fields, bad dates, and categories", async () => {
        const valid = {
          academicYearId: primaryYear.id,
          category: "OTHER",
          description: `PHASE6-${runId}-invalid`,
          amount: 1,
          expenseDate: "2083-08-07",
        };
        const invalidBodies = [
          { ...valid, academicYearId: "" },
          { ...valid, description: "" },
          { ...valid, category: "NOT_A_CATEGORY" },
          { ...valid, expenseDate: "2083-13-40" },
        ];
        for (const body of invalidBodies) {
          const response = await expensesApi.POST(
            request("/api/expenses", "POST", body),
          );
          assert.equal(response.status, 400);
        }
      });

      await t.test("EXP-ID-01 rejects updates and deletions for unknown IDs", async () => {
        const unknownId = `phase6-unknown-${runId}`;
        const patchResponse = await expensesApi.PATCH(
          request(`/api/expenses?id=${unknownId}`, "PATCH", {
            academicYearId: primaryYear.id,
            category: "OTHER",
            description: "Unknown record",
            amount: 1,
            expenseDate: "2083-08-07",
          }),
        );
        const deleteResponse = await expensesApi.DELETE(
          request(`/api/expenses?id=${unknownId}`, "DELETE"),
        );
        assert.equal(patchResponse.status, 404);
        assert.equal(deleteResponse.status, 404);
      });

      if (foreignYear) {
        await t.test("EXP-SCHOOL-01 rejects expense creation for the QA-only fixture year", async () => {
          const response = await expensesApi.POST(
            request("/api/expenses", "POST", {
              academicYearId: foreignYear.id,
              category: "OTHER",
              description: `PHASE6-${runId}-foreign-year`,
              amount: 1,
              expenseDate: "2083-08-07",
            }),
          );
          assert.equal(response.status, 404);
        });
      } else {
        t.diagnostic("EXP-SCHOOL-01 NOT RUN: no foreign-school academic year exists.");
      }

      const occupiedSalaryPeriods = new Set(
        (
          await prisma.teacherSalary.findMany({
            where: { teacherId: teacher.id, academicYearId: primaryYear.id },
            select: { month: true, year: true },
          })
        ).map(({ month, year }) => `${year}-${month}`),
      );
      const yearFromAcademicName =
        Number(primaryYear.name.match(/\d{4}/)?.[0]) || 2083;
      let nextMonth = 1;
      let nextYear = yearFromAcademicName;
      async function createTemporarySalary({
        salaryAmount = 1000,
        deduction = 0,
      } = {}) {
        let period;
        while (!period) {
          const key = `${nextYear}-${nextMonth}`;
          if (!occupiedSalaryPeriods.has(key)) {
            period = { year: nextYear, month: nextMonth };
            occupiedSalaryPeriods.add(key);
          }
          nextMonth += 1;
          if (nextMonth > 12) {
            nextMonth = 1;
            nextYear += 1;
          }
          if (nextYear > 2200 && !period) {
            throw new Error("No unused salary period available for the test teacher.");
          }
        }
        const salary = await prisma.teacherSalary.create({
          data: {
            teacherId: teacher.id,
            academicYearId: primaryYear.id,
            month: period.month,
            year: period.year,
            salaryAmount,
            deduction,
            netAmount: rounded(salaryAmount - deduction),
            status: "PENDING",
            notes: `PHASE6-${runId}`,
          },
        });
        temporarySalaryIds.add(salary.id);
        return salary;
      }

      async function paySalary(teacherSalaryId, amount, reference) {
        const salary = await prisma.$transaction(
          (tx) =>
            recordTeacherSalaryPayment(tx, {
              teacherSalaryId,
              amount,
              paymentDate: primaryYear.startDate,
              method: "BANK",
              reference,
              notes: `PHASE6-${runId}`,
            }),
          { maxWait: 15_000, timeout: 30_000 },
        );
        for (const payment of salary.payments) {
          createdSalaryPaymentIds.add(payment.id);
        }
        return salary;
      }

      await t.test("SAL-STRUCT-01 preserves salary arithmetic and duplicate-period protection", async () => {
        const salary = await createTemporarySalary({
          salaryAmount: 1000,
          deduction: 100,
        });
        assert.equal(Number(salary.salaryAmount), 1000);
        assert.equal(Number(salary.deduction), 100);
        assert.equal(Number(salary.netAmount), 900);
        assert.equal(salary.status, "PENDING");
        await assert.rejects(
          prisma.teacherSalary.create({
            data: {
              teacherId: salary.teacherId,
              academicYearId: salary.academicYearId,
              month: salary.month,
              year: salary.year,
              salaryAmount: 1000,
              deduction: 100,
              netAmount: 900,
              status: "PENDING",
            },
          }),
          (error) => error?.code === "P2002",
        );
        assert.equal(
          await prisma.teacherSalary.count({
            where: {
              teacherId: salary.teacherId,
              academicYearId: salary.academicYearId,
              month: salary.month,
              year: salary.year,
            },
          }),
          1,
        );
      });

      await t.test("SAL-PAY-01 supports partial then full settlement", async () => {
        const salary = await createTemporarySalary({
          salaryAmount: 1000,
          deduction: 100,
        });
        const partial = await paySalary(salary.id, 300, `PHASE6-${runId}-partial`);
        assert.equal(partial.status, "PARTIAL");
        assert.equal(partial.payments.length, 1);
        assert.equal(Number(partial.payments[0].amount), 300);
        assert.equal(partial.payments[0].method, "BANK");
        assert.equal(partial.payments[0].reference, `PHASE6-${runId}-partial`);
        const settled = await paySalary(salary.id, 600, `PHASE6-${runId}-final`);
        assert.equal(settled.status, "PAID");
        assert.equal(settled.payments.length, 2);
        assert.equal(
          rounded(
            settled.payments.reduce(
              (sum, payment) => sum + Number(payment.amount),
              0,
            ),
          ),
          900,
        );
      });

      await t.test("SAL-PAY-OVER-01 rejects overpayment without changing the balance", async () => {
        const salary = await createTemporarySalary({ salaryAmount: 1000 });
        const partial = await paySalary(salary.id, 600, `PHASE6-${runId}-before-overpay`);
        assert.equal(partial.status, "PARTIAL");
        await assert.rejects(
          paySalary(salary.id, 500, `PHASE6-${runId}-overpay`),
          (error) =>
            error instanceof SalaryPaymentRequestError && error.status === 400,
        );
        const unchanged = await prisma.teacherSalary.findUniqueOrThrow({
          where: { id: salary.id },
          include: { payments: true },
        });
        assert.equal(unchanged.status, "PARTIAL");
        assert.equal(unchanged.payments.length, 1);
        assert.equal(Number(unchanged.payments[0].amount), 600);
      });

      await t.test("SAL-PAY-CONC-01 serializes concurrent payments and prevents overpayment", async () => {
        const salary = await createTemporarySalary({ salaryAmount: 1000 });
        const results = await Promise.allSettled([
          paySalary(salary.id, 600, `PHASE6-${runId}-race-a`),
          paySalary(salary.id, 600, `PHASE6-${runId}-race-b`),
        ]);
        assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
        assert.equal(results.filter((result) => result.status === "rejected").length, 1);
        const persisted = await prisma.teacherSalary.findUniqueOrThrow({
          where: { id: salary.id },
          include: { payments: true },
        });
        assert.equal(persisted.status, "PARTIAL");
        assert.equal(persisted.payments.length, 1);
        assert.equal(Number(persisted.payments[0].amount), 600);
      });

      await t.test("SAL-PAY-DUP-01 rejects repeated full settlement after balance reaches zero", async () => {
        const salary = await createTemporarySalary({ salaryAmount: 500 });
        const paid = await paySalary(salary.id, 500, `PHASE6-${runId}-full`);
        assert.equal(paid.status, "PAID");
        await assert.rejects(
          paySalary(salary.id, 500, `PHASE6-${runId}-full`),
          (error) =>
            error instanceof SalaryPaymentRequestError && error.status === 400,
        );
        const persisted = await prisma.teacherSalary.findUniqueOrThrow({
          where: { id: salary.id },
          include: { payments: true },
        });
        assert.equal(persisted.payments.length, 1);
        assert.equal(Number(persisted.payments[0].amount), 500);
      });

      await t.test("FIN-REC-01 reconciles cash-basis finance overview to primary-school records", async () => {
        const response = await financeOverviewApi.GET(
          request(
            `/api/finance-overview?period=yearly&academicYearId=${primaryYear.id}`,
          ),
        );
        assert.equal(response.status, 200);
        const overview = await response.json();
        const from = new Date(overview.from);
        const to = new Date(new Date(overview.to).getTime() + 1);
        const paymentWhere = {
          paymentDate: { gte: from, lt: to },
          bill: {
            is: {
              student: { is: { schoolId: primarySchoolId } },
              academicYear: { is: { schoolId: primarySchoolId } },
            },
          },
        };
        const salaryPaymentWhere = {
          paymentDate: { gte: from, lt: to },
          teacherSalary: {
            is: {
              teacher: { is: { schoolId: primarySchoolId } },
              academicYear: { is: { schoolId: primarySchoolId } },
            },
          },
        };
        const expenseWhere = {
          expenseDate: { gte: from, lt: to },
          academicYear: { is: { schoolId: primarySchoolId } },
        };
        const [
          feePayments,
          waivers,
          salaryPayments,
          legacySalaries,
          expenses,
          expenseGroups,
        ] = await Promise.all([
          prisma.payment.aggregate({
            where: paymentWhere,
            _sum: { amount: true },
            _count: { _all: true },
          }),
          prisma.payment.aggregate({
            where: { ...paymentWhere, waiverAmount: { gt: 0 } },
            _sum: { waiverAmount: true },
            _count: { _all: true },
          }),
          prisma.teacherSalaryPayment.aggregate({
            where: salaryPaymentWhere,
            _sum: { amount: true },
            _count: { _all: true },
          }),
          prisma.teacherSalary.aggregate({
            where: {
              status: "PAID",
              paymentDate: { gte: from, lt: to },
              payments: { none: {} },
              teacher: { is: { schoolId: primarySchoolId } },
              academicYear: { is: { schoolId: primarySchoolId } },
            },
            _sum: { netAmount: true },
            _count: { _all: true },
          }),
          prisma.expense.aggregate({
            where: expenseWhere,
            _sum: { amount: true },
            _count: { _all: true },
          }),
          prisma.expense.groupBy({
            by: ["category"],
            where: expenseWhere,
            _sum: { amount: true },
            _count: { _all: true },
          }),
        ]);
        const feeIncome = Number(feePayments._sum.amount ?? 0);
        const salaryPaid =
          Number(salaryPayments._sum.amount ?? 0) +
          Number(legacySalaries._sum.netAmount ?? 0);
        const otherExpenses = Number(expenses._sum.amount ?? 0);
        assert.equal(overview.feeIncome, feeIncome);
        assert.equal(overview.waivers, Number(waivers._sum.waiverAmount ?? 0));
        assert.equal(overview.salaryPaid, salaryPaid);
        assert.equal(overview.otherExpenses, otherExpenses);
        assert.equal(overview.totalExpenses, salaryPaid + otherExpenses);
        assert.equal(
          overview.netCashflow,
          feeIncome - salaryPaid - otherExpenses,
        );
        assert.equal(overview.counts.feePayments, feePayments._count._all);
        assert.equal(
          overview.counts.waivers,
          waivers._count._all,
        );
        assert.equal(
          overview.counts.salaryPayments,
          salaryPayments._count._all + legacySalaries._count._all,
        );
        assert.equal(overview.counts.expenses, expenses._count._all);
        assert.equal(
          rounded(
            overview.expenseCategories.reduce(
              (sum, group) => sum + group.amount,
              0,
            ),
          ),
          rounded(otherExpenses),
        );
        assert.equal(expenseGroups.length, overview.expenseCategories.length);
      });

      await t.test("FIN-DATE-01 reconciles monthly date-filtered totals", async () => {
        const bsDate = dateToBS(primaryYear.startDate);
        const date = `${bsDate.year}-${String(bsDate.month).padStart(2, "0")}-${String(bsDate.day).padStart(2, "0")}`;
        const response = await financeOverviewApi.GET(
          request(`/api/finance-overview?period=monthly&date=${date}`),
        );
        assert.equal(response.status, 200);
        const overview = await response.json();
        const from = new Date(overview.from);
        const to = new Date(new Date(overview.to).getTime() + 1);
        const [
          feePayments,
          salaryPayments,
          legacySalaries,
          expenses,
        ] = await Promise.all([
          prisma.payment.aggregate({
            where: {
              paymentDate: { gte: from, lt: to },
              bill: {
                is: {
                  student: { is: { schoolId: primarySchoolId } },
                  academicYear: { is: { schoolId: primarySchoolId } },
                },
              },
            },
            _sum: { amount: true },
          }),
          prisma.teacherSalaryPayment.aggregate({
            where: {
              paymentDate: { gte: from, lt: to },
              teacherSalary: {
                is: {
                  teacher: { is: { schoolId: primarySchoolId } },
                  academicYear: { is: { schoolId: primarySchoolId } },
                },
              },
            },
            _sum: { amount: true },
          }),
          prisma.teacherSalary.aggregate({
            where: {
              status: "PAID",
              paymentDate: { gte: from, lt: to },
              payments: { none: {} },
              teacher: { is: { schoolId: primarySchoolId } },
              academicYear: { is: { schoolId: primarySchoolId } },
            },
            _sum: { netAmount: true },
          }),
          prisma.expense.aggregate({
            where: {
              expenseDate: { gte: from, lt: to },
              academicYear: { is: { schoolId: primarySchoolId } },
            },
            _sum: { amount: true },
          }),
        ]);
        const feeIncome = Number(feePayments._sum.amount ?? 0);
        const salaryPaid =
          Number(salaryPayments._sum.amount ?? 0) +
          Number(legacySalaries._sum.netAmount ?? 0);
        const otherExpenses = Number(expenses._sum.amount ?? 0);
        assert.equal(overview.feeIncome, feeIncome);
        assert.equal(overview.salaryPaid, salaryPaid);
        assert.equal(overview.otherExpenses, otherExpenses);
        assert.equal(overview.totalExpenses, salaryPaid + otherExpenses);
        assert.equal(
          overview.netCashflow,
          feeIncome - salaryPaid - otherExpenses,
        );
      });
    } finally {
      for (const id of temporaryExpenseIds) {
        try {
          await prisma.expense.deleteMany({ where: { id } });
        } catch (error) {
          cleanupError ??= error;
        }
      }
      for (const id of temporarySalaryIds) {
        try {
          await prisma.teacherSalary.deleteMany({ where: { id } });
        } catch (error) {
          cleanupError ??= error;
        }
      }

      const remainingExpenses = await prisma.expense.findMany({
        where: { id: { in: [...temporaryExpenseIds] } },
        select: { id: true },
      });
      const remainingSalaries = await prisma.teacherSalary.findMany({
        where: { id: { in: [...temporarySalaryIds] } },
        include: { payments: { select: { id: true } } },
      });
      const remainingCreatedPayments =
        await prisma.teacherSalaryPayment.findMany({
          where: { id: { in: [...createdSalaryPaymentIds] } },
          select: { id: true },
        });
      const [
        primaryExpenses,
        primarySalaries,
        primarySalaryPayments,
        primaryLegacySalaries,
        primaryBills,
        primaryCredits,
        primaryFeePayments,
      ] = await Promise.all([
        prisma.expense.aggregate({
          where: { academicYear: { is: { schoolId: primarySchoolId } } },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        prisma.teacherSalary.findMany({
          where: {
            teacher: { is: { schoolId: primarySchoolId } },
            academicYear: { is: { schoolId: primarySchoolId } },
          },
          include: { payments: { select: { amount: true } } },
        }),
        prisma.teacherSalaryPayment.aggregate({
          where: {
            teacherSalary: {
              is: {
                teacher: { is: { schoolId: primarySchoolId } },
                academicYear: { is: { schoolId: primarySchoolId } },
              },
            },
          },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        prisma.teacherSalary.aggregate({
          where: {
            status: "PAID",
            payments: { none: {} },
            teacher: { is: { schoolId: primarySchoolId } },
            academicYear: { is: { schoolId: primarySchoolId } },
          },
          _sum: { netAmount: true },
          _count: { _all: true },
        }),
        prisma.bill.findMany({
          where: {
            status: { not: "CANCELLED" },
            student: { is: { schoolId: primarySchoolId } },
            academicYear: { is: { schoolId: primarySchoolId } },
          },
          select: { totalAmount: true, paidAmount: true },
        }),
        prisma.studentCredit.aggregate({
          where: {
            student: { is: { schoolId: primarySchoolId } },
            academicYear: { is: { schoolId: primarySchoolId } },
          },
          _sum: { amount: true, appliedAmount: true },
          _count: { _all: true },
        }),
        prisma.payment.aggregate({
          where: {
            bill: {
              is: {
                student: { is: { schoolId: primarySchoolId } },
                academicYear: { is: { schoolId: primarySchoolId } },
              },
            },
          },
          _sum: { amount: true },
          _count: { _all: true },
        }),
      ]);
      const salaryObligation = rounded(
        primarySalaries.reduce(
          (sum, salary) => sum + Number(salary.netAmount),
          0,
        ),
      );
      const salaryPaidByPage = rounded(
        primarySalaries.reduce((sum, salary) => {
          const paid = salary.payments.length
            ? salary.payments.reduce(
                (paymentSum, payment) =>
                  paymentSum + Number(payment.amount),
                0,
              )
            : salary.status === "PAID"
              ? Number(salary.netAmount)
              : 0;
          return sum + paid;
        }, 0),
      );
      const salaryOutstanding = rounded(
        primarySalaries.reduce((sum, salary) => {
          const paid = salary.payments.length
            ? salary.payments.reduce(
                (paymentSum, payment) =>
                  paymentSum + Number(payment.amount),
                0,
              )
            : salary.status === "PAID"
              ? Number(salary.netAmount)
              : 0;
          return sum + Math.max(0, Number(salary.netAmount) - paid);
        }, 0),
      );
      const creditAmount = Number(primaryCredits._sum.amount ?? 0);
      const creditApplied = Number(
        primaryCredits._sum.appliedAmount ?? 0,
      );
      finalSnapshot = await captureFinanceSnapshot(prisma);
      console.log(
        "PHASE6_FINANCE_SNAPSHOT " +
          JSON.stringify({
            target: `${target.host}/${target.database}`,
            baseline: baselineSnapshot,
            final: finalSnapshot,
            createdExpenseIds: [...createdExpenseIds],
            remainingTemporaryExpenseIds: [...temporaryExpenseIds],
            temporarySalaryIds: [...temporarySalaryIds],
            createdSalaryPaymentIds: [...createdSalaryPaymentIds],
            remainingExpenseIds: remainingExpenses.map(({ id }) => id),
            remainingSalaryIds: remainingSalaries.map(({ id }) => id),
            remainingCreatedSalaryPaymentIds:
              remainingCreatedPayments.map(({ id }) => id),
            remainingSalaryPaymentIds: remainingSalaries.flatMap((salary) =>
              salary.payments.map(({ id }) => id),
            ),
            reconciliation: {
              expenseCount: primaryExpenses._count._all,
              expenseTotal: Number(primaryExpenses._sum.amount ?? 0),
              salaryRecordCount: primarySalaries.length,
              salaryNetObligations: salaryObligation,
              salaryPaymentsRecorded:
                primarySalaryPayments._count._all,
              salaryPaymentsTotal:
                Number(primarySalaryPayments._sum.amount ?? 0) +
                Number(primaryLegacySalaries._sum.netAmount ?? 0),
              salaryOutstanding,
              feePaymentCount: primaryFeePayments._count._all,
              feeCollections: Number(primaryFeePayments._sum.amount ?? 0),
              outstandingBills: rounded(
                primaryBills.reduce(
                  (sum, bill) =>
                    sum +
                    Number(bill.totalAmount) -
                    Number(bill.paidAmount),
                  0,
                ),
              ),
              creditCount: primaryCredits._count._all,
              creditAmount,
              creditApplied,
              creditAvailable: rounded(creditAmount - creditApplied),
              salaryPaidByPage,
            },
          }),
      );

      await prisma.$disconnect();
      if (appPrisma && appPrisma !== prisma) {
        await appPrisma.$disconnect();
      }
      if (previousEnvironment.databaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousEnvironment.databaseUrl;
      }
      if (previousEnvironment.schoolId === undefined) {
        delete process.env.SCHOOL_ID;
      } else {
        process.env.SCHOOL_ID = previousEnvironment.schoolId;
      }
      if (previousEnvironment.nodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousEnvironment.nodeEnv;
      }

      assert.deepEqual(remainingExpenses, []);
      assert.deepEqual(remainingSalaries, []);
      assert.deepEqual(remainingCreatedPayments, []);
      assert.equal(finalSnapshot.hash, baselineSnapshot.hash);
      if (cleanupError) throw cleanupError;
    }
  },
);
