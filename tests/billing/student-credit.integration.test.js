import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { connectToTestDatabase, getVerifiedTestTarget } from "./helpers/database.js";
import { captureFinanceSnapshot } from "./helpers/finance-snapshot.js";
import { withInjectedTransactionFailure } from "./helpers/injected-transaction-failure.js";
import { bsToDate } from "../../src/lib/nepali-date.ts";

const enabled =
  process.env.CREDIT_QA_CONFIRMATION === "STUDENT_CREDIT_QA_ONLY";
const primarySchoolId = "cmwtatkm10000row42cgw4b64";

test(
  "student credit issue, application, concurrency, and reversal integration",
  { skip: enabled ? false : "requires explicit QA-database approval and migration" },
  async () => {
    const target = getVerifiedTestTarget();
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousSchoolId = process.env.SCHOOL_ID;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.DATABASE_URL = target.connectionString;
    process.env.SCHOOL_ID = primarySchoolId;
    process.env.NODE_ENV = "test";
    const {
      applyStudentCredit,
      issueStudentCredit,
      reverseStudentCreditApplication,
      StudentCreditWorkflowError,
    } = await import("../../src/lib/finance/student-credit-workflow.ts");
    const prisma = await connectToTestDatabase();
    const appDatabase = await import("../../src/lib/prisma.ts");
    const appPrisma = appDatabase.prisma;
    const transactionWithQaTimeout = appPrisma.$transaction.bind(appPrisma);
    Object.defineProperty(appPrisma, "$transaction", {
      configurable: true,
      writable: true,
      value: (callback, options) =>
        transactionWithQaTimeout(
          callback,
          options ?? { maxWait: 30_000, timeout: 30_000 },
        ),
    });

    const createdCreditIds = [];
    const createdBillIds = [];
    let createdUserId = "";
    let createdAcademicYearId = "";
    let baselineSnapshot;

    try {
      baselineSnapshot = await captureFinanceSnapshot(prisma);
      const school = await prisma.school.findUniqueOrThrow({
        where: { id: primarySchoolId },
        select: { id: true },
      });
      assert.equal(process.env.SCHOOL_ID, school.id);
      const academicYear = await prisma.academicYear.findFirstOrThrow({
        where: { schoolId: school.id, isActive: true },
        select: {
          id: true,
          startDate: true,
          endDate: true,
        },
      });
      const student = await prisma.student.findFirstOrThrow({
        where: { schoolId: school.id },
        select: { id: true },
      });
      const nextAcademicYear = await prisma.academicYear.create({
        data: {
          schoolId: school.id,
          name: `CREDIT_QA_${randomUUID()}`,
          startDate: bsToDate(2085, 1, 1),
          endDate: bsToDate(2085, 12, 30),
          isActive: false,
        },
        select: {
          id: true,
          startDate: true,
          endDate: true,
        },
      });
      createdAcademicYearId = nextAcademicYear.id;

      const user = await prisma.user.create({
        data: {
          name: "Student Credit QA Accountant",
          email: `credit-qa-${randomUUID()}@example.test`,
          password: randomUUID(),
          role: "ADMIN",
        },
        select: { id: true },
      });
      createdUserId = user.id;

      async function createBill(yearId, totalAmount, year) {
        const bill = await prisma.bill.create({
          data: {
            studentId: student.id,
            academicYearId: yearId,
            billNumber: `CREDIT-QA-${randomUUID()}`,
            totalAmount,
            discountAmount: 0,
            paidAmount: 0,
            status: "UNPAID",
            periodStartYear: year,
            periodStartMonth: 1,
            periodEndYear: year,
            periodEndMonth: 1,
            notes: "Temporary student-credit integration fixture",
          },
          select: { id: true },
        });
        createdBillIds.push(bill.id);
        return bill.id;
      }

      async function createCredit(
        amountCents,
        yearId = academicYear.id,
      ) {
        const result = await appPrisma.$transaction((tx) =>
          issueStudentCredit(tx, {
            studentId: student.id,
            academicYearId: yearId,
            amountCents,
            issueDate: academicYear.startDate,
            reason: "Approved integration-test adjustment",
            notes: "Temporary approved QA reference",
            issuedByUserId: user.id,
            idempotencyKey: randomUUID(),
          }),
        );
        createdCreditIds.push(result.credit.id);
        return result.credit;
      }

      const issuanceInput = {
        studentId: student.id,
        academicYearId: academicYear.id,
        amountCents: 5000,
        issueDate: academicYear.startDate,
        reason: "Approved fee correction",
        notes: "Approved reference for duplicate issuance test",
        issuedByUserId: user.id,
        idempotencyKey: randomUUID(),
      };
      const issuedCredit = await appPrisma.$transaction((tx) =>
        issueStudentCredit(tx, issuanceInput),
      );
      createdCreditIds.push(issuedCredit.credit.id);
      const repeatedIssuance = await appPrisma.$transaction((tx) =>
        issueStudentCredit(tx, issuanceInput),
      );
      assert.equal(repeatedIssuance.replayed, true);
      assert.equal(repeatedIssuance.credit.id, issuedCredit.credit.id);
      assert.equal(issuedCredit.credit.source, "MANUAL_ADJUSTMENT");
      assert.equal(issuedCredit.credit.sourcePaymentId, null);
      assert.equal(issuedCredit.credit.issuedByUserId, user.id);
      assert.equal(issuedCredit.credit.reason, issuanceInput.reason);
      assert.equal(issuedCredit.credit.issueDate.getTime(), academicYear.startDate.getTime());
      assert.equal(issuedCredit.credit.notes, issuanceInput.notes);

      await assert.rejects(
        appPrisma.$transaction((tx) =>
          issueStudentCredit(tx, {
            ...issuanceInput,
            issueDate: nextAcademicYear.startDate,
            idempotencyKey: randomUUID(),
          }),
        ),
        (error) =>
          error instanceof StudentCreditWorkflowError &&
          error.status === 400,
      );

      const partialBillId = await createBill(
        academicYear.id,
        100,
        2083,
      );
      const partialCredit = await createCredit(5000);
      const partialKey = randomUUID();
      const partialInput = {
        creditId: partialCredit.id,
        billId: partialBillId,
        amountCents: 3000,
        appliedByUserId: user.id,
        idempotencyKey: partialKey,
      };

      const partialResult = await appPrisma.$transaction((tx) =>
        applyStudentCredit(tx, partialInput),
      );
      assert.equal(partialResult.replayed, false);
      const repeatedResult = await appPrisma.$transaction((tx) =>
        applyStudentCredit(tx, partialInput),
      );
      assert.equal(repeatedResult.replayed, true);
      await assert.rejects(
        appPrisma.$transaction((tx) =>
          applyStudentCredit(tx, {
            ...partialInput,
            amountCents: 3001,
          }),
        ),
        (error) =>
          error instanceof StudentCreditWorkflowError &&
          error.status === 409,
      );

      const partialCreditAfter = await prisma.studentCredit.findUniqueOrThrow({
        where: { id: partialCredit.id },
        include: { applications: true },
      });
      const partialBillAfter = await prisma.bill.findUniqueOrThrow({
        where: { id: partialBillId },
      });
      assert.equal(Number(partialCreditAfter.appliedAmount), 30);
      assert.equal(partialCreditAfter.applications.length, 1);
      assert.equal(Number(partialBillAfter.paidAmount), 0);
      assert.equal(partialBillAfter.status, "PARTIAL");

      const partialApplication =
        partialCreditAfter.applications[0];
      assert.equal(partialApplication.appliedByUserId, user.id);
      assert.equal(partialApplication.billId, partialBillId);
      assert.ok(partialApplication.createdAt);

      const secondPartial = await appPrisma.$transaction((tx) =>
        applyStudentCredit(tx, {
          ...partialInput,
          amountCents: 1000,
          idempotencyKey: randomUUID(),
        }),
      );
      assert.equal(secondPartial.availableCreditAmount, 10);
      assert.equal(secondPartial.outstandingAmount, 60);

      await assert.rejects(
        appPrisma.$transaction((tx) =>
          applyStudentCredit(tx, {
            ...partialInput,
            amountCents: 3001,
            idempotencyKey: randomUUID(),
          }),
        ),
        (error) =>
          error instanceof StudentCreditWorkflowError &&
          error.status === 400,
      );

      const paymentBillId = await createBill(
        academicYear.id,
        100,
        2083,
      );
      const paymentsApi = await import("../../src/app/api/payments/route.ts");
      const paymentResponse = await paymentsApi.POST(
        new Request("http://credit-qa.local/api/payments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": randomUUID(),
          },
          body: JSON.stringify({
            billId: paymentBillId,
            amount: 30,
            waiverAmount: 20,
            waiverReason: "Approved payment test waiver",
            method: "CASH",
          }),
        }),
      );
      assert.equal(paymentResponse.status, 201);
      const paymentBeforeCredit = await prisma.payment.findFirstOrThrow({
        where: { billId: paymentBillId },
      });
      const settlementCredit = await createCredit(5000);
      await appPrisma.$transaction((tx) =>
        applyStudentCredit(tx, {
          creditId: settlementCredit.id,
          billId: paymentBillId,
          amountCents: 5000,
          appliedByUserId: user.id,
          idempotencyKey: randomUUID(),
        }),
      );
      const paymentAfterCredit = await prisma.payment.findUniqueOrThrow({
        where: { id: paymentBeforeCredit.id },
      });
      const settledBill = await prisma.bill.findUniqueOrThrow({
        where: { id: paymentBillId },
      });
      assert.equal(Number(paymentAfterCredit.amount), 30);
      assert.equal(Number(paymentAfterCredit.waiverAmount), 20);
      assert.equal(Number(settledBill.paidAmount), 30);
      assert.equal(settledBill.status, "PAID");

      const overBalanceBillId = await createBill(
        academicYear.id,
        100,
        2083,
      );
      const overBalanceCredit = await createCredit(20_000);
      await assert.rejects(
        appPrisma.$transaction((tx) =>
          applyStudentCredit(tx, {
            creditId: overBalanceCredit.id,
            billId: overBalanceBillId,
            amountCents: 10_001,
            appliedByUserId: user.id,
            idempotencyKey: randomUUID(),
          }),
        ),
        (error) =>
          error instanceof StudentCreditWorkflowError &&
          error.status === 400,
      );

      const crossYearBillId = await createBill(
        nextAcademicYear.id,
        100,
        2085,
      );
      await assert.rejects(
        appPrisma.$transaction((tx) =>
          applyStudentCredit(tx, {
            creditId: partialCredit.id,
            billId: crossYearBillId,
            amountCents: 100,
            appliedByUserId: user.id,
            idempotencyKey: randomUUID(),
          }),
        ),
        (error) =>
          error instanceof StudentCreditWorkflowError &&
          error.status === 400,
      );

      const concurrencyBillId = await createBill(
        academicYear.id,
        100,
        2083,
      );
      const concurrencyCredit = await createCredit(5000);
      const concurrentResults = await Promise.allSettled([
        appPrisma.$transaction((tx) =>
          applyStudentCredit(tx, {
            creditId: concurrencyCredit.id,
            billId: concurrencyBillId,
            amountCents: 3000,
            appliedByUserId: user.id,
            idempotencyKey: randomUUID(),
          }),
        ),
        appPrisma.$transaction((tx) =>
          applyStudentCredit(tx, {
            creditId: concurrencyCredit.id,
            billId: concurrencyBillId,
            amountCents: 3000,
            appliedByUserId: user.id,
            idempotencyKey: randomUUID(),
          }),
        ),
      ]);
      assert.equal(
        concurrentResults.filter((result) => result.status === "fulfilled")
          .length,
        1,
      );
      assert.equal(
        concurrentResults.filter((result) => result.status === "rejected")
          .length,
        1,
      );
      const concurrentCreditAfter =
        await prisma.studentCredit.findUniqueOrThrow({
          where: { id: concurrencyCredit.id },
          include: {
            applications: { where: { reversedAt: null } },
          },
        });
      assert.equal(Number(concurrentCreditAfter.appliedAmount), 30);
      assert.equal(concurrentCreditAfter.applications.length, 1);

      const rollbackBillId = await createBill(
        academicYear.id,
        100,
        2083,
      );
      const rollbackCredit = await createCredit(5000);
      const { result: failureObserved, injected } =
        await withInjectedTransactionFailure(
          appPrisma,
          "studentCredit",
          "update",
          async () => {
            try {
              await appPrisma.$transaction((tx) =>
                applyStudentCredit(tx, {
                  creditId: rollbackCredit.id,
                  billId: rollbackBillId,
                  amountCents: 3000,
                  appliedByUserId: user.id,
                  idempotencyKey: randomUUID(),
                }),
              );
              return false;
            } catch (error) {
              if (
                !(error instanceof Error) ||
                error.message !== "BILLING_QA_INJECTED_FAILURE"
              ) {
                throw error;
              }
              return true;
            }
          },
        );
      assert.equal(injected, true);
      assert.equal(failureObserved, true);
      const rollbackCreditAfter =
        await prisma.studentCredit.findUniqueOrThrow({
          where: { id: rollbackCredit.id },
          include: { applications: true },
        });
      const rollbackBillAfter = await prisma.bill.findUniqueOrThrow({
        where: { id: rollbackBillId },
      });
      assert.equal(rollbackCreditAfter.applications.length, 0);
      assert.equal(Number(rollbackCreditAfter.appliedAmount), 0);
      assert.equal(rollbackBillAfter.status, "UNPAID");

      const reversalBillId = await createBill(
        academicYear.id,
        100,
        2083,
      );
      const reversalCredit = await createCredit(5000);
      const reversalInput = {
        creditId: reversalCredit.id,
        billId: reversalBillId,
        amountCents: 3000,
        appliedByUserId: user.id,
        idempotencyKey: randomUUID(),
      };
      const appliedForReversal = await appPrisma.$transaction((tx) =>
        applyStudentCredit(tx, reversalInput),
      );
      const applicationId = appliedForReversal.application.id;

      const { result: reversalFailureObserved, injected: reversalInjected } =
        await withInjectedTransactionFailure(
          appPrisma,
          "billCreditApplication",
          "update",
          async () => {
            try {
              await appPrisma.$transaction((tx) =>
                reverseStudentCreditApplication(tx, {
                  applicationId,
                  reversedByUserId: user.id,
                  reason: "Injected reversal failure",
                }),
              );
              return false;
            } catch (error) {
              if (
                !(error instanceof Error) ||
                error.message !== "BILLING_QA_INJECTED_FAILURE"
              ) {
                throw error;
              }
              return true;
            }
          },
        );
      assert.equal(reversalInjected, true);
      assert.equal(reversalFailureObserved, true);
      const afterReversalRollback =
        await prisma.billCreditApplication.findUniqueOrThrow({
          where: { id: applicationId },
        });
      const creditAfterReversalRollback =
        await prisma.studentCredit.findUniqueOrThrow({
          where: { id: reversalCredit.id },
        });
      const billAfterReversalRollback =
        await prisma.bill.findUniqueOrThrow({
          where: { id: reversalBillId },
        });
      assert.equal(afterReversalRollback.reversedAt, null);
      assert.equal(Number(creditAfterReversalRollback.appliedAmount), 30);
      assert.equal(billAfterReversalRollback.status, "PARTIAL");

      const reversed = await appPrisma.$transaction((tx) =>
        reverseStudentCreditApplication(tx, {
          applicationId,
          reversedByUserId: user.id,
          reason: "Approved reversal test",
        }),
      );
      assert.equal(reversed.availableCreditAmount, 50);

      const reversedCreditAfter =
        await prisma.studentCredit.findUniqueOrThrow({
          where: { id: reversalCredit.id },
          include: { applications: true },
        });
      const reversedBillAfter = await prisma.bill.findUniqueOrThrow({
        where: { id: reversalBillId },
      });
      assert.equal(Number(reversedCreditAfter.appliedAmount), 0);
      assert.equal(reversedCreditAfter.applications.length, 1);
      assert.ok(reversedCreditAfter.applications[0].reversedAt);
      assert.equal(
        reversedCreditAfter.applications[0].reversedByUserId,
        user.id,
      );
      assert.equal(
        reversedCreditAfter.applications[0].reversalReason,
        "Approved reversal test",
      );
      assert.equal(reversedBillAfter.status, "UNPAID");

      await assert.rejects(
        appPrisma.$transaction((tx) =>
          reverseStudentCreditApplication(tx, {
            applicationId,
            reversedByUserId: user.id,
            reason: "Duplicate reversal test",
          }),
        ),
        (error) =>
          error instanceof StudentCreditWorkflowError &&
          error.status === 409,
      );

      const legacyCredit = await prisma.studentCredit.create({
        data: {
          studentId: student.id,
          academicYearId: academicYear.id,
          amount: 25,
          appliedAmount: 0,
          source: "LEGACY",
        },
        select: { id: true },
      });
      createdCreditIds.push(legacyCredit.id);
      await assert.rejects(
        appPrisma.$transaction((tx) =>
          applyStudentCredit(tx, {
            creditId: legacyCredit.id,
            billId: partialBillId,
            amountCents: 100,
            appliedByUserId: user.id,
            idempotencyKey: randomUUID(),
          }),
        ),
        (error) =>
          error instanceof StudentCreditWorkflowError &&
          error.status === 409,
      );
    } finally {
      try {
        if (createdCreditIds.length > 0) {
          await prisma.studentCredit.deleteMany({
            where: { id: { in: createdCreditIds } },
          });
        }
        if (createdBillIds.length > 0) {
          await prisma.bill.deleteMany({
            where: { id: { in: createdBillIds } },
          });
        }
        if (createdUserId) {
          await prisma.user.delete({ where: { id: createdUserId } });
        }
        if (createdAcademicYearId) {
          await prisma.academicYear.delete({
            where: { id: createdAcademicYearId },
          });
        }

        const [
          remainingCredits,
          remainingBills,
          remainingUser,
          remainingAcademicYear,
        ] = await Promise.all([
          createdCreditIds.length > 0
            ? prisma.studentCredit.count({
                where: { id: { in: createdCreditIds } },
              })
            : 0,
          createdBillIds.length > 0
            ? prisma.bill.count({ where: { id: { in: createdBillIds } } })
            : 0,
          createdUserId
            ? prisma.user.findUnique({ where: { id: createdUserId }, select: { id: true } })
            : null,
          createdAcademicYearId
            ? prisma.academicYear.findUnique({
                where: { id: createdAcademicYearId },
                select: { id: true },
              })
            : null,
        ]);
        assert.equal(remainingCredits, 0, "Temporary credit rows remain after cleanup.");
        assert.equal(remainingBills, 0, "Temporary bills remain after cleanup.");
        assert.equal(remainingUser, null, "Temporary QA user remains after cleanup.");
        assert.equal(remainingAcademicYear, null, "Temporary academic year remains after cleanup.");
        console.log(
          "CREDIT_QA_CLEANUP " +
            JSON.stringify({
              temporaryUserId: createdUserId || null,
              temporaryAcademicYearId: createdAcademicYearId || null,
              temporaryBillIds: createdBillIds,
              temporaryCreditIds: createdCreditIds,
              remainingTemporaryRows: 0,
            }),
        );

        if (baselineSnapshot) {
          const finalSnapshot = await captureFinanceSnapshot(prisma);
          assert.equal(
            finalSnapshot.hash,
            baselineSnapshot.hash,
            "Pre-existing school or financial records changed during the credit integration test.",
          );
        }
      } finally {
        await appPrisma.$disconnect();
        await prisma.$disconnect();
        if (previousDatabaseUrl === undefined) {
          delete process.env.DATABASE_URL;
        } else {
          process.env.DATABASE_URL = previousDatabaseUrl;
        }
        if (previousSchoolId === undefined) {
          delete process.env.SCHOOL_ID;
        } else {
          process.env.SCHOOL_ID = previousSchoolId;
        }
        if (previousNodeEnv === undefined) {
          delete process.env.NODE_ENV;
        } else {
          process.env.NODE_ENV = previousNodeEnv;
        }
      }
    }
  },
);
