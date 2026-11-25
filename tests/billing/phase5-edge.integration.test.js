import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { bsToDate } from "../../src/lib/nepali-date.ts";
import { captureFinanceSnapshot } from "./helpers/finance-snapshot.js";
import { cleanupTestBills } from "./helpers/cleanup-test-data.js";
import { connectToTestDatabase, getVerifiedTestTarget } from "./helpers/database.js";
import { postJson } from "./helpers/api-client.js";
import { MARKER, SCHOOL_NAME } from "./fixtures/billing-test-data.js";

const enabled =
  process.env.PHASE5_EDGE_QA_CONFIRMATION === "PHASE5_EDGE_QA_ONLY";
const focusedTestIds = process.env.PHASE5_EDGE_FOCUS
  ? new Set(process.env.PHASE5_EDGE_FOCUS.split(",").map((id) => id.trim()))
  : null;
const primarySchoolId = "cmwtatkm10000row42cgw4b64";
const approvedHost = "ep-green-glade-ayptuugl-pooler.c-5.us-east-2.aws.neon.tech";
const approvedDatabase = "neondb";

test(
  "Phase 5 billing API edge, boundary, and concurrency cases",
  { skip: enabled ? false : "requires explicit isolated Phase 5 QA approval" },
  async (t) => {
    const target = getVerifiedTestTarget();
    if (target.host !== approvedHost || target.database !== approvedDatabase) {
      throw new Error("Refusing to run Phase 5 edge tests outside the approved isolated QA database.");
    }

    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousSchoolId = process.env.SCHOOL_ID;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.DATABASE_URL = target.connectionString;
    process.env.NODE_ENV = "test";

    const prisma = await connectToTestDatabase();
    let appPrisma;
    let fixture;
    let runId;
    let baselineSnapshot;
    const temporaryBillIds = new Set();
    const temporaryFeeIds = new Set();
    const temporaryChargeIds = new Set();
    const temporaryDiscountIds = new Set();
    const createdBillIds = new Set();
    const createdPaymentIds = new Set();
    const createdFeeIds = new Set();

    try {
      const fixturePath = resolve(
        process.cwd(),
        "tests",
        "billing",
        "fixtures",
        "billing-test-ids.json",
      );
      fixture = JSON.parse(await readFile(fixturePath, "utf8"));
      assert.equal(fixture.marker, MARKER);
      const fixtureSchool = await prisma.school.findUniqueOrThrow({
        where: { id: fixture.schoolId },
        select: { id: true, name: true, shortName: true },
      });
      assert.equal(fixtureSchool.name, SCHOOL_NAME);
      assert.equal(fixtureSchool.shortName, MARKER);

      process.env.SCHOOL_ID = fixture.schoolId;
      const [appDatabase, billsApi, billsCancelApi, paymentsApi, feesApi, chargesApi, discountsApi] =
        await Promise.all([
          import("../../src/lib/prisma.ts"),
          import("../../src/app/api/bills/route.ts"),
          import("../../src/app/api/bills/[id]/cancel/route.ts"),
          import("../../src/app/api/payments/route.ts"),
          import("../../src/app/api/fees/route.ts"),
          import("../../src/app/api/student-charges/route.ts"),
          import("../../src/app/api/student-discounts/route.ts"),
        ]);
      appPrisma = appDatabase.prisma;
      runId = randomUUID();
      baselineSnapshot = await captureFinanceSnapshot(prisma);

      const student = (key) => fixture.studentIds[key];
      const billBody = (studentKey, startMonth = 1, endMonth = 3, extra = {}) => ({
        studentId: student(studentKey),
        academicYearId: fixture.academicYearId,
        periodStartYear: 2083,
        periodStartMonth: startMonth,
        periodEndYear: 2083,
        periodEndMonth: endMonth,
        notes: `${MARKER} ${runId} edge`,
        ...extra,
      });

      async function createBill(studentKey, startMonth = 1, endMonth = 3, extra = {}) {
        const response = await postJson(
          billsApi.POST,
          billBody(studentKey, startMonth, endMonth, extra),
          "/api/bills",
        );
        if (response.status === 201 && response.body.bill?.id) {
          temporaryBillIds.add(response.body.bill.id);
          createdBillIds.add(response.body.bill.id);
        }
        return response;
      }

      async function createPayment(billId, amount, options = {}) {
        const key = options.key ?? randomUUID();
        const body = {
          billId,
          amount,
          ...(options.method !== undefined ? { method: options.method } : {}),
          ...(options.reference !== undefined ? { reference: options.reference } : {}),
          ...(options.notes !== undefined ? { notes: options.notes } : {}),
          ...(options.waiverAmount !== undefined
            ? { waiverAmount: options.waiverAmount }
            : {}),
          ...(options.waiverReason !== undefined
            ? { waiverReason: options.waiverReason }
            : {}),
          ...(options.paymentDate !== undefined
            ? { paymentDate: options.paymentDate }
            : {}),
        };
        const response = await paymentsApi.POST(
          new Request("http://billing-qa.local/api/payments", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "Idempotency-Key": key,
            },
            body: JSON.stringify(body),
          }),
        );
        const responseBody = await response.json();
        if (response.status === 201 && responseBody.payment?.id) {
          createdPaymentIds.add(responseBody.payment.id);
        }
        return { status: response.status, body: responseBody, key, request: body };
      }

      async function createFee(body) {
        const response = await postJson(
          feesApi.POST,
          body,
          "/api/fees",
        );
        if (response.status === 201 && response.body.id) {
          temporaryFeeIds.add(response.body.id);
          createdFeeIds.add(response.body.id);
        }
        return response;
      }

      async function updateFee(body) {
        const response = await feesApi.PUT(
          new Request("http://billing-qa.local/api/fees", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
        );
        return { status: response.status, body: await response.json() };
      }

      async function createCharge(body) {
        const response = await postJson(
          chargesApi.POST,
          body,
          "/api/student-charges",
        );
        if (response.status === 201 && response.body.id) {
          temporaryChargeIds.add(response.body.id);
        }
        return response;
      }

      async function updateCharge(body) {
        const response = await chargesApi.PUT(
          new Request("http://billing-qa.local/api/student-charges", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
        );
        return { status: response.status, body: await response.json() };
      }

      async function createDiscount(body) {
        const response = await postJson(
          discountsApi.POST,
          body,
          "/api/student-discounts",
        );
        if (response.status === 201 && response.body.id) {
          temporaryDiscountIds.add(response.body.id);
        }
        return response;
      }

      async function cleanupScenario() {
        if (temporaryBillIds.size > 0) {
          await prisma.bill.deleteMany({
            where: { id: { in: [...temporaryBillIds] } },
          });
          temporaryBillIds.clear();
        }
        await cleanupTestBills(prisma, fixture, runId);
        if (temporaryDiscountIds.size > 0) {
          await prisma.studentDiscount.deleteMany({
            where: { id: { in: [...temporaryDiscountIds] } },
          });
          temporaryDiscountIds.clear();
        }
        if (temporaryChargeIds.size > 0) {
          await prisma.studentCharge.deleteMany({
            where: { id: { in: [...temporaryChargeIds] } },
          });
          temporaryChargeIds.clear();
        }
        if (temporaryFeeIds.size > 0) {
          await prisma.feeStructure.deleteMany({
            where: { id: { in: [...temporaryFeeIds] } },
          });
          temporaryFeeIds.clear();
        }
      }

      async function runCase(id, action) {
        if (focusedTestIds && !focusedTestIds.has(id)) return;
        await t.test(id, async () => {
          await cleanupScenario();
          try {
            await action();
          } finally {
            await cleanupScenario();
          }
        });
      }

      async function withDisabledClassFees(classId, action) {
        const fees = await prisma.feeStructure.findMany({
          where: {
            academicYearId: fixture.academicYearId,
            classId,
          },
          select: { id: true, isActive: true, updatedAt: true },
        });
        try {
          for (const fee of fees) {
            await prisma.feeStructure.update({
              where: { id: fee.id },
              data: { isActive: false },
            });
          }
          return await action();
        } finally {
          for (const fee of fees) {
            await prisma.feeStructure.update({
              where: { id: fee.id },
              data: { isActive: fee.isActive, updatedAt: fee.updatedAt },
            });
          }
        }
      }

      await runCase("EDGE-BILL-01", async () => {
        for (const month of [0, 13]) {
          const response = await postJson(
            billsApi.POST,
            billBody("S001", month, 3),
            "/api/bills",
          );
          assert.equal(response.status, 400, JSON.stringify(response.body));
        }
      });

      await runCase("EDGE-BILL-02", async () => {
        for (const month of [0, 13]) {
          const response = await postJson(
            billsApi.POST,
            billBody("S001", 1, month),
            "/api/bills",
          );
          assert.equal(response.status, 400, JSON.stringify(response.body));
        }
      });

      await runCase("EDGE-BILL-03", async () => {
        const response = await postJson(
          billsApi.POST,
          billBody("S001", 4, 3),
          "/api/bills",
        );
        assert.equal(response.status, 400, JSON.stringify(response.body));
      });

      await runCase("EDGE-BILL-04", async () => {
        const response = await createBill("S001", 12, 1, {
          periodStartYear: 2083,
          periodEndYear: 2084,
        });
        assert.equal(response.status, 201, JSON.stringify(response.body));
        const bill = await prisma.bill.findUniqueOrThrow({
          where: { id: response.body.bill.id },
          include: { items: true },
        });
        const tuition = bill.items.find((item) => item.feeType === "TUITION");
        assert.equal(Number(tuition.quantity), 2);
      });

      await runCase("EDGE-BILL-05", async () => {
        for (const dueDate of [
          "not-a-date",
          bsToDate(2082, 12, 1).toISOString(),
        ]) {
          const response = await postJson(
            billsApi.POST,
            billBody("S001", 1, 3, { dueDate }),
            "/api/bills",
          );
          assert.equal(response.status, 400, JSON.stringify(response.body));
        }
      });

      await runCase("EDGE-BILL-06", async () => {
        await withDisabledClassFees(fixture.classIds.grade5, async () => {
          const response = await createBill("S003");
          assert.equal(response.status, 201, JSON.stringify(response.body));
          const bill = await prisma.bill.findUniqueOrThrow({
            where: { id: response.body.bill.id },
            include: { items: true },
          });
          assert.ok(bill.items.length > 0);
          assert.ok(bill.items.every((item) => item.studentChargeId));
        });
      });

      await runCase("EDGE-BILL-07", async () => {
        await withDisabledClassFees(fixture.classIds.grade5, async () => {
          const response = await createBill("S001");
          assert.equal(response.status, 409, JSON.stringify(response.body));
          assert.match(response.body.error, /No billable fees/i);
        });
      });

      await runCase("EDGE-BILL-08", async () => {
        const first = await createBill("S001", 1, 3);
        const second = await createBill("S001", 4, 6);
        assert.equal(first.status, 201, JSON.stringify(first.body));
        assert.equal(second.status, 201, JSON.stringify(second.body));
      });

      await runCase("EDGE-BILL-09", async () => {
        const responses = await Promise.all([
          createBill("S001"),
          createBill("S002"),
        ]);
        assert.deepEqual(responses.map((response) => response.status), [201, 201]);
        assert.notEqual(
          responses[0].body.bill.billNumber,
          responses[1].body.bill.billNumber,
        );
      });

      await runCase("EDGE-BILL-10", async () => {
        const responses = await Promise.all([
          createBill("S001", 1, 3),
          createBill("S001", 3, 4),
        ]);
        assert.deepEqual(
          responses.map((response) => response.status).sort(),
          [201, 409],
        );
      });

      await runCase("EDGE-BILL-11", async () => {
        const original = await createBill("S003");
        assert.equal(original.status, 201, JSON.stringify(original.body));
        const cancelled = await apiCancelBill(original.body.bill.id);
        assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
        const replacement = await createBill("S003");
        assert.equal(replacement.status, 201, JSON.stringify(replacement.body));
      });

      await runCase("EDGE-BILL-12", async () => {
        const original = await createBill("S001");
        assert.equal(original.status, 201, JSON.stringify(original.body));
        const first = await apiCancelBill(original.body.bill.id);
        const second = await apiCancelBill(original.body.bill.id);
        assert.equal(first.status, 200);
        assert.equal(second.status, 200);
        assert.equal(second.body.bill.status, "CANCELLED");
      });

      async function apiCancelBill(id) {
        const response = await billsCancelApi.POST(
          new Request(`http://billing-qa.local/api/bills/${id}/cancel`, {
            method: "POST",
          }),
          { params: Promise.resolve({ id }) },
        );
        return { status: response.status, body: await response.json() };
      }

      const feeBase = {
        academicYearId: fixture.academicYearId,
        classId: fixture.classIds.grade5,
        feeType: "MISCELLANEOUS",
        name: `${MARKER} ${runId} edge fee`,
        frequency: "MONTHLY",
      };

      await runCase("EDGE-FEE-01", async () => {
        for (const amount of [
          -1,
          "not-a-number",
          "NaN",
          "Infinity",
          "-Infinity",
          true,
          {},
          "",
          "   ",
        ]) {
          const response = await createFee({
            ...feeBase,
            name: `${feeBase.name}-${String(amount)}`,
            amount,
          });
          assert.equal(response.status, 400, JSON.stringify(response.body));
        }
        for (const amount of [0, "0.01", 1.25]) {
          const response = await createFee({
            ...feeBase,
            name: `${feeBase.name}-${amount}`,
            amount,
          });
          assert.equal(response.status, 201, JSON.stringify(response.body));
        }
      });

      await runCase("EDGE-FEE-03", async () => {
        const [primaryYear, primaryClass] = await Promise.all([
          prisma.academicYear.findFirstOrThrow({
            where: { schoolId: primarySchoolId },
            select: { id: true },
          }),
          prisma.class.findFirstOrThrow({
            where: { schoolId: primarySchoolId },
            select: { id: true },
          }),
        ]);
        for (const relationship of [
          { academicYearId: fixture.academicYearId, classId: primaryClass.id },
          { academicYearId: primaryYear.id, classId: fixture.classIds.grade5 },
        ]) {
          const response = await createFee({
            ...feeBase,
            ...relationship,
            name: `${feeBase.name}-foreign-${randomUUID()}`,
            amount: 10,
          });
          assert.equal(response.status, 400, JSON.stringify(response.body));
        }
      });

      await runCase("EDGE-FEE-04", async () => {
        const created = await createFee({
          ...feeBase,
          name: `${feeBase.name}-update`,
          amount: 125,
        });
        assert.equal(created.status, 201, JSON.stringify(created.body));
        const invalid = await updateFee({
          id: created.body.id,
          amount: true,
        });
        assert.equal(invalid.status, 400, JSON.stringify(invalid.body));
        const persisted = await prisma.feeStructure.findUniqueOrThrow({
          where: { id: created.body.id },
        });
        assert.equal(Number(persisted.amount), 125);
      });

      await runCase("EDGE-FEE-02", async () => {
        const body = { ...feeBase, amount: 10 };
        const first = await createFee(body);
        assert.equal(first.status, 201, JSON.stringify(first.body));
        const duplicate = await createFee(body);
        assert.equal(duplicate.status, 409, JSON.stringify(duplicate.body));
      });

      const discountBase = {
        studentId: student("S001"),
        academicYearId: fixture.academicYearId,
        name: `${MARKER} ${runId} edge discount`,
        percentage: 10,
        feeTypes: ["TUITION"],
        startDate: bsToDate(2083, 1, 1).toISOString(),
      };

      await runCase("EDGE-DISC-01", async () => {
        const expected = new Map([
          [0, 400],
          [0.01, 201],
          [100, 201],
          [100.01, 400],
          [-1, 400],
          [true, 400],
        ]);
        for (const [percentage, status] of expected) {
          const response = await createDiscount({
            ...discountBase,
            name: `${discountBase.name}-${String(percentage)}`,
            percentage,
          });
          assert.equal(response.status, status, JSON.stringify(response.body));
          if (response.status === 201) {
            await prisma.studentDiscount.delete({
              where: { id: response.body.id },
            });
            temporaryDiscountIds.delete(response.body.id);
          }
        }
      });

      await runCase("EDGE-DISC-02", async () => {
        const invalidStart = await createDiscount({
          ...discountBase,
          startDate: "not-a-date",
        });
        assert.equal(invalidStart.status, 400);
        const reversedRange = await createDiscount({
          ...discountBase,
          startDate: bsToDate(2083, 2, 1).toISOString(),
          endDate: bsToDate(2083, 1, 1).toISOString(),
        });
        assert.equal(reversedRange.status, 400);
      });

      await runCase("EDGE-DISC-03", async () => {
        const response = await createDiscount({
          ...discountBase,
          feeTypes: ["TUITION", "TUITION"],
        });
        assert.equal(response.status, 201, JSON.stringify(response.body));
        assert.equal(response.body.feeTypes.length, 1);
      });

      await runCase("EDGE-DISC-04", async () => {
        const response = await createDiscount({
          ...discountBase,
          studentId: student("S003"),
          percentage: 100,
          feeTypes: ["TUITION"],
        });
        assert.equal(response.status, 201, JSON.stringify(response.body));
        const billResponse = await createBill("S003");
        assert.equal(billResponse.status, 201, JSON.stringify(billResponse.body));
        const bill = await prisma.bill.findUniqueOrThrow({
          where: { id: billResponse.body.bill.id },
          include: { items: true },
        });
        assert.equal(
          Number(bill.items.find((item) => item.feeType === "TUITION").netAmount),
          0,
        );
        assert.ok(
          bill.items
            .filter((item) => item.studentChargeId)
            .every((item) => Number(item.discountAmount) === 0),
        );
      });

      await runCase("EDGE-DISC-05", async () => {
        const response = await createDiscount({
          ...discountBase,
          feeTypes: ["BUS"],
        });
        assert.equal(response.status, 400, JSON.stringify(response.body));
      });

      const chargeBase = {
        studentId: student("S001"),
        academicYearId: fixture.academicYearId,
        feeType: "BUS",
        description: `${MARKER} ${runId} edge charge`,
        frequency: "ONE_TIME",
        startDate: bsToDate(2083, 1, 1).toISOString(),
      };

      await runCase("EDGE-CHARGE-01", async () => {
        for (const body of [
          { quantity: 0, rate: 1, expected: 400 },
          { quantity: -1, rate: 1, expected: 400 },
          { quantity: 1, rate: -1, expected: 400 },
          { quantity: true, rate: 1, expected: 400 },
          { quantity: 0.5, rate: 1, expected: 201 },
          { quantity: 1, rate: 0, expected: 201 },
        ]) {
          const response = await createCharge({
            ...chargeBase,
            description: `${chargeBase.description}-${String(body.quantity)}-${String(body.rate)}`,
            quantity: body.quantity,
            rate: body.rate,
          });
          assert.equal(response.status, body.expected, JSON.stringify(response.body));
        }
      });

      await runCase("EDGE-CHARGE-02", async () => {
        const unsupported = await createCharge({
          ...chargeBase,
          feeType: "TUITION",
          quantity: 1,
          rate: 1,
        });
        assert.equal(unsupported.status, 400);
        const invalidFrequency = await createCharge({
          ...chargeBase,
          frequency: "INVALID",
          quantity: 1,
          rate: 1,
        });
        assert.equal(invalidFrequency.status, 400);
      });

      await runCase("EDGE-CHARGE-03", async () => {
        for (const body of [
          { startDate: "not-a-date" },
          {
            startDate: bsToDate(2083, 2, 1).toISOString(),
            endDate: bsToDate(2083, 1, 1).toISOString(),
          },
        ]) {
          const response = await createCharge({
            ...chargeBase,
            quantity: 1,
            rate: 1,
            ...body,
          });
          assert.equal(response.status, 400, JSON.stringify(response.body));
        }
      });

      await runCase("EDGE-CHARGE-06", async () => {
        const created = await createCharge({
          ...chargeBase,
          description: `${chargeBase.description}-update`,
          quantity: 2,
          rate: 50,
        });
        assert.equal(created.status, 201, JSON.stringify(created.body));
        for (const change of [{ quantity: true }, { rate: true }]) {
          const response = await updateCharge({
            id: created.body.id,
            ...change,
          });
          assert.equal(response.status, 400, JSON.stringify(response.body));
        }
        const persisted = await prisma.studentCharge.findUniqueOrThrow({
          where: { id: created.body.id },
        });
        assert.equal(Number(persisted.quantity), 2);
        assert.equal(Number(persisted.rate), 50);
        assert.equal(Number(persisted.amount), 100);
      });

      await runCase("EDGE-CHARGE-04", async () => {
        const primaryYear = await prisma.academicYear.findFirstOrThrow({
          where: { schoolId: primarySchoolId, isActive: true },
          select: { id: true },
        });
        const primaryStudent = await prisma.student.findFirstOrThrow({
          where: { schoolId: primarySchoolId },
          select: { id: true },
        });
        for (const body of [
          { studentId: student("S001"), academicYearId: primaryYear.id },
          { studentId: primaryStudent.id, academicYearId: fixture.academicYearId },
        ]) {
          const response = await createCharge({
            ...chargeBase,
            ...body,
            quantity: 1,
            rate: 1,
          });
          assert.equal(response.status, 400, JSON.stringify(response.body));
        }
      });

      await runCase("EDGE-CHARGE-05", async () => {
        const periodEnd = new Date(bsToDate(2083, 4, 1).getTime() - 1);
        const response = await createCharge({
          ...chargeBase,
          quantity: 1,
          rate: 100,
          frequency: "MONTHLY",
          startDate: bsToDate(2083, 1, 1).toISOString(),
          endDate: periodEnd.toISOString(),
        });
        assert.equal(response.status, 201, JSON.stringify(response.body));
        const first = await createBill("S001", 1, 3);
        const second = await createBill("S001", 4, 6);
        assert.equal(first.status, 201, JSON.stringify(first.body));
        assert.equal(second.status, 201, JSON.stringify(second.body));
        const [firstBill, secondBill] = await Promise.all([
          prisma.bill.findUniqueOrThrow({
            where: { id: first.body.bill.id },
            include: { items: true },
          }),
          prisma.bill.findUniqueOrThrow({
            where: { id: second.body.bill.id },
            include: { items: true },
          }),
        ]);
        assert.ok(firstBill.items.some((item) => item.studentChargeId === response.body.id));
        assert.ok(!secondBill.items.some((item) => item.studentChargeId === response.body.id));
      });

      await runCase("EDGE-PAY-01", async () => {
        const bill = await createBill("S001");
        assert.equal(bill.status, 201, JSON.stringify(bill.body));
        const billId = bill.body.bill.id;
        const missing = await createPayment(billId, 1, { key: "" });
        assert.equal(missing.status, 400);
        const tooLong = await createPayment(billId, 1, { key: "k".repeat(201) });
        assert.equal(tooLong.status, 400);
        const maximum = await createPayment(billId, 1, { key: "k".repeat(200) });
        assert.equal(maximum.status, 201, JSON.stringify(maximum.body));
      });

      await runCase("EDGE-PAY-02", async () => {
        const bill = await createBill("S001");
        assert.equal(bill.status, 201, JSON.stringify(bill.body));
        const billId = bill.body.bill.id;
        const key = `${MARKER}-${runId}-canonical`;
        const first = await createPayment(billId, 100, {
          key,
          method: "CASH",
          reference: " ref ",
          notes: " note ",
          waiverAmount: 10,
          waiverReason: " approved ",
        });
        assert.equal(first.status, 201, JSON.stringify(first.body));
        const replay = await createPayment(billId, "100", {
          key,
          method: "CASH",
          reference: "ref",
          notes: "note",
          waiverAmount: "10",
          waiverReason: "approved",
        });
        assert.equal(replay.status, 200, JSON.stringify(replay.body));
        for (const changed of [
          { amount: 101 },
          { method: "BANK" },
          { reference: "other" },
          { notes: "other" },
          { waiverAmount: 11, waiverReason: "approved" },
          { waiverAmount: 10, waiverReason: "other" },
          { paymentDate: bsToDate(2083, 1, 2).toISOString() },
        ]) {
          const response = await createPayment(billId, changed.amount ?? 100, {
            key,
            ...changed,
          });
          assert.equal(response.status, 409, JSON.stringify(response.body));
        }
      });

      await runCase("EDGE-PAY-03", async () => {
        const bill = await createBill("S001");
        assert.equal(bill.status, 201, JSON.stringify(bill.body));
        const billId = bill.body.bill.id;
        for (const amount of [0, -1, {}, "not-a-number", true, "", null]) {
          const response = await createPayment(billId, amount);
          assert.equal(response.status, 400, JSON.stringify(response.body));
        }
        const exponent = await createPayment(billId, "1e2");
        assert.equal(exponent.status, 201, JSON.stringify(exponent.body));
        assert.equal(Number(exponent.body.payment.amount), 100);
        const subCent = await createPayment(billId, 0.001);
        assert.equal(subCent.status, 201, JSON.stringify(subCent.body));
        const persisted = await prisma.payment.findUniqueOrThrow({
          where: { id: subCent.body.payment.id },
        });
        const persistedBill = await prisma.bill.findUniqueOrThrow({
          where: { id: billId },
        });
        assert.equal(
          Number(persistedBill.paidAmount),
          Number(exponent.body.payment.amount) + Number(persisted.amount),
        );
      });

      await runCase("EDGE-PAY-04", async () => {
        const bill = await createBill("S001");
        assert.equal(bill.status, 201, JSON.stringify(bill.body));
        const billId = bill.body.bill.id;
        const invalid = await createPayment(billId, 1, { waiverAmount: "invalid" });
        assert.equal(invalid.status, 400);
        const empty = await createPayment(billId, 1, { waiverAmount: "" });
        assert.equal(empty.status, 400);
        const nullWaiver = await createPayment(billId, 1, { waiverAmount: null });
        assert.equal(nullWaiver.status, 400);
        const negative = await createPayment(billId, 1, { waiverAmount: -1 });
        assert.equal(negative.status, 400);
        const boolean = await createPayment(billId, 1, {
          waiverAmount: true,
          waiverReason: "QA",
        });
        assert.equal(boolean.status, 400);
        const missingReason = await createPayment(billId, 1, {
          waiverAmount: 0.25,
        });
        assert.equal(missingReason.status, 400);
        const overBalance = await createPayment(billId, 1, {
          waiverAmount: 21500,
          waiverReason: "Too much",
        });
        assert.equal(overBalance.status, 400);
        const fractional = await createPayment(billId, 1, {
          waiverAmount: 0.25,
          waiverReason: "fractional QA waiver",
        });
        assert.equal(fractional.status, 201, JSON.stringify(fractional.body));
        assert.equal(Number(fractional.body.payment.waiverAmount), 0.25);
      });

      await runCase("EDGE-PAY-05", async () => {
        const bill = await createBill("S001");
        assert.equal(bill.status, 201, JSON.stringify(bill.body));
        const invalidMethod = await createPayment(bill.body.bill.id, 1, {
          method: "CRYPTO",
        });
        assert.equal(invalidMethod.status, 400);
        const invalidDate = await createPayment(bill.body.bill.id, 1, {
          paymentDate: "not-a-date",
        });
        assert.equal(invalidDate.status, 400);
        const futureDate = "2099-01-01T00:00:00.000Z";
        const futurePayment = await createPayment(bill.body.bill.id, 1, {
          paymentDate: futureDate,
        });
        assert.ok([201, 400].includes(futurePayment.status));
      });

      await runCase("EDGE-PAY-06", async () => {
        const bill = await createBill("S001");
        assert.equal(bill.status, 201, JSON.stringify(bill.body));
        const key = `${MARKER}-${runId}-five-retries`;
        const responses = await Promise.all(
          Array.from({ length: 5 }, () =>
            createPayment(bill.body.bill.id, 100, { key }),
          ),
        );
        assert.equal(responses.filter((response) => response.status === 201).length, 1);
        assert.equal(responses.filter((response) => response.status === 200).length, 4);
        assert.equal(
          await prisma.payment.count({ where: { billId: bill.body.bill.id } }),
          1,
        );
      });

      await runCase("EDGE-PAY-07", async () => {
        const bill = await createBill("S001");
        assert.equal(bill.status, 201, JSON.stringify(bill.body));
        const responses = await Promise.all(
          Array.from({ length: 5 }, () => createPayment(bill.body.bill.id, 5000)),
        );
        const payments = await prisma.payment.findMany({
          where: { billId: bill.body.bill.id },
        });
        const total = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
        assert.ok(total <= Number(bill.body.bill.totalAmount));
        assert.equal(responses.filter((response) => response.status === 201).length, 4);
        assert.equal(responses.filter((response) => response.status === 400).length, 1);
      });

      await runCase("EDGE-PAY-08", async () => {
        const bill = await createBill("S001");
        assert.equal(bill.status, 201, JSON.stringify(bill.body));
        const responses = await Promise.all([
          createPayment(bill.body.bill.id, 5000),
          createPayment(bill.body.bill.id, 5000, {
            waiverAmount: 500,
            waiverReason: "Concurrent QA waiver",
          }),
          createPayment(bill.body.bill.id, 5000),
          createPayment(bill.body.bill.id, 5000, {
            waiverAmount: 500,
            waiverReason: "Concurrent QA waiver",
          }),
          createPayment(bill.body.bill.id, 5000),
        ]);
        const persisted = await prisma.payment.findMany({
          where: { billId: bill.body.bill.id },
        });
        const settled = persisted.reduce(
          (sum, payment) =>
            sum + Number(payment.amount) + Number(payment.waiverAmount),
          0,
        );
        assert.ok(settled <= Number(bill.body.bill.totalAmount));
        assert.ok(responses.some((response) => response.status === 400));
      });

      await runCase("EDGE-CONC-01", async () => {
        const bills = await Promise.all(
          Array.from({ length: 5 }, (_, index) =>
            createBill(`S00${index + 1}`, 7, 7),
          ),
        );
        const successful = bills.filter((response) => response.status === 201);
        assert.equal(successful.length, 5);
        const numbers = successful.map((response) => response.body.bill.billNumber);
        assert.equal(new Set(numbers).size, numbers.length);
      });
    } finally {
      try {
        if (fixture && runId) {
          if (temporaryBillIds.size > 0) {
            await prisma.bill.deleteMany({
              where: { id: { in: [...temporaryBillIds] } },
            });
          }
          await cleanupTestBills(prisma, fixture, runId);
          if (temporaryDiscountIds.size > 0) {
            await prisma.studentDiscount.deleteMany({
              where: { id: { in: [...temporaryDiscountIds] } },
            });
          }
          if (temporaryChargeIds.size > 0) {
            await prisma.studentCharge.deleteMany({
              where: { id: { in: [...temporaryChargeIds] } },
            });
          }
          if (temporaryFeeIds.size > 0) {
            await prisma.feeStructure.deleteMany({
              where: { id: { in: [...temporaryFeeIds] } },
            });
          }
          if (baselineSnapshot) {
            const [remainingBills, remainingPayments, remainingFees] =
              await Promise.all([
                prisma.bill.findMany({
                  where: { id: { in: [...createdBillIds] } },
                  select: { id: true },
                }),
                prisma.payment.findMany({
                  where: { id: { in: [...createdPaymentIds] } },
                  select: { id: true },
                }),
                prisma.feeStructure.findMany({
                  where: { id: { in: [...createdFeeIds] } },
                  select: { id: true },
                }),
              ]);
            assert.deepEqual(remainingBills, []);
            assert.deepEqual(remainingPayments, []);
            assert.deepEqual(remainingFees, []);
            const finalSnapshot = await captureFinanceSnapshot(prisma);
            assert.equal(
              finalSnapshot.hash,
              baselineSnapshot.hash,
              "Phase 5 edge tests changed pre-existing school or financial records.",
            );
            console.log(
              `Phase 5 edge snapshot preserved (${finalSnapshot.hash}); rows=${JSON.stringify(finalSnapshot.counts)}`,
            );
            console.log(
              `Phase 5 focused regression temporary IDs: ${JSON.stringify({
                bills: [...createdBillIds],
                payments: [...createdPaymentIds],
                fees: [...createdFeeIds],
              })}`,
            );
          }
        }
      } finally {
        await appPrisma?.$disconnect();
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
