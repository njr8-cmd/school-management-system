import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { bsToDate, dateToBS } from "../../src/lib/nepali-date";
import { recordTeacherSalaryPayment } from "../../src/lib/teacher-salary-payment";
import {
  billingPeriods,
  expected,
  MARKER,
  SCHOOL_NAME,
} from "./fixtures/billing-test-data";
import { loadBillingApi, postJson } from "./helpers/api-client";
import { cleanupTestBills } from "./helpers/cleanup-test-data";
import { connectToTestDatabase, getVerifiedTestTarget } from "./helpers/database";
import { loadBill, verifyBillSnapshot, verifySettlement } from "./helpers/database-verification";
import { captureFinanceSnapshot } from "./helpers/finance-snapshot";
import { withInjectedTransactionFailure } from "./helpers/injected-transaction-failure";

const results = [];
const runId = randomUUID();
const focusedTestIds = process.env.BILLING_QA_FOCUS
  ? new Set(
      process.env.BILLING_QA_FOCUS.split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    )
  : null;

async function main() {
  const target = getVerifiedTestTarget();
  process.env.DATABASE_URL = target.connectionString;
  const prisma = await connectToTestDatabase();
  let appPrisma;
  const previousSchoolId = process.env.SCHOOL_ID;
  const previousNodeEnv = process.env.NODE_ENV;
  try {
    const fixturePath = resolve(
      process.cwd(),
      "tests",
      "billing",
      "fixtures",
      "billing-test-ids.json",
    );
    const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
    if (fixture.marker !== MARKER) {
      throw new Error("The generated fixture mapping has an unexpected marker.");
    }

    const fixtureSchool = await prisma.school.findUniqueOrThrow({
      where: { id: fixture.schoolId },
      select: { id: true, name: true, shortName: true },
    });
    assert.equal(fixtureSchool.name, SCHOOL_NAME);
    assert.equal(fixtureSchool.shortName, MARKER);

    const feeIds = [
      ...Object.values(fixture.feeIds),
      ...Object.values(fixture.nextYearFeeIds ?? {}),
    ];
    const [fixtureYears, fixtureStudents, fixtureClasses, fixtureFees, fixtureCharges, fixtureDiscounts, fixtureTeacher] = await Promise.all([
      prisma.academicYear.findMany({
        where: { id: { in: fixture.academicYearIds } },
        select: { id: true, schoolId: true },
      }),
      prisma.student.findMany({
        where: { id: { in: Object.values(fixture.studentIds) } },
        select: { id: true, schoolId: true },
      }),
      prisma.class.findMany({
        where: { id: { in: Object.values(fixture.classIds) } },
        select: { id: true, schoolId: true },
      }),
      prisma.feeStructure.findMany({
        where: { id: { in: feeIds } },
        include: {
          academicYear: { select: { schoolId: true } },
          class: { select: { schoolId: true } },
        },
      }),
      prisma.studentCharge.findMany({
        where: { id: { in: Object.values(fixture.chargeIds) } },
        include: {
          student: { select: { schoolId: true } },
          academicYear: { select: { schoolId: true } },
        },
      }),
      prisma.studentDiscount.findMany({
        where: { id: { in: Object.values(fixture.discountIds) } },
        include: {
          student: { select: { schoolId: true } },
          academicYear: { select: { schoolId: true } },
        },
      }),
      prisma.teacher.findFirst({
        where: { id: fixture.teacherId },
        select: { schoolId: true },
      }),
    ]);
    assert.equal(fixtureYears.length, fixture.academicYearIds.length);
    assert.equal(fixtureStudents.length, Object.keys(fixture.studentIds).length);
    assert.equal(fixtureClasses.length, Object.keys(fixture.classIds).length);
    assert.equal(fixtureFees.length, feeIds.length);
    assert.equal(fixtureCharges.length, Object.keys(fixture.chargeIds).length);
    assert.equal(fixtureDiscounts.length, Object.keys(fixture.discountIds).length);
    assert.ok(fixtureTeacher, "Fixture teacher was not found.");
    for (const row of [...fixtureYears, ...fixtureStudents, ...fixtureClasses]) {
      assert.equal(row.schoolId, fixture.schoolId);
    }
    for (const fee of fixtureFees) {
      assert.equal(fee.academicYear.schoolId, fixture.schoolId);
      assert.equal(fee.class.schoolId, fixture.schoolId);
    }
    for (const charge of fixtureCharges) {
      assert.equal(charge.student.schoolId, fixture.schoolId);
      assert.equal(charge.academicYear.schoolId, fixture.schoolId);
    }
    for (const discount of fixtureDiscounts) {
      assert.equal(discount.student.schoolId, fixture.schoolId);
      assert.equal(discount.academicYear.schoolId, fixture.schoolId);
    }
    assert.equal(fixtureTeacher.schoolId, fixture.schoolId);

    process.env.SCHOOL_ID = fixture.schoolId;
    process.env.NODE_ENV = "test";
    const baselineSnapshot = await captureFinanceSnapshot(prisma);

    const api = await loadBillingApi();
    const discountApi = await import("../../src/app/api/student-discounts/route");
    const feeApi = await import("../../src/app/api/fees/route");
    const expenseApi = await import("../../src/app/api/expenses/route");
    const teachersApi = await import("../../src/app/api/teachers/route");
    const appDatabase = await import("../../src/lib/prisma");
    appPrisma = appDatabase.prisma;
    const student = (key) => fixture.studentIds[key];
    const period = (key) => billingPeriods[key];
    const makeBillBody = (studentKey, periodKey, suffix = "test") => ({
      studentId: student(studentKey),
      academicYearId: fixture.academicYearId,
      periodStartYear: 2083,
      periodStartMonth: period(periodKey).startMonth,
      periodEndYear: 2083,
      periodEndMonth: period(periodKey).endMonth,
      notes: `${MARKER} ${runId} ${suffix}`,
    });
    const makeBillBodyForYear = (
      studentKey,
      academicYearId,
      year,
      periodKey,
      suffix = "test",
    ) => ({
      ...makeBillBody(studentKey, periodKey, suffix),
      academicYearId,
      periodStartYear: year,
      periodEndYear: year,
    });

    async function resetBills() {
      await cleanupTestBills(prisma, fixture, runId);
    }

    async function createBill(studentKey, periodKey = "P1", suffix = "test") {
      return postJson(
        api.createBill,
        makeBillBody(studentKey, periodKey, suffix),
        "/api/bills",
      );
    }

    async function createPayment(billId, amount, waiverAmount = 0, waiverReason) {
      return postJson(
        api.recordPayment,
        {
          billId,
          amount,
          waiverAmount,
          ...(waiverReason !== undefined ? { waiverReason } : {}),
          method: "CASH",
        },
        "/api/payments",
        { "Idempotency-Key": randomUUID() },
      );
    }

    async function createDiscount(body) {
      return postJson(
        discountApi.POST,
        body,
        "/api/student-discounts",
      );
    }

    async function updateDiscount(body) {
      const response = await discountApi.PUT(
        new Request("http://billing-qa.local/api/student-discounts", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      return {
        status: response.status,
        body: await response.json(),
      };
    }

    async function createFee(body) {
      return postJson(feeApi.POST, body, "/api/fees");
    }

    async function run(id, name, expectedValue, action, severity = "MEDIUM") {
      if (focusedTestIds && !focusedTestIds.has(id)) return;
      await resetBills();
      console.log(`Running ${id}: ${name}`);
      try {
        const actual = await action();
        results.push({ id, name, expected: expectedValue, actual, status: "PASS", severity });
        console.log(`PASS ${id}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message.includes("Connection terminated unexpectedly")
          ? "BLOCKED"
          : "FAIL";
        results.push({
          id,
          name,
          expected: expectedValue,
          actual: message,
          status,
          severity,
        });
        console.log(`${status} ${id}: ${message}`);
      } finally {
        await resetBills();
      }
    }

    const getCreatedBill = async (response, expectedStatus = 201) => {
      assert.equal(response.status, expectedStatus, JSON.stringify(response.body));
      if (expectedStatus !== 201) return null;
      assert.ok(response.body.bill?.id, "API response did not contain a bill ID.");
      const bill = await loadBill(prisma, response.body.bill.id);
      assert.ok(bill, "Created bill was not persisted.");
      assert.ok(bill.billNumber, "Bill number was not persisted.");
      return bill;
    };

    await run("A01", "Normal quarterly bill", "Rs. 21,500; UNPAID", async () => {
      const bill = await getCreatedBill(await createBill("S001", "P1", "A01"));
      verifyBillSnapshot(bill, {
        studentId: student("S001"),
        academicYearId: fixture.academicYearId,
        periodStartYear: 2083,
        periodStartMonth: 1,
        periodEndYear: 2083,
        periodEndMonth: 3,
        totalAmount: expected.ordinaryP1,
      });
      assert.equal(Number(bill.paidAmount), 0);
      assert.equal(bill.status, "UNPAID");
      assert.deepEqual(
        Object.fromEntries(bill.items.map((item) => [item.description.replace(`${MARKER} `, ""), Number(item.netAmount)])),
        {
          Tuition: 15000,
          Admission: 3000,
          "Computer Lab": 1500,
          Exam: 800,
          "Class Miscellaneous": 1200,
        },
      );
      return { total: Number(bill.totalAmount), status: bill.status, itemCount: bill.items.length };
    });

    await run("A02", "Multiple separate discounts", "Rs. 19,500", async () => {
      const bill = await getCreatedBill(await createBill("S002", "P1", "A02"));
      assert.equal(Number(bill.totalAmount), expected.multipleDiscounts);
      assert.equal(Number(bill.discountAmount), 2000);
      return { total: Number(bill.totalAmount), discount: Number(bill.discountAmount) };
    }, "HIGH");

    await run("A03", "One discount over multiple fee types", "Rs. 18,680", async () => {
      const originalDiscounts = await prisma.studentDiscount.findMany({
        where: { studentId: student("S002"), academicYearId: fixture.academicYearId },
        select: { id: true, isActive: true, updatedAt: true },
      });
      await prisma.studentDiscount.updateMany({
        where: { studentId: student("S002"), academicYearId: fixture.academicYearId },
        data: { isActive: false },
      });
      await prisma.studentDiscount.update({
        where: { id: fixture.discountIds["D03-S002"] },
        data: { isActive: true },
      });
      try {
        const bill = await getCreatedBill(await createBill("S002", "P1", "A03"));
        assert.equal(Number(bill.totalAmount), expected.generalDiscount);
        return { total: Number(bill.totalAmount), discount: Number(bill.discountAmount) };
      } finally {
        for (const discount of originalDiscounts) {
          await prisma.studentDiscount.update({
            where: { id: discount.id },
            data: {
              isActive: discount.isActive,
              updatedAt: discount.updatedAt,
            },
          });
        }
      }
    });

    await run("A04", "Full tuition scholarship", "Rs. 8,500 including the undiscounted term charge", async () => {
      const bill = await getCreatedBill(await createBill("S006", "P1", "A04"));
      const tuition = bill.items.find(
        (item) => item.feeType === "TUITION" && !item.studentChargeId,
      );
      const actual = {
        total: Number(bill.totalAmount),
        scholarshipTuitionNet: Number(tuition?.netAmount),
        studentTermCharge: bill.items
          .filter((item) => item.studentChargeId)
          .map((item) => Number(item.netAmount)),
      };
      assert.equal(actual.total, expected.fullScholarship);
      assert.equal(actual.scholarshipTuitionNet, 0);
      assert.deepEqual(actual.studentTermCharge, [2000]);
      return actual;
    }, "HIGH");

    await run("A05", "Student-specific BUS and MISC charges", "Rs. 26,700", async () => {
      const bill = await getCreatedBill(await createBill("S003", "P1", "A05"));
      assert.equal(Number(bill.totalAmount), expected.studentCharges);
      assert.ok(bill.items.some((item) => item.studentChargeId && item.feeType === "BUS" && Number(item.amount) === 4500));
      assert.ok(bill.items.some((item) => item.studentChargeId && item.feeType === "MISCELLANEOUS" && Number(item.amount) === 700));
      return { total: Number(bill.totalAmount) };
    }, "HIGH");

    await run("A06", "Discounts exclude student-specific charges", "Rs. 24,900", async () => {
      const originalDiscounts = await prisma.studentDiscount.findMany({
        where: { studentId: student("S003"), academicYearId: fixture.academicYearId },
        select: { id: true, isActive: true, updatedAt: true },
      });
      await prisma.studentDiscount.updateMany({
        where: { studentId: student("S003"), academicYearId: fixture.academicYearId },
        data: { isActive: true },
      });
      try {
        const bill = await getCreatedBill(await createBill("S003", "P1", "A06"));
        assert.equal(Number(bill.totalAmount), expected.studentChargesWithDiscounts);
        assert.equal(Number(bill.discountAmount), 1800);
        assert.ok(bill.items.filter((item) => item.studentChargeId).every((item) => Number(item.discountAmount) === 0));
        return { total: Number(bill.totalAmount), discount: Number(bill.discountAmount) };
      } finally {
        for (const discount of originalDiscounts) {
          await prisma.studentDiscount.update({
            where: { id: discount.id },
            data: {
              isActive: discount.isActive,
              updatedAt: discount.updatedAt,
            },
          });
        }
      }
    }, "HIGH");

    await run("A07", "Quantity-based BUS charge", "Rs. 26,300", async () => {
      const bill = await getCreatedBill(await createBill("S007", "P1", "A07"));
      const actual = {
        total: Number(bill.totalAmount),
        bus: bill.items.filter((item) => item.studentChargeId).map((item) => ({
          quantity: Number(item.quantity),
          rate: Number(item.rate),
          amount: Number(item.amount),
        })),
      };
      assert.equal(actual.total, expected.quantityBasedBus, `Unexpected quantity-based charge total: ${JSON.stringify(actual)}`);
      return actual;
    }, "HIGH");

    await run("A08", "Student charge isolation", "S001 has no S003 charges", async () => {
      const bill = await getCreatedBill(await createBill("S001", "P1", "A08"));
      assert.ok(bill.items.every((item) => item.studentChargeId === null));
      assert.ok(bill.items.every((item) => item.feeType !== "BUS"));
      return { studentId: bill.studentId, studentChargeItems: bill.items.filter((item) => item.studentChargeId).length };
    }, "HIGH");

    await run("A09", "Grade-specific fees", "Rs. 24,600", async () => {
      const bill = await getCreatedBill(await createBill("S008", "P1", "A09"));
      assert.equal(Number(bill.totalAmount), expected.grade6P1);
      return { total: Number(bill.totalAmount), feeTypes: [...new Set(bill.items.map((item) => item.feeType))] };
    }, "HIGH");

    await run("SC01", "Student-charge frequency amounts", "All student-charge frequencies use rate multiplied by their calculated quantity", async () => {
      const bills = await Promise.all([
        createBill("S003", "P1", "SC01-S003"),
        createBill("S004", "P1", "SC01-S004"),
        createBill("S005", "P1", "SC01-S005"),
      ]);
      const loaded = await Promise.all(
        bills.map((response) => getCreatedBill(response)),
      );
      const chargeItems = loaded.flatMap((bill) =>
        bill.items
          .filter((item) => item.studentChargeId)
          .map((item) => ({
            studentId: bill.studentId,
            description: item.description.replace(`${MARKER} `, ""),
            quantity: Number(item.quantity),
            amount: Number(item.amount),
          })),
      );
      assert.ok(chargeItems.some((item) =>
        item.description === "BUS Monthly" && item.quantity === 3 && item.amount === 4500
      ), `Monthly charge mismatch: ${JSON.stringify(chargeItems)}`);
      assert.ok(chargeItems.some((item) =>
        item.description === "Student Misc One-Time" && item.quantity === 1 && item.amount === 700
      ), `One-time charge mismatch: ${JSON.stringify(chargeItems)}`);
      assert.ok(chargeItems.some((item) =>
        item.description === "BUS Term Quantity Two" && item.quantity === 2 && item.amount === 800
      ), `Term charge mismatch: ${JSON.stringify(chargeItems)}`);
      assert.ok(chargeItems.some((item) =>
        item.description === "BUS Annual Quantity Three" && item.quantity === 3 && item.amount === 600
      ), `Annual charge mismatch: ${JSON.stringify(chargeItems)}`);
      return { chargeItems };
    }, "HIGH");

    await run("SC02", "Unpaid first bill does not repeat charges", "Unpaid first bill retains its charges; later bill adds neither duplicate charges nor old balances", async () => {
      const firstBill = await getCreatedBill(
        await createBill("S003", "P1", "SC02-first"),
      );
      const secondBill = await getCreatedBill(
        await createBill("S003", "P2", "SC02-second"),
      );
      assert.equal(firstBill.status, "UNPAID");
      assert.equal(
        firstBill.items.filter((item) => item.studentChargeId).length,
        2,
      );
      assert.equal(
        secondBill.items.filter((item) => item.studentChargeId).length,
        0,
      );
      assert.equal(Number(firstBill.totalAmount), 26700);
      assert.equal(Number(secondBill.totalAmount), 17300);
      const profile = await api.getStudentProfile(
        student("S003"),
        fixture.academicYearId,
      );
      assert.equal(profile.status, 200);
      const statementBills = profile.body.financial.bills;
      assert.equal(
        statementBills.find((bill) => bill.id === firstBill.id).remainingAmount,
        26700,
      );
      assert.equal(
        statementBills.find((bill) => bill.id === secondBill.id).remainingAmount,
        17300,
      );
      assert.equal(profile.body.financial.summary.remainingDue, 44000);
      return {
        firstBill: { status: firstBill.status, total: Number(firstBill.totalAmount), studentChargeItems: 2 },
        secondBill: { total: Number(secondBill.totalAmount), studentChargeItems: 0 },
        statement: {
          originalBillDue: 26700,
          subsequentBillDue: 17300,
          totalDue: profile.body.financial.summary.remainingDue,
        },
      };
    });

    await run("SC03", "Partial first bill does not repeat charges", "Partial settlement stays on the original bill; later bill has no duplicate charge or balance", async () => {
      const firstBill = await getCreatedBill(
        await createBill("S003", "P1", "SC03-first"),
      );
      assert.equal((await createPayment(firstBill.id, 100)).status, 201);
      const secondBill = await getCreatedBill(
        await createBill("S003", "P2", "SC03-second"),
      );
      const persistedFirstBill = await loadBill(prisma, firstBill.id);
      const originalOutstanding =
        Number(persistedFirstBill.totalAmount) -
        Number(persistedFirstBill.paidAmount);
      assert.equal(persistedFirstBill.status, "PARTIAL");
      assert.equal(originalOutstanding, 26600);
      assert.equal(
        secondBill.items.filter((item) => item.studentChargeId).length,
        0,
      );
      assert.equal(Number(secondBill.totalAmount), 17300);
      const profile = await api.getStudentProfile(
        student("S003"),
        fixture.academicYearId,
      );
      assert.equal(profile.status, 200);
      assert.equal(
        profile.body.financial.bills.find(
          (bill) => bill.id === firstBill.id,
        ).remainingAmount,
        26600,
      );
      assert.equal(
        profile.body.financial.bills.find(
          (bill) => bill.id === secondBill.id,
        ).remainingAmount,
        17300,
      );
      assert.equal(profile.body.financial.summary.remainingDue, 43900);
      return {
        firstBill: { status: persistedFirstBill.status, outstanding: originalOutstanding },
        secondBill: { total: Number(secondBill.totalAmount), studentChargeItems: 0 },
        statement: {
          originalBillDue: 26600,
          subsequentBillDue: 17300,
          totalDue: profile.body.financial.summary.remainingDue,
        },
      };
    });

    await run("SC04", "Charge remains eligible until active dates", "A charge outside one period remains available to the next eligible period", async () => {
      const chargeId = fixture.chargeIds["S005:BUS Monthly"];
      const originalCharge = await prisma.studentCharge.findUniqueOrThrow({
        where: { id: chargeId },
      });
      try {
        await prisma.studentCharge.update({
          where: { id: chargeId },
          data: {
            startDate: bsToDate(2083, 4, 1),
            endDate: bsToDate(2083, 4, 1),
          },
        });
        const earlyBill = await getCreatedBill(
          await createBill("S005", "P1", "SC04-early"),
        );
        assert.equal(
          earlyBill.items.some((item) => item.studentChargeId === chargeId),
          false,
        );
        const eligibleBill = await getCreatedBill(
          await createBill("S005", "P2", "SC04-eligible"),
        );
        const chargeItem = eligibleBill.items.find(
          (item) => item.studentChargeId === chargeId,
        );
        assert.ok(chargeItem);
        assert.equal(Number(chargeItem.quantity), 1);
        assert.equal(Number(chargeItem.amount), 1200);
        return {
          earlyBillChargeItems: 0,
          eligibleBillCharge: { quantity: Number(chargeItem.quantity), amount: Number(chargeItem.amount) },
        };
      } finally {
        await prisma.studentCharge.update({
          where: { id: chargeId },
          data: {
            startDate: originalCharge.startDate,
            endDate: originalCharge.endDate,
            updatedAt: originalCharge.updatedAt,
          },
        });
      }
    });

    await run("SC05", "Unpaid cancelled bill releases its charge", "Cancelled bill remains for audit and charge appears once on its replacement", async () => {
      const cancelledBill = await getCreatedBill(
        await createBill("S003", "P1", "SC05-original"),
      );
      const originalCharges = cancelledBill.items.filter(
        (item) => item.studentChargeId,
      );
      assert.equal((await api.cancelBill(cancelledBill.id)).status, 200);
      const replacementBill = await getCreatedBill(
        await createBill("S003", "P1", "SC05-replacement"),
      );
      const retainedBill = await loadBill(prisma, cancelledBill.id);
      const activeApplications =
        await prisma.studentChargeApplication.findMany({
          where: {
            studentChargeId: {
              in: originalCharges.map((item) => item.studentChargeId),
            },
            isActive: true,
          },
        });
      const releasedApplications =
        await prisma.studentChargeApplication.findMany({
          where: {
            billId: cancelledBill.id,
            isActive: false,
            releaseReason: "CANCELLED_UNPAID",
          },
        });
      assert.equal(retainedBill.status, "CANCELLED");
      assert.equal(
        retainedBill.items.filter((item) => item.studentChargeId).length,
        originalCharges.length,
      );
      assert.equal(
        replacementBill.items.filter((item) => item.studentChargeId).length,
        originalCharges.length,
      );
      assert.equal(activeApplications.length, originalCharges.length);
      assert.equal(releasedApplications.length, originalCharges.length);
      const profile = await api.getStudentProfile(
        student("S003"),
        fixture.academicYearId,
      );
      assert.equal(profile.status, 200);
      assert.equal(
        profile.body.financial.bills.find(
          (bill) => bill.id === cancelledBill.id,
        ).remainingAmount,
        0,
      );
      assert.equal(
        profile.body.financial.bills.find(
          (bill) => bill.id === replacementBill.id,
        ).remainingAmount,
        26700,
      );
      assert.equal(profile.body.financial.summary.remainingDue, 26700);
      return {
        cancelledBill: { status: retainedBill.status, studentChargeItems: originalCharges.length },
        replacementBill: { status: replacementBill.status, studentChargeItems: originalCharges.length },
        activeApplications: activeApplications.length,
        releasedApplications: releasedApplications.length,
        statement: {
          cancelledBillDue: 0,
          replacementBillDue: 26700,
          totalDue: profile.body.financial.summary.remainingDue,
        },
      };
    }, "HIGH");

    await run("SC06", "Settled bill cannot release its charge", "Cancellation requires reversal or credit handling before rebilling", async () => {
      const firstBill = await getCreatedBill(
        await createBill("S003", "P1", "SC06-first"),
      );
      assert.equal((await createPayment(firstBill.id, 100)).status, 201);
      const cancellation = await api.cancelBill(firstBill.id);
      assert.equal(cancellation.status, 409);
      const activeApplications =
        await prisma.studentChargeApplication.count({
          where: { billId: firstBill.id, isActive: true },
        });
      const secondBill = await getCreatedBill(
        await createBill("S003", "P2", "SC06-second"),
      );
      const retainedBill = await loadBill(prisma, firstBill.id);
      assert.equal(retainedBill.status, "PARTIAL");
      assert.equal(activeApplications, 2);
      assert.equal(
        secondBill.items.filter((item) => item.studentChargeId).length,
        0,
      );
      return {
        cancellationStatus: cancellation.status,
        originalStatus: retainedBill.status,
        activeApplications,
        nextBillStudentChargeItems: 0,
      };
    }, "HIGH");

    await run("SC07", "Concurrent bills apply each charge once", "Concurrent non-overlapping bills create one application per student charge", async () => {
      const responses = await Promise.all([
        createBill("S003", "P1", "SC07-first"),
        createBill("S003", "P2", "SC07-second"),
      ]);
      responses.forEach((response) =>
        assert.equal(response.status, 201, JSON.stringify(response.body)),
      );
      const billIds = responses.map((response) => response.body.bill.id);
      const chargeItems = await prisma.billItem.findMany({
        where: {
          billId: { in: billIds },
          studentChargeId: { not: null },
        },
        select: { studentChargeId: true },
      });
      const applications =
        await prisma.studentChargeApplication.findMany({
          where: {
            studentChargeId: {
              in: [
                fixture.chargeIds["S003:BUS Monthly"],
                fixture.chargeIds["S003:Student Misc One-Time"],
              ],
            },
            isActive: true,
          },
          select: { studentChargeId: true },
        });
      assert.equal(chargeItems.length, 2);
      assert.equal(
        new Set(chargeItems.map((item) => item.studentChargeId)).size,
        2,
      );
      assert.equal(applications.length, 2);
      return {
        billStatuses: responses.map((response) => response.status),
        chargeItemsAcrossBills: chargeItems.length,
        activeApplications: applications.length,
      };
    }, "HIGH");

    await run("B01", "Consecutive non-overlapping periods", "Both bills succeed", async () => {
      const first = await getCreatedBill(await createBill("S001", "P1", "B01-first"));
      const second = await getCreatedBill(await createBill("S001", "P2", "B01-second"));
      return { bills: [first.billNumber, second.billNumber], secondTotal: Number(second.totalAmount) };
    });

    await run("B02", "Partial billing overlap", "Second bill rejected with 409", async () => {
      await getCreatedBill(await createBill("S009", "P1", "B02-first"));
      const second = await createBill("S009", "P5", "B02-overlap");
      assert.equal(second.status, 409);
      return { secondStatus: second.status, error: second.body.error };
    }, "CRITICAL");

    await run("B03", "Contained billing overlap", "Second bill rejected with 409", async () => {
      await getCreatedBill(await createBill("S009", "P6", "B03-first"));
      const second = await createBill("S009", "P7", "B03-overlap");
      assert.equal(second.status, 409);
      return { secondStatus: second.status, error: second.body.error };
    }, "CRITICAL");

    await run("B04", "Exact duplicate period", "Second bill rejected with 409", async () => {
      await getCreatedBill(await createBill("S009", "P1", "B04-first"));
      const second = await createBill("S009", "P1", "B04-repeat");
      assert.equal(second.status, 409);
      return { secondStatus: second.status };
    }, "CRITICAL");

    await run("B08", "Invalid bill inputs", "All invalid requests rejected", async () => {
      const base = makeBillBody("S001", "P1", "B08");
      const requests = [
        { ...base, periodStartMonth: 13 },
        { ...base, periodStartMonth: 5, periodEndMonth: 4 },
        { ...base, periodStartYear: undefined },
        { ...base, periodEndMonth: undefined },
        { ...base, academicYearId: "invalid-academic-year" },
        { ...base, academicYearId: (await prisma.academicYear.findFirst({ where: { schoolId: { not: fixture.schoolId } }, select: { id: true } }))?.id ?? "invalid-year" },
      ];
      const responses = [];
      for (const body of requests) {
        const response = await postJson(api.createBill, body, "/api/bills");
        responses.push(response.status);
        assert.ok(response.status >= 400, JSON.stringify(response.body));
      }
      return { rejectedStatuses: responses };
    });

    await run("B09", "Concurrent identical bill requests", "Exactly one bill is created", async () => {
      const responses = await Promise.all([
        createBill("S009", "P1", "B09-concurrent"),
        createBill("S009", "P1", "B09-concurrent"),
      ]);
      assert.equal(responses.filter((response) => response.status === 201).length, 1);
      assert.equal(responses.filter((response) => response.status === 409).length, 1);
      const count = await prisma.bill.count({
        where: { studentId: student("S009"), academicYearId: fixture.academicYearId, notes: { startsWith: `${MARKER} ${runId} B09` } },
      });
      assert.equal(count, 1);
      return { statuses: responses.map((response) => response.status), persistedBills: count };
    }, "CRITICAL");

    await run("D01", "Annual class fee billed once", "Admission fee appears only in the first eligible bill", async () => {
      const periods = [];
      for (const key of ["P1", "P2", "P3", "P4"]) {
        const bill = await getCreatedBill(await createBill("S001", key, `D01-${key}`));
        periods.push({ period: key, admissionCount: bill.items.filter((item) => item.description === "Admission").length });
      }
      assert.deepEqual(periods.map((item) => item.admissionCount), [1, 0, 0, 0]);
      return periods;
    }, "HIGH");

    await run("D02", "Term fee schedule", "One exam fee in each configured term", async () => {
      const periods = [];
      for (const key of ["P1", "P2", "P3", "P4"]) {
        const bill = await getCreatedBill(await createBill("S001", key, `D02-${key}`));
        periods.push({ period: key, examCount: bill.items.filter((item) => item.description === "Exam").length });
      }
      assert.deepEqual(periods.map((item) => item.examCount), [1, 1, 1, 1]);
      return periods;
    }, "HIGH");

    await run("D03", "Class one-time fee", "Class miscellaneous appears once in the academic year", async () => {
      const periods = [];
      for (const key of ["P1", "P2", "P3", "P4"]) {
        const bill = await getCreatedBill(await createBill("S001", key, `D03-${key}`));
        periods.push({ period: key, oneTimeCount: bill.items.filter((item) => item.description === "Class Miscellaneous").length });
      }
      assert.deepEqual(periods.map((item) => item.oneTimeCount), [1, 0, 0, 0]);
      return periods;
    }, "HIGH");

    await run("D04", "One-time student charge start date", "Charge first appears in its first eligible period only", async () => {
      const startDate = bsToDate(2083, 7, 1);
      const charge = await prisma.studentCharge.create({
        data: {
          studentId: student("S003"),
          academicYearId: fixture.academicYearId,
          description: `${MARKER} D04 Kartik one-time charge`,
          quantity: 1,
          rate: 321,
          amount: 321,
          feeType: "MISCELLANEOUS",
          frequency: "ONE_TIME",
          startDate,
          notes: MARKER,
        },
      });
      try {
        const periods = [];
        for (const key of ["P1", "P2", "P3", "P4"]) {
          const bill = await getCreatedBill(await createBill("S003", key, `D04-${key}`));
          periods.push({ period: key, count: bill.items.filter((item) => item.studentChargeId === charge.id).length });
        }
        assert.deepEqual(periods.map((item) => item.count), [0, 0, 1, 0]);
        return periods;
      } finally {
        await prisma.studentCharge.deleteMany({ where: { id: charge.id } });
      }
    }, "HIGH");

    await run("D05", "Two-month inclusive billing period", "Tuition Rs. 10,000; lab Rs. 1,000", async () => {
      const bill = await getCreatedBill(await createBill("S004", "P5", "D05"));
      const tuition = bill.items.find((item) => item.description === "Tuition");
      const lab = bill.items.find((item) => item.description === "Computer Lab");
      assert.equal(Number(tuition.quantity), 2);
      assert.equal(Number(tuition.amount), 10000);
      assert.equal(Number(lab.amount), 1000);
      return { tuition: Number(tuition.amount), lab: Number(lab.amount), total: Number(bill.totalAmount) };
    });

    await run("F01", "Full payment", "Bill becomes PAID", async () => {
      const bill = await getCreatedBill(await createBill("S001", "P1", "F01"));
      const response = await createPayment(bill.id, 21500);
      assert.equal(response.status, 201, JSON.stringify(response.body));
      const updated = await loadBill(prisma, bill.id);
      verifySettlement(updated, { outstanding: 0, status: "PAID", paidAmount: 21500 });
      return { amount: Number(response.body.payment.amount), status: updated.status };
    });

    await run("F02", "Multiple partial payments", "Total actual payments Rs. 21,500", async () => {
      const bill = await getCreatedBill(await createBill("S001", "P1", "F02"));
      const amounts = [5000, 7000, 4500, 5000];
      for (const amount of amounts) {
        const response = await createPayment(bill.id, amount);
        assert.equal(response.status, 201, JSON.stringify(response.body));
      }
      const updated = await loadBill(prisma, bill.id);
      verifySettlement(updated, { outstanding: 0, status: "PAID", paidAmount: 21500 });
      return { payments: updated.payments.map((payment) => Number(payment.amount)), status: updated.status };
    });

    await run("F03", "Payment plus waiver", "Rs. 8,500 outstanding and PARTIAL", async () => {
      const bill = await getCreatedBill(await createBill("S001", "P1", "F03"));
      const response = await createPayment(bill.id, 10000, 3000, "QA waiver");
      assert.equal(response.status, 201, JSON.stringify(response.body));
      const updated = await loadBill(prisma, bill.id);
      verifySettlement(updated, { outstanding: 8500, status: "PARTIAL", paidAmount: 10000 });
      return { outstanding: 8500, waiver: Number(updated.payments[0].waiverAmount), paidAmount: Number(updated.paidAmount) };
    });

    await run("F04", "Multiple waivers and payments", "Rs. 18,000 paid; Rs. 3,500 waived; PAID", async () => {
      const bill = await getCreatedBill(await createBill("S001", "P1", "F04"));
      for (const [amount, waiver] of [[5000, 2000], [4000, 1500], [9000, 0]]) {
        const response = await createPayment(bill.id, amount, waiver, waiver ? "QA staged waiver" : undefined);
        assert.equal(response.status, 201, JSON.stringify(response.body));
      }
      const updated = await loadBill(prisma, bill.id);
      verifySettlement(updated, { outstanding: 0, status: "PAID", paidAmount: 18000 });
      return { paid: Number(updated.paidAmount), waived: updated.payments.reduce((sum, item) => sum + Number(item.waiverAmount), 0), status: updated.status };
    }, "HIGH");

    await run("F05", "Waiver reason required", "Null, empty, whitespace reasons rejected", async () => {
      const bill = await getCreatedBill(await createBill("S001", "P1", "F05"));
      const cases = [undefined, "", "   "];
      const statuses = [];
      for (const reason of cases) {
        const response = await createPayment(bill.id, 1, 1, reason);
        statuses.push(response.status);
        assert.equal(response.status, 400);
      }
      assert.equal(await prisma.payment.count({ where: { billId: bill.id } }), 0);
      return { statuses };
    });

    await run("F06", "Excessive waiver rejected", "Settlement over bill balance rejected", async () => {
      const bill = await getCreatedBill(await createBill("S001", "P1", "F06"));
      const response = await createPayment(bill.id, 1, 21500, "Too much");
      assert.equal(response.status, 400);
      assert.equal(await prisma.payment.count({ where: { billId: bill.id } }), 0);
      return { status: response.status, error: response.body.error };
    });

    await run("F07", "Payment plus waiver cannot over-settle", "Rs. 22,000 settlement rejected", async () => {
      const bill = await getCreatedBill(await createBill("S001", "P1", "F07"));
      const response = await createPayment(bill.id, 20000, 2000, "Too much");
      assert.equal(response.status, 400);
      return { status: response.status, error: response.body.error };
    });

    await run("F08", "Payment on paid bill rejected", "Further payment rejected", async () => {
      const bill = await getCreatedBill(await createBill("S001", "P1", "F08"));
      assert.equal((await createPayment(bill.id, 21500)).status, 201);
      const response = await createPayment(bill.id, 1);
      assert.equal(response.status, 400);
      return { status: response.status, error: response.body.error };
    });

    await run("F09", "Payment on cancelled bill rejected", "Payment rejected", async () => {
      const bill = await getCreatedBill(await createBill("S001", "P1", "F09"));
      await prisma.bill.update({ where: { id: bill.id }, data: { status: "CANCELLED" } });
      const response = await createPayment(bill.id, 1);
      assert.equal(response.status, 400);
      return { status: response.status, error: response.body.error, cancellationSetup: "Direct QA status update; no cancellation API exists." };
    });

    await run("F10", "Zero and negative payments rejected", "Both requests rejected", async () => {
      const bill = await getCreatedBill(await createBill("S001", "P1", "F10"));
      const statuses = [];
      for (const amount of [0, -1]) {
        const response = await createPayment(bill.id, amount);
        statuses.push(response.status);
        assert.equal(response.status, 400);
      }
      return { statuses };
    });

    await run("F11", "Concurrent payments exceeding balance", "At most one Rs. 7,000 payment accepted on Rs. 10,000 bill", async () => {
      const bill = await getCreatedBill(await createBill("S001", "P1", "F11"));
      await prisma.bill.update({ where: { id: bill.id }, data: { totalAmount: 10000 } });
      const responses = await Promise.all([
        createPayment(bill.id, 7000),
        createPayment(bill.id, 7000),
      ]);
      const accepted = responses.filter((response) => response.status === 201).length;
      const payments = await prisma.payment.findMany({ where: { billId: bill.id } });
      const paid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      assert.equal(accepted, 1);
      assert.ok(paid <= 10000);
      return { statuses: responses.map((response) => response.status), persistedPaymentSum: paid };
    }, "CRITICAL");

    await run("F12", "Duplicate payment request", "Repeated identical request must not post twice", async () => {
      const bill = await getCreatedBill(await createBill("S001", "P1", "F12"));
      const body = { billId: bill.id, amount: 5000, method: "CASH", reference: `${MARKER}-${runId}-F12` };
      const headers = { "Idempotency-Key": `${MARKER}-${runId}-F12` };
      const responses = await Promise.all([
        postJson(api.recordPayment, body, "/api/payments", headers),
        postJson(api.recordPayment, body, "/api/payments", headers),
      ]);
      const reusedKey = await postJson(
        api.recordPayment,
        { ...body, amount: 6000 },
        "/api/payments",
        headers,
      );
      const payments = await prisma.payment.findMany({ where: { billId: bill.id, reference: `${MARKER}-${runId}-F12` } });
      assert.deepEqual(responses.map((response) => response.status).sort(), [200, 201]);
      assert.equal(reusedKey.status, 409);
      assert.equal(payments.length, 1);
      return {
        concurrentStatuses: responses.map((response) => response.status),
        reusedKeyStatus: reusedKey.status,
        persistedDuplicates: payments.length,
      };
    }, "HIGH");
    await run("H01", "Fee change preserves old bill snapshot", "Old line remains unchanged; next period uses new rate", async () => {
      const tuition = await prisma.feeStructure.findFirst({
        where: { id: fixture.feeIds["grade5:TUITION"] },
      });
      try {
        const first = await getCreatedBill(await createBill("S001", "P1", "H01-old"));
        const oldLine = first.items.find((item) => item.description === "Tuition");
        await prisma.feeStructure.update({ where: { id: tuition.id }, data: { amount: 6000 } });
        const second = await getCreatedBill(await createBill("S001", "P2", "H01-new"));
        const preserved = await loadBill(prisma, first.id);
        const newLine = second.items.find((item) => item.description === "Tuition");
        assert.equal(Number(preserved.items.find((item) => item.id === oldLine.id).amount), 15000);
        assert.equal(Number(newLine.amount), 18000);
        return { oldAmount: Number(oldLine.amount), newAmount: Number(newLine.amount) };
      } finally {
        await prisma.feeStructure.update({
          where: { id: tuition.id },
          data: { amount: tuition.amount, updatedAt: tuition.updatedAt },
        });
      }
    });

    await run("H02", "Deactivated class fee excluded from future bills", "Historical item retained; future bill excludes it", async () => {
      const labId = fixture.feeIds["grade5:COMPUTER_LAB"];
      const originalLab = await prisma.feeStructure.findUniqueOrThrow({
        where: { id: labId },
      });
      try {
        const first = await getCreatedBill(await createBill("S001", "P1", "H02-old"));
        await prisma.feeStructure.update({ where: { id: labId }, data: { isActive: false } });
        const second = await getCreatedBill(await createBill("S001", "P2", "H02-new"));
        const preserved = await loadBill(prisma, first.id);
        const oldHasLab = preserved.items.some((item) => item.description === "Computer Lab");
        const newHasLab = second.items.some((item) => item.description === "Computer Lab");
        assert.equal(oldHasLab, true);
        assert.equal(newHasLab, false);
        return { oldBillHasLab: oldHasLab, newBillHasLab: newHasLab };
      } finally {
        await prisma.feeStructure.update({
          where: { id: labId },
          data: {
            isActive: originalLab.isActive,
            updatedAt: originalLab.updatedAt,
          },
        });
      }
    });

    await run("H03", "Student charge edits and deletion preserve historical bill items", "Changing or deleting a source charge leaves its original bill-item snapshot unchanged", async () => {
      const busChargeId = fixture.chargeIds["S003:BUS Monthly"];
      const originalBus = await prisma.studentCharge.findUniqueOrThrow({
        where: { id: busChargeId },
      });
      const temporaryCharge = await prisma.studentCharge.create({
        data: {
          studentId: student("S003"),
          academicYearId: fixture.academicYearId,
          description: `${MARKER} ${runId} H03 temporary charge`,
          feeType: "MISCELLANEOUS",
          frequency: "ONE_TIME",
          quantity: 1,
          rate: 321,
          amount: 321,
          startDate: bsToDate(2083, 1, 1),
          notes: `${MARKER} ${runId}`,
        },
        select: { id: true },
      });
      try {
        const bill = await getCreatedBill(
          await createBill("S003", "P1", "H03"),
        );
        const originalItems = bill.items
          .filter((item) => item.studentChargeId)
          .map((item) => ({
            id: item.id,
            description: item.description,
            quantity: Number(item.quantity),
            rate: Number(item.rate),
            amount: Number(item.amount),
            netAmount: Number(item.netAmount),
          }));
        await prisma.studentCharge.update({
          where: { id: busChargeId },
          data: { description: `${MARKER} Edited BUS`, rate: 2500 },
        });
        const deletion = await api.deleteStudentCharge(temporaryCharge.id);
        assert.equal(deletion.status, 200);
        const preserved = await loadBill(prisma, bill.id);
        const preservedItems = preserved.items
          .filter((item) =>
            originalItems.some((original) => original.id === item.id),
          )
          .map((item) => ({
            id: item.id,
            description: item.description,
            quantity: Number(item.quantity),
            rate: Number(item.rate),
            amount: Number(item.amount),
            netAmount: Number(item.netAmount),
          }));
        assert.deepEqual(preservedItems, originalItems);
        const applications =
          await prisma.studentChargeApplication.count({
            where: { billId: bill.id, isActive: true },
          });
        assert.equal(applications, originalItems.length);
        return {
          unchangedBillItemSnapshots: preservedItems.length,
          activeApplications: applications,
          deletedChargeStatus: deletion.status,
        };
      } finally {
        await prisma.studentCharge.update({
          where: { id: busChargeId },
          data: {
            description: originalBus.description,
            rate: originalBus.rate,
            amount: originalBus.amount,
            updatedAt: originalBus.updatedAt,
          },
        });
        await prisma.studentCharge.deleteMany({
          where: { id: temporaryCharge.id },
        });
      }
    }, "HIGH");

    await run("H04", "Class change preserves historical fees", "Old Grade 5 bill retained; next bill uses Grade 6 fees", async () => {
      const enrollment = await prisma.enrollment.findUnique({
        where: { studentId_academicYearId: { studentId: student("S001"), academicYearId: fixture.academicYearId } },
      });
      assert.ok(enrollment, "Fixture enrollment was not found.");
      try {
        const first = await getCreatedBill(await createBill("S001", "P1", "H04-old"));
        await prisma.enrollment.update({
          where: { studentId_academicYearId: { studentId: student("S001"), academicYearId: fixture.academicYearId } },
          data: { classId: fixture.classIds.grade6 },
        });
        const second = await getCreatedBill(await createBill("S001", "P2", "H04-new"));
        const oldBill = await loadBill(prisma, first.id);
        assert.equal(Number(oldBill.items.find((item) => item.description === "Tuition").rate), 5000);
        assert.equal(Number(second.items.find((item) => item.description === "Tuition").rate), 6000);
        return { oldRate: 5000, newRate: 6000 };
      } finally {
        await prisma.enrollment.update({
          where: { studentId_academicYearId: { studentId: student("S001"), academicYearId: fixture.academicYearId } },
          data: {
            classId: enrollment.classId,
            updatedAt: enrollment.updatedAt,
          },
        });
      }
    });

    await run("H05", "Missing enrollment rejected", "A student without selected-year enrollment is rejected", async () => {
      const unEnrolledStudent = await prisma.student.create({
        data: {
          schoolId: fixture.schoolId,
          admissionNumber: `${MARKER}_${runId}_H05`,
          firstName: "Temporary",
          lastName: "No Enrollment",
        },
        select: { id: true },
      });
      try {
        const response = await postJson(
          api.createBill,
          {
            ...makeBillBody("S001", "P1", "H05"),
            studentId: unEnrolledStudent.id,
            academicYearId: fixture.academicYearId,
          },
          "/api/bills",
        );
        assert.equal(response.status, 400);
        assert.equal(
          await prisma.bill.count({
            where: { studentId: unEnrolledStudent.id },
          }),
          0,
        );
        return { status: response.status, error: response.body.error };
      } finally {
        await prisma.student.delete({
          where: { id: unEnrolledStudent.id },
        });
      }
    });

    await run("I03", "Concurrent unique bill numbers", "All concurrently created bill numbers are unique", async () => {
      const responses = await Promise.all([
        createBill("S001", "P1", "I03-A"),
        createBill("S002", "P1", "I03-B"),
      ]);
      const successful = responses.filter((response) => response.status === 201);
      const numbers = successful.map((response) => response.body.bill.billNumber);
      assert.equal(successful.length, 2, JSON.stringify(responses.map((response) => ({ status: response.status, body: response.body }))));
      assert.equal(new Set(numbers).size, numbers.length);
      return { statuses: responses.map((response) => response.status), billNumbers: numbers };
    }, "CRITICAL");
    await run("I05", "Financial history after student deletion", "Historical bills must not be silently deleted", async () => {
      const bill = await getCreatedBill(await createBill("S010", "P1", "I05"));
      const deleteResponse = await api.deleteStudent(student("S010"));
      assert.equal(deleteResponse.status, 409);
      await assert.rejects(
        prisma.student.delete({ where: { id: student("S010") } }),
      );
      const afterDelete = await prisma.bill.findUnique({ where: { id: bill.id } });
      assert.ok(afterDelete, "Deleting a student removed the historical bill.");
      return { deleteStatus: deleteResponse.status, billRetained: Boolean(afterDelete) };
    }, "CRITICAL");

    await run("I06", "Database relationship integrity", "All bill items and payments reference valid parents", async () => {
      const bill = await getCreatedBill(await createBill("S001", "P1", "I06"));
      await createPayment(bill.id, 100);
      const persisted = await loadBill(prisma, bill.id);
      assert.ok(persisted.items.every((item) => item.billId === persisted.id));
      assert.ok(persisted.payments.every((payment) => payment.billId === persisted.id));
      assert.ok(persisted.academicYearId === fixture.academicYearId);
      return { billItems: persisted.items.length, payments: persisted.payments.length, billNumber: persisted.billNumber };
    });

    await run("B06", "Multi-year billing, payment, and duplicate prevention", "Previous-year balance remains on its original bill; new-year fees and discount calculate independently", async () => {
      const previousBill = await getCreatedBill(
        await createBill("S001", "P1", "B06-previous"),
      );
      await createPayment(previousBill.id, 1000);

      const discountResponse = await createDiscount({
        studentId: student("S001"),
        academicYearId: fixture.nextAcademicYearId,
        name: `${MARKER} 2084 tuition discount`,
        percentage: 10,
        feeTypes: ["TUITION"],
        startDate: bsToDate(2084, 1, 1).toISOString(),
      });
      assert.equal(discountResponse.status, 201, JSON.stringify(discountResponse.body));

      try {
        const nextYearResponse = await postJson(
          api.createBill,
          makeBillBodyForYear(
            "S001",
            fixture.nextAcademicYearId,
            2084,
            "P1",
            "B06-new-year",
          ),
          "/api/bills",
        );
        const nextYearBill = await getCreatedBill(nextYearResponse);
        assert.equal(Number(nextYearBill.totalAmount), 26440);
        assert.equal(Number(nextYearBill.discountAmount), 2160);
        assert.equal(
          nextYearBill.items.some((item) => item.description.includes("2083")),
          false,
        );
        await createPayment(nextYearBill.id, 1000);

        const duplicate = await postJson(
          api.createBill,
          makeBillBodyForYear(
            "S001",
            fixture.nextAcademicYearId,
            2084,
            "P1",
            "B06-duplicate",
          ),
          "/api/bills",
        );
        assert.equal(duplicate.status, 409);

        const [previousStatement, currentStatement] = await Promise.all([
          api.getStudentProfile(student("S001"), fixture.academicYearId),
          api.getStudentProfile(student("S001"), fixture.nextAcademicYearId),
        ]);
        assert.equal(previousStatement.status, 200);
        assert.equal(currentStatement.status, 200);
        assert.equal(previousStatement.body.financial.summary.remainingDue, 20500);
        assert.equal(previousStatement.body.financial.bills[0].remainingAmount, 20500);
        assert.equal(currentStatement.body.financial.summary.remainingDue, 25440);
        assert.equal(currentStatement.body.financial.summary.totalPaid, 1000);

        return {
          previousYearDue: previousStatement.body.financial.summary.remainingDue,
          nextYearBill: Number(nextYearBill.totalAmount),
          nextYearDiscount: Number(nextYearBill.discountAmount),
          nextYearDue: currentStatement.body.financial.summary.remainingDue,
          duplicateStatus: duplicate.status,
        };
      } finally {
        await prisma.studentDiscount.delete({
          where: { id: discountResponse.body.id },
        });
      }
    }, "HIGH");

    const discountFor = (studentKey, name, startDate, endDate = null, feeTypes = ["TUITION"], percentage = 10) => ({
      studentId: student(studentKey),
      academicYearId: fixture.academicYearId,
      name: `${MARKER} ${name}`,
      percentage,
      feeTypes,
      startDate: startDate.toISOString(),
      ...(endDate ? { endDate: endDate.toISOString() } : {}),
    });

    await run("C01", "Discount begins before billing period", "Pre-period start remains eligible for all three monthly fee months", async () => {
      const created = await createDiscount(
        discountFor("S001", "C01", bsToDate(2082, 12, 1)),
      );
      assert.equal(created.status, 201, JSON.stringify(created.body));
      try {
        const bill = await getCreatedBill(await createBill("S001", "P1", "C01"));
        const tuition = bill.items.find((item) => item.feeType === "TUITION");
        assert.equal(Number(tuition.discountAmount), 1500);
        assert.equal(Number(bill.discountAmount), 1500);
        return { tuitionDiscount: Number(tuition.discountAmount) };
      } finally {
        await prisma.studentDiscount.delete({ where: { id: created.body.id } });
      }
    });

    await run("C02", "Discount ends at billing-period boundary", "Inclusive end on the final billing day discounts all three monthly fee months", async () => {
      const periodEnd = new Date(bsToDate(2083, 4, 1).getTime() - 1);
      const created = await createDiscount(
        discountFor("S001", "C02", bsToDate(2083, 1, 1), periodEnd),
      );
      assert.equal(created.status, 201, JSON.stringify(created.body));
      try {
        const bill = await getCreatedBill(await createBill("S001", "P1", "C02"));
        const tuition = bill.items.find((item) => item.feeType === "TUITION");
        assert.equal(Number(tuition.discountAmount), 1500);
        return { periodEnd: periodEnd.toISOString(), tuitionDiscount: Number(tuition.discountAmount) };
      } finally {
        await prisma.studentDiscount.delete({ where: { id: created.body.id } });
      }
    });

    await run("C03", "Discount begins after billing period", "No discount is applied before its start date", async () => {
      const created = await createDiscount(
        discountFor("S001", "C03", bsToDate(2083, 4, 1)),
      );
      assert.equal(created.status, 201, JSON.stringify(created.body));
      try {
        const bill = await getCreatedBill(await createBill("S001", "P1", "C03"));
        const tuition = bill.items.find((item) => item.feeType === "TUITION");
        assert.equal(Number(tuition.discountAmount), 0);
        assert.equal(Number(bill.discountAmount), 0);
        return { tuitionDiscount: Number(tuition.discountAmount) };
      } finally {
        await prisma.studentDiscount.delete({ where: { id: created.body.id } });
      }
    });

    await run("C04", "Expired discount", "A discount ending before the billing period is excluded", async () => {
      const created = await createDiscount(
        discountFor(
          "S001",
          "C04",
          bsToDate(2082, 12, 1),
          new Date(bsToDate(2083, 1, 1).getTime() - 1),
        ),
      );
      assert.equal(created.status, 201, JSON.stringify(created.body));
      try {
        const bill = await getCreatedBill(await createBill("S001", "P1", "C04"));
        const tuition = bill.items.find((item) => item.feeType === "TUITION");
        assert.equal(Number(tuition.discountAmount), 0);
        return { tuitionDiscount: Number(tuition.discountAmount) };
      } finally {
        await prisma.studentDiscount.delete({ where: { id: created.body.id } });
      }
    });

    await run("C05", "Partial-period monthly discount", "Only the one eligible month of three receives the 10% tuition discount", async () => {
      const created = await createDiscount(
        discountFor(
          "S001",
          "C05",
          bsToDate(2083, 2, 1),
          new Date(bsToDate(2083, 3, 1).getTime() - 1),
        ),
      );
      assert.equal(created.status, 201, JSON.stringify(created.body));
      try {
        const bill = await getCreatedBill(await createBill("S001", "P1", "C05"));
        const tuition = bill.items.find((item) => item.feeType === "TUITION");
        assert.equal(Number(tuition.amount), 15000);
        assert.equal(Number(tuition.discountAmount), 500);
        assert.equal(Number(tuition.netAmount), 14500);
        assert.ok(
          bill.items
            .filter((item) => item.studentChargeId)
            .every((item) => Number(item.discountAmount) === 0),
        );
        return {
          tuitionAmount: Number(tuition.amount),
          tuitionDiscount: Number(tuition.discountAmount),
          tuitionNet: Number(tuition.netAmount),
        };
      } finally {
        await prisma.studentDiscount.delete({ where: { id: created.body.id } });
      }
    }, "HIGH");

    await run("C06", "Overlapping and adjacent discounts", "Overlapping fee/date ranges return 409; a discount starting the following day is accepted", async () => {
      const firstEnd = new Date(bsToDate(2083, 4, 1).getTime() - 1);
      const first = await createDiscount(
        discountFor("S001", "C06 first", bsToDate(2083, 1, 1), firstEnd),
      );
      assert.equal(first.status, 201, JSON.stringify(first.body));
      try {
        const overlap = await createDiscount(
          discountFor("S001", "C06 overlap", firstEnd, bsToDate(2083, 5, 1)),
        );
        assert.equal(overlap.status, 409);

        const adjacent = await createDiscount(
          discountFor("S001", "C06 adjacent", bsToDate(2083, 4, 1)),
        );
        assert.equal(adjacent.status, 201, JSON.stringify(adjacent.body));
        try {
          const discountCount = await prisma.studentDiscount.count({
            where: { studentId: student("S001"), academicYearId: fixture.academicYearId },
          });
          assert.equal(discountCount, 2);
          return {
            overlapStatus: overlap.status,
            adjacentStatus: adjacent.status,
            savedDiscounts: discountCount,
          };
        } finally {
          await prisma.studentDiscount.delete({ where: { id: adjacent.body.id } });
        }
      } finally {
        await prisma.studentDiscount.delete({ where: { id: first.body.id } });
      }
    });

    await run("C07", "Discount edit preserves historical bill snapshot", "Existing bill keeps its 10% discount; next bill uses the edited 20% discount", async () => {
      const discount = await createDiscount(
        discountFor(
          "S001",
          "C07",
          bsToDate(2083, 1, 1),
          new Date(bsToDate(2083, 4, 1).getTime() - 1),
        ),
      );
      assert.equal(discount.status, 201, JSON.stringify(discount.body));
      try {
        const first = await getCreatedBill(await createBill("S001", "P1", "C07-old"));
        const updated = await updateDiscount({
          id: discount.body.id,
          name: `${MARKER} C07 updated`,
          percentage: 20,
          feeTypes: ["TUITION"],
          startDate: bsToDate(2083, 4, 1).toISOString(),
          endDate: null,
          isActive: true,
        });
        assert.equal(updated.status, 200, JSON.stringify(updated.body));
        const second = await getCreatedBill(await createBill("S001", "P2", "C07-new"));
        const preserved = await loadBill(prisma, first.id);
        assert.equal(Number(preserved.items.find((item) => item.feeType === "TUITION").discountAmount), 1500);
        assert.equal(Number(second.items.find((item) => item.feeType === "TUITION").discountAmount), 3000);
        return { oldDiscount: 1500, newDiscount: 3000 };
      } finally {
        await prisma.studentDiscount.delete({ where: { id: discount.body.id } });
      }
    });

    await run("E01", "Unpaid prior bill remains on original bill", "New bill excludes prior unpaid balance; account statement retains both bill dues", async () => {
      const oldBill = await getCreatedBill(await createBill("S001", "P1", "E01-old"));
      const newBill = await getCreatedBill(await createBill("S001", "P2", "E01-new"));
      const statement = await api.getStudentProfile(student("S001"), fixture.academicYearId);
      assert.equal(statement.status, 200);
      assert.equal(Number(oldBill.totalAmount), 21500);
      assert.equal(Number(newBill.totalAmount), 17300);
      assert.equal(statement.body.financial.summary.remainingDue, 38800);
      assert.deepEqual(
        statement.body.financial.bills.map((bill) => bill.remainingAmount).sort((a, b) => a - b),
        [17300, 21500],
      );
      return {
        previousBillDue: oldBill.totalAmount,
        nextBillTotal: newBill.totalAmount,
        statementDue: statement.body.financial.summary.remainingDue,
      };
    }, "HIGH");

    await run("E02", "Partial prior bill remains on original bill", "Prior bill retains its Rs. 16,500 balance; new bill does not carry it forward", async () => {
      const oldBill = await getCreatedBill(await createBill("S001", "P1", "E02-old"));
      await createPayment(oldBill.id, 5000);
      const newBill = await getCreatedBill(await createBill("S001", "P2", "E02-new"));
      const statement = await api.getStudentProfile(student("S001"), fixture.academicYearId);
      const oldStatementBill = statement.body.financial.bills.find((bill) => bill.id === oldBill.id);
      assert.equal(Number(oldStatementBill.remainingAmount), 16500);
      assert.equal(Number(newBill.totalAmount), 17300);
      assert.equal(statement.body.financial.summary.remainingDue, 33800);
      return {
        priorBillDue: oldStatementBill.remainingAmount,
        nextBillTotal: newBill.totalAmount,
        statementDue: statement.body.financial.summary.remainingDue,
      };
    }, "HIGH");

    await run("E03", "Multiple prior payments remain allocated to original bill", "Three payments reduce only the original bill; the subsequent bill contains no prior balance", async () => {
      const oldBill = await getCreatedBill(await createBill("S001", "P1", "E03-old"));
      for (const amount of [1000, 2500, 500]) {
        await createPayment(oldBill.id, amount);
      }
      const newBill = await getCreatedBill(await createBill("S001", "P2", "E03-new"));
      const statement = await api.getStudentProfile(student("S001"), fixture.academicYearId);
      assert.equal(Number(newBill.totalAmount), 17300);
      assert.equal(statement.body.financial.summary.totalPaid, 4000);
      assert.equal(statement.body.financial.summary.remainingDue, 34800);
      return {
        paymentCount: statement.body.financial.payments.length,
        paidAmount: statement.body.financial.summary.totalPaid,
        nextBillTotal: newBill.totalAmount,
        statementDue: statement.body.financial.summary.remainingDue,
      };
    }, "HIGH");

    await run("E04", "Fully settled prior bill is not carried forward", "A paid prior bill has zero due; new bill contains only new-year charges", async () => {
      const oldBill = await getCreatedBill(await createBill("S001", "P1", "E04-old"));
      await createPayment(oldBill.id, Number(oldBill.totalAmount));
      const newBill = await getCreatedBill(await createBill("S001", "P2", "E04-new"));
      const statement = await api.getStudentProfile(student("S001"), fixture.academicYearId);
      const oldStatementBill = statement.body.financial.bills.find((bill) => bill.id === oldBill.id);
      assert.equal(Number(oldStatementBill.remainingAmount), 0);
      assert.equal(Number(newBill.totalAmount), 17300);
      assert.equal(Number(statement.body.financial.summary.remainingDue), 17300);
      return {
        oldStatus: oldStatementBill.status,
        oldDue: oldStatementBill.remainingAmount,
        nextBillTotal: newBill.totalAmount,
        statementDue: statement.body.financial.summary.remainingDue,
      };
    }, "HIGH");

    await run("F11-concurrent-waiver", "Concurrent payment and waiver cannot over-settle", "Only one settlement succeeds; total payment plus waiver stays within the bill balance", async () => {
      const bill = await getCreatedBill(await createBill("S009", "P1", "F11-waiver"));
      const responses = await Promise.all([
        createPayment(bill.id, 8000, 7000, "Concurrent QA waiver"),
        createPayment(bill.id, 8000, 7000, "Concurrent QA waiver"),
      ]);
      assert.deepEqual(
        responses.map((response) => response.status).sort(),
        [201, 400],
      );
      const persisted = await loadBill(prisma, bill.id);
      const paid = persisted.payments.reduce(
        (sum, payment) => sum + Number(payment.amount),
        0,
      );
      const waived = persisted.payments.reduce(
        (sum, payment) => sum + Number(payment.waiverAmount),
        0,
      );
      assert.equal(paid + waived, 15000);
      assert.equal(Number(persisted.totalAmount) - paid - waived, 6500);
      assert.equal(persisted.status, "PARTIAL");
      assert.equal(Number(persisted.paidAmount), paid);
      return {
        statuses: responses.map((response) => response.status),
        paid,
        waived,
        remainingDue: Number(persisted.totalAmount) - paid - waived,
      };
    }, "CRITICAL");

    await run("G01", "Decimal amounts and fractional discount rounding", "Rs. 0.15 fee rounds 50% discount to Rs. 0.08 and net to Rs. 0.07", async () => {
      const feeId = fixture.feeIds["grade5:COMPUTER_LAB"];
      const originalFee = await prisma.feeStructure.findUniqueOrThrow({ where: { id: feeId } });
      const discount = await createDiscount(
        discountFor("S001", "G01 decimal", bsToDate(2083, 1, 1), null, ["COMPUTER_LAB"], 50),
      );
      assert.equal(discount.status, 201, JSON.stringify(discount.body));
      try {
        await prisma.feeStructure.update({ where: { id: feeId }, data: { amount: 0.05 } });
        const bill = await getCreatedBill(await createBill("S001", "P1", "G01"));
        const lab = bill.items.find((item) => item.feeType === "COMPUTER_LAB");
        assert.equal(Number(lab.amount), 0.15);
        assert.equal(Number(lab.discountAmount), 0.08);
        assert.equal(Number(lab.netAmount), 0.07);
        assert.equal(Number(bill.totalAmount), 20000.07);
        return {
          amount: Number(lab.amount),
          discount: Number(lab.discountAmount),
          net: Number(lab.netAmount),
          billTotal: Number(bill.totalAmount),
        };
      } finally {
        await prisma.studentDiscount.delete({ where: { id: discount.body.id } });
        await prisma.feeStructure.update({
          where: { id: feeId },
          data: { amount: originalFee.amount, updatedAt: originalFee.updatedAt },
        });
      }
    });

    await run("G02", "Smallest positive fee and rounding", "Rs. 0.03 fee rounds a 50% discount to Rs. 0.02 and preserves a Rs. 0.01 balance", async () => {
      const feeId = fixture.feeIds["grade5:COMPUTER_LAB"];
      const originalFee = await prisma.feeStructure.findUniqueOrThrow({ where: { id: feeId } });
      const discount = await createDiscount(
        discountFor("S001", "G02 small", bsToDate(2083, 1, 1), null, ["COMPUTER_LAB"], 50),
      );
      assert.equal(discount.status, 201, JSON.stringify(discount.body));
      try {
        await prisma.feeStructure.update({ where: { id: feeId }, data: { amount: 0.01 } });
        const bill = await getCreatedBill(await createBill("S001", "P1", "G02"));
        const lab = bill.items.find((item) => item.feeType === "COMPUTER_LAB");
        assert.equal(Number(lab.amount), 0.03);
        assert.equal(Number(lab.discountAmount), 0.02);
        assert.equal(Number(lab.netAmount), 0.01);
        assert.equal(Number(bill.totalAmount), 20000.01);
        return { amount: Number(lab.amount), discount: Number(lab.discountAmount), net: Number(lab.netAmount) };
      } finally {
        await prisma.studentDiscount.delete({ where: { id: discount.body.id } });
        await prisma.feeStructure.update({
          where: { id: feeId },
          data: { amount: originalFee.amount, updatedAt: originalFee.updatedAt },
        });
      }
    });

    await run("G03", "Large amount precision", "Large monthly fee, percentage discount, and bill total remain cent-accurate", async () => {
      const feeId = fixture.feeIds["grade5:TUITION"];
      const originalFee = await prisma.feeStructure.findUniqueOrThrow({ where: { id: feeId } });
      const discount = await createDiscount(
        discountFor("S001", "G03 large", bsToDate(2083, 1, 1), null, ["TUITION"], 10),
      );
      assert.equal(discount.status, 201, JSON.stringify(discount.body));
      try {
        await prisma.feeStructure.update({
          where: { id: feeId },
          data: { amount: 9999999999.99 },
        });
        const bill = await getCreatedBill(await createBill("S001", "P1", "G03"));
        const tuition = bill.items.find((item) => item.feeType === "TUITION");
        assert.equal(Number(tuition.amount), 29999999999.97);
        assert.equal(Number(tuition.discountAmount), 3000000000);
        assert.equal(Number(tuition.netAmount), 26999999999.97);
        assert.equal(
          Number(bill.totalAmount),
          bill.items.reduce((sum, item) => sum + Number(item.netAmount), 0),
        );
        return {
          tuitionAmount: Number(tuition.amount),
          tuitionDiscount: Number(tuition.discountAmount),
          tuitionNet: Number(tuition.netAmount),
          billTotal: Number(bill.totalAmount),
        };
      } finally {
        await prisma.studentDiscount.delete({ where: { id: discount.body.id } });
        await prisma.feeStructure.update({
          where: { id: feeId },
          data: { amount: originalFee.amount, updatedAt: originalFee.updatedAt },
        });
      }
    }, "HIGH");

    await run("G04", "Zero, negative, and excessive amounts", "Zero-value bills and negative fees/payments are rejected; overpayment leaves balances unchanged", async () => {
      const zeroFee = await createFee({
        academicYearId: fixture.academicYearId,
        classId: fixture.classIds.grade5,
        feeType: "MISCELLANEOUS",
        name: `${MARKER} zero fee`,
        amount: 0,
        frequency: "MONTHLY",
      });
      try {
        assert.equal(zeroFee.status, 201, JSON.stringify(zeroFee.body));
        const negativeFee = await createFee({
          academicYearId: fixture.academicYearId,
          classId: fixture.classIds.grade5,
          feeType: "MISCELLANEOUS",
          name: `${MARKER} negative fee`,
          amount: -1,
          frequency: "MONTHLY",
        });
        assert.equal(negativeFee.status, 400);

        const bill = await getCreatedBill(await createBill("S009", "P1", "G04-overpay"));
        const overpayment = await createPayment(bill.id, Number(bill.totalAmount) + 0.01);
        assert.equal(overpayment.status, 400);
        const afterOverpayment = await prisma.bill.findUniqueOrThrow({ where: { id: bill.id } });
        assert.equal(Number(afterOverpayment.paidAmount), 0);

        const fees = await prisma.feeStructure.findMany({
          where: { academicYearId: fixture.academicYearId, classId: fixture.classIds.grade5 },
          select: { id: true, isActive: true, updatedAt: true },
        });
        try {
          await prisma.feeStructure.updateMany({
            where: { id: { in: fees.map((fee) => fee.id) } },
            data: { isActive: false },
          });
          const zeroBill = await postJson(
            api.createBill,
            makeBillBody("S010", "P1", "G04-zero"),
            "/api/bills",
          );
          assert.equal(zeroBill.status, 409);
          assert.match(zeroBill.body.error, /No billable fees/);

          const negativePayment = await createPayment(bill.id, -0.01);
          const zeroPayment = await createPayment(bill.id, 0);
          assert.equal(negativePayment.status, 400);
          assert.equal(zeroPayment.status, 400);
          return {
            zeroFeeStatus: zeroFee.status,
            negativeFeeStatus: negativeFee.status,
            zeroBillStatus: zeroBill.status,
            negativePaymentStatus: negativePayment.status,
            zeroPaymentStatus: zeroPayment.status,
            overpaymentStatus: overpayment.status,
            unchangedPaidAmount: Number(afterOverpayment.paidAmount),
          };
        } finally {
          for (const fee of fees) {
            await prisma.feeStructure.update({
              where: { id: fee.id },
              data: { isActive: fee.isActive, updatedAt: fee.updatedAt },
            });
          }
        }
      } finally {
        if (zeroFee.body.id) {
          await prisma.feeStructure.delete({
            where: { id: zeroFee.body.id },
          });
        }
      }
    }, "HIGH");

    await run("TEA01", "Teacher list school scoping", "Teacher list contains only records from the configured school", async () => {
      const school = await prisma.school.findFirst({
        select: { id: true },
      });
      assert.ok(school, "Configured school was not found.");
      const response = await teachersApi.GET();
      assert.equal(response.status, 200);
      const teachers = await response.json();
      assert.ok(Array.isArray(teachers));
      assert.ok(
        teachers.every((teacher) => teacher.schoolId === school.id),
        "Teacher list included records from another school.",
      );
      return { teacherCount: teachers.length, schoolScoped: true };
    }, "HIGH");

    await run("EXP01", "Expense form BS date contract", "Expense creation and editing preserve the selected Bikram Sambat date", async () => {
      let expenseId;
      const body = {
        academicYearId: fixture.academicYearId,
        category: "OTHER",
        description: `${MARKER} BS-date expense`,
        amount: 42.75,
        expenseDate: "2083-08-07",
        paymentMethod: "BANK",
      };
      try {
        const created = await postJson(
          expenseApi.POST,
          body,
          "/api/expenses",
        );
        assert.equal(created.status, 201, JSON.stringify(created.body));
        expenseId = created.body.id;
        assert.ok(expenseId, "Created expense did not return an ID.");

        const updatedResponse = await expenseApi.PATCH(
          new Request(
            `http://billing-qa.local/api/expenses?id=${encodeURIComponent(expenseId)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ ...body, amount: 44.75 }),
            },
          ),
        );
        const updated = await updatedResponse.json();
        assert.equal(updatedResponse.status, 200, JSON.stringify(updated));

        const persisted = await prisma.expense.findUniqueOrThrow({
          where: { id: expenseId },
        });
        assert.equal(Number(persisted.amount), 44.75);
        assert.deepEqual(dateToBS(persisted.expenseDate), {
          year: 2083,
          month: 8,
          day: 7,
        });
        return {
          status: updatedResponse.status,
          amount: Number(persisted.amount),
          expenseDateBS: dateToBS(persisted.expenseDate),
        };
      } finally {
        if (expenseId) {
          await prisma.expense.delete({ where: { id: expenseId } });
        }
      }
    }, "HIGH");

    await run("I01", "Bill generation transaction rollback", "Failure after bill, bill items, and charge applications are written leaves none persisted", async () => {
      const { result, injected } = await withInjectedTransactionFailure(
        appPrisma,
        "studentChargeApplication",
        "createMany",
        () => createBill("S003", "P1", "I01-rollback"),
      );
      assert.equal(injected, true);
      assert.equal(result.status, 500);
      const bills = await prisma.bill.findMany({
        where: { studentId: student("S003"), notes: `${MARKER} ${runId} I01-rollback` },
        select: { id: true },
      });
      const applications = await prisma.studentChargeApplication.count({
        where: { studentChargeId: { in: Object.values(fixture.chargeIds).slice(0, 2) } },
      });
      assert.equal(bills.length, 0);
      assert.equal(applications, 0);
      return { injected, status: result.status, persistedBills: bills.length, activeApplications: applications };
    }, "CRITICAL");

    await run("I02", "Payment and balance-allocation rollback", "Failure after payment creation and bill update leaves neither payment nor balance change", async () => {
      const bill = await getCreatedBill(await createBill("S001", "P1", "I02-rollback"));
      const idempotencyKey = randomUUID();
      const { result, injected } = await withInjectedTransactionFailure(
        appPrisma,
        "bill",
        "update",
        () =>
          postJson(
            api.recordPayment,
            { billId: bill.id, amount: 100, method: "CASH" },
            "/api/payments",
            { "Idempotency-Key": idempotencyKey },
          ),
      );
      assert.equal(injected, true);
      assert.equal(result.status, 500);
      const [payment, persistedBill] = await Promise.all([
        prisma.payment.findUnique({ where: { idempotencyKey } }),
        prisma.bill.findUniqueOrThrow({ where: { id: bill.id } }),
      ]);
      assert.equal(payment, null);
      assert.equal(Number(persistedBill.paidAmount), 0);
      assert.equal(persistedBill.status, "UNPAID");
      return { injected, status: result.status, paymentPersisted: Boolean(payment), paidAmount: Number(persistedBill.paidAmount) };
    }, "CRITICAL");

    await run("I07", "Waiver transaction rollback", "Failure after waiver payment and bill update leaves neither the waiver nor status change", async () => {
      const bill = await getCreatedBill(await createBill("S001", "P1", "I07-rollback"));
      const idempotencyKey = randomUUID();
      const { result, injected } = await withInjectedTransactionFailure(
        appPrisma,
        "bill",
        "update",
        () =>
          postJson(
            api.recordPayment,
            {
              billId: bill.id,
              amount: 100,
              waiverAmount: 100,
              waiverReason: "Injected rollback test",
              method: "CASH",
            },
            "/api/payments",
            { "Idempotency-Key": idempotencyKey },
          ),
      );
      assert.equal(injected, true);
      assert.equal(result.status, 500);
      const [payment, persistedBill] = await Promise.all([
        prisma.payment.findUnique({ where: { idempotencyKey } }),
        prisma.bill.findUniqueOrThrow({ where: { id: bill.id } }),
      ]);
      assert.equal(payment, null);
      assert.equal(Number(persistedBill.paidAmount), 0);
      assert.equal(persistedBill.status, "UNPAID");
      return { injected, status: result.status, paymentPersisted: Boolean(payment), billStatus: persistedBill.status };
    }, "CRITICAL");

    await run("I08", "Salary payment transaction rollback", "Failure after salary-payment creation and salary update leaves the payment absent and salary pending", async () => {
      const salary = await prisma.teacherSalary.create({
        data: {
          teacherId: fixture.teacherId,
          academicYearId: fixture.academicYearId,
          month: 1,
          year: 2083,
          salaryAmount: 1000,
          netAmount: 1000,
          status: "PENDING",
        },
      });
      try {
        const { result: failureObserved, injected } =
          await withInjectedTransactionFailure(
            appPrisma,
            "teacherSalary",
            "update",
            async () => {
              try {
                await appPrisma.$transaction(
                  (tx) =>
                    recordTeacherSalaryPayment(tx, {
                      teacherSalaryId: salary.id,
                      amount: 250,
                      paymentDate: bsToDate(2083, 1, 15),
                      method: "CASH",
                      reference: null,
                      notes: "Injected rollback QA",
                    }),
                  { maxWait: 30_000, timeout: 30_000 },
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
        const persisted = await prisma.teacherSalary.findUniqueOrThrow({
          where: { id: salary.id },
          include: { payments: true },
        });
        assert.equal(persisted.payments.length, 0);
        assert.equal(persisted.status, "PENDING");
        return { injected, paymentCount: persisted.payments.length, status: persisted.status };
      } finally {
        await prisma.teacherSalary.delete({ where: { id: salary.id } });
      }
    }, "CRITICAL");

    await run("master", "Master bill, payment, waiver, and statement workflow", "Successful bill settlement is reflected consistently in payments and account statements; previous due remains on its original bill", async () => {
      const firstBill = await getCreatedBill(await createBill("S009", "P1", "master-first"));
      const payment = await createPayment(firstBill.id, 5000, 1000, "Master scenario waiver");
      assert.equal(payment.status, 201, JSON.stringify(payment.body));
      const secondBill = await getCreatedBill(await createBill("S009", "P2", "master-next"));
      const statement = await api.getStudentProfile(student("S009"), fixture.academicYearId);
      const firstStatementBill = statement.body.financial.bills.find((bill) => bill.id === firstBill.id);
      assert.equal(firstStatementBill.remainingAmount, Number(firstBill.totalAmount) - 6000);
      assert.equal(Number(secondBill.totalAmount), 17300);
      assert.equal(
        statement.body.financial.summary.remainingDue,
        Number(firstBill.totalAmount) - 6000 + Number(secondBill.totalAmount),
      );
      assert.equal(statement.body.financial.payments.length, 1);
      return {
        firstBillDue: firstStatementBill.remainingAmount,
        secondBillTotal: secondBill.totalAmount,
        statementDue: statement.body.financial.summary.remainingDue,
        paymentCount: statement.body.financial.payments.length,
      };
    }, "HIGH");

    for (const [id, name] of focusedTestIds ? [] : [
      ["E05", "Excess credit application rejected"],
      ["E06", "Partial credit application"],
      ["E07", "Duplicate credit application"],
      ["I09", "Credit application transaction rollback"],
    ]) {
      results.push({
        id,
        name,
        expected: "Scenario executed in the separate credit integration test",
        actual: "NOT EXECUTED in this runner; covered by the separate student-credit.integration.test.js.",
        status: "NOT EXECUTED",
        severity: "HIGH",
      });
    }

    await resetBills();
    const finalSnapshot = await captureFinanceSnapshot(prisma);
    results.push({
      id: "CLEAN-01",
      name: "Financial fixture snapshot and temporary-row cleanup",
      expected: "All pre-existing financial rows and school records remain unchanged; current-run rows are absent.",
      actual: {
        before: baselineSnapshot.hash,
        after: finalSnapshot.hash,
        counts: finalSnapshot.counts,
      },
      status: baselineSnapshot.hash === finalSnapshot.hash ? "PASS" : "FAIL",
      severity: "CRITICAL",
    });

    const counts = Object.fromEntries(
      ["PASS", "FAIL", "BLOCKED", "NOT EXECUTED"].map((status) => [
        status,
        results.filter((result) => result.status === status).length,
      ]),
    );
    const failedResults = results.filter(
      (result) => result.status === "FAIL",
    );
    const report = [
      "# Billing QA Report",
      "",
      `Test target: ${target.host}/${target.database}`,
      `Fixture: ${MARKER} (isolated school; existing school data was not used)`,
      "",
      "## Overall results",
      "",
      "| Metric | Result |",
      "|---|---:|",
      `| Total scenarios | ${results.length} |`,
      `| Passed | ${counts.PASS} |`,
      `| Failed | ${counts.FAIL} |`,
      `| Blocked | ${counts.BLOCKED} |`,
      `| Not executed | ${counts["NOT EXECUTED"]} |`,
      `| Critical defects | ${results.filter((result) => result.status === "FAIL" && result.severity === "CRITICAL").length} |`,
      `| High-priority defects | ${results.filter((result) => result.status === "FAIL" && result.severity === "HIGH").length} |`,
      "",
      "## Execution note",
      "",
      "The broad suite is supplemented by focused live-database retests of quantity-based charges, concurrent bill numbering, idempotent payment retries, and student deletion with billing history.",
      "",
      "## Individual scenario report",
      "",
      "| Test ID | Scenario | Expected | Actual | Result |",
      "|---|---|---|---|---|",
      ...results.map((result) => `| ${result.id} | ${result.name} | ${String(result.expected).replaceAll("|", "\\|")} | ${JSON.stringify(result.actual).replaceAll("|", "\\|")} | ${result.status} |`),
      "",
      "## Defect report",
      "",
      ...(failedResults.length === 0
        ? ["No failures among executed scenarios.", ""]
        : failedResults.flatMap((result) => [
          `### ${result.id}: ${result.name}`,
          `- Expected: ${result.expected}`,
          `- Actual: ${JSON.stringify(result.actual)}`,
          `- Severity: ${result.severity}`,
          ...(result.id === "F12"
            ? [
                "- Relevant API: `/api/payments`.",
                "- The request must be deduplicated by its idempotency key and reject key reuse with a changed payload.",
              ]
            : result.id === "I05"
              ? [
                  "- Relevant schema: `Student` to `Bill` must prevent cascading deletion of financial history.",
                ]
            : [
                "- Root cause and fix status require review of the failing assertion.",
              ]),
          "",
        ])),
      "## Inspection findings and scope limitations",
      "",
      "- The production seed `prisma/seed.ts` deletes existing records and was not run.",
      "- Test seed data uses a separately marked school and academic year in the explicitly authorized test branch.",
      "- Student-specific charges are limited to BUS and MISCELLANEOUS and are not discounted by the billing route.",
      "- StudentCharge has no active/deactivation flag. Bill cancellation is allowed only without payments or credits; it preserves the bill and releases charge applications for replacement.",
      "- StudentChargeApplication retains billing history independently from the source charge; historical BillItem descriptions and amounts are snapshots.",
      "- Previous dues are not carried forward by bill generation.",
      "- Discount selection uses the first match without an explicit order, and BillItem does not store the selected discount identity.",
      "- Payment creation requires an Idempotency-Key; identical retries replay the existing payment and changed payloads with the same key are rejected.",
      "- Concurrent bill-number allocation now uses a transaction-scoped advisory lock; I03 verifies unique numbers.",
      "- Student deletion is blocked when bills exist, with a database-level RESTRICT constraint as a second safeguard.",
      "",
      "This report does not certify the billing module as fully tested; blocked and unexecuted scenarios remain.",
      "",
    ].join("\n");
    const reportPath = resolve(
      process.cwd(),
      "tests",
      "billing",
      "QA-PHASE5-BILLING-STRESS-RESULTS.md",
    );
    if (!focusedTestIds) {
      await writeFile(reportPath, report, "utf8");
      await writeFile(
        resolve(process.cwd(), "tests", "billing", "phase5-billing-test-results.json"),
        `${JSON.stringify(results, null, 2)}\n`,
        "utf8",
      );
    }
    console.log(
      JSON.stringify(
        {
          counts,
          focusedTestIds: focusedTestIds ? [...focusedTestIds] : null,
          reportPath: focusedTestIds ? null : reportPath,
        },
        null,
        2,
      ),
    );
    if (counts.FAIL > 0) process.exitCode = 1;
  } finally {
    await Promise.all([
      prisma.$disconnect(),
      appPrisma?.$disconnect(),
    ]);
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

main().catch((error) => {
  console.error("Billing QA run failed:", error);
  process.exitCode = 1;
});
