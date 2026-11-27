import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import { encode } from "next-auth/jwt";
import test from "node:test";
import { sumActiveBilledAmount } from "../../src/lib/finance/bill-summary.ts";
import {
  connectToTestDatabase,
  getVerifiedTestTarget,
} from "./helpers/database.js";

const enabled =
  process.env.CANCELLED_BILL_TOTAL_QA_CONFIRMATION ===
  "CANCELLED_BILL_TOTAL_QA_ONLY";
const approvedHost =
  "ep-green-glade-ayptuugl-pooler.c-5.us-east-2.aws.neon.tech";
const approvedDatabase = "neondb";
const primarySchoolId = "cmwtatkm10000row42cgw4b64";
const qaAccountantId = "cmwtatksy0001row4l4pgi3x7";

test(
  "cancelled bills remain in history without changing active student totals",
  { skip: enabled ? false : "requires explicit isolated QA approval" },
  async () => {
    const target = getVerifiedTestTarget();
    assert.equal(target.host, approvedHost);
    assert.equal(target.database, approvedDatabase);
    assert.equal(process.env.SCHOOL_ID, primarySchoolId);

    const baseUrl = process.env.CANCELLED_BILL_TOTAL_TEST_BASE_URL;
    assert.ok(baseUrl, "Set the local QA app URL.");
    const origin = new URL(baseUrl);
    assert.equal(origin.protocol, "http:");
    assert.ok(
      ["127.0.0.1", "localhost", "::1"].includes(origin.hostname),
      "The bill total integration test may only call a loopback app.",
    );

    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
    assert.ok(secret, "Auth secret must be loaded from the local .env file.");

    const prisma = await connectToTestDatabase();
    let fixtureBillId;
    let baselineBillSnapshot;
    let baselineSchoolSnapshot;
    let baselineAcademicYearSnapshot;

    async function sessionCookie() {
      const token = await encode({
        secret,
        salt: "authjs.session-token",
        token: {
          id: qaAccountantId,
          sub: qaAccountantId,
          role: "ACCOUNTANT",
          name: "QA Accountant",
          email: "qa.accountant@example.test",
        },
      });
      return `authjs.session-token=${token}`;
    }

    async function getBills(cookie) {
      const response = await fetch(new URL("/api/bills", origin), {
        headers: { cookie },
      });
      assert.equal(response.status, 200);
      return response.json();
    }

    async function getStudentProfile(cookie, studentId, academicYearId) {
      const url = new URL(
        `/api/students/${encodeURIComponent(studentId)}/profile`,
        origin,
      );
      url.searchParams.set("academicYearId", academicYearId);
      const response = await fetch(url, {
        headers: { cookie },
      });
      assert.equal(response.status, 200);
      return response.json();
    }

    async function billSnapshot(where) {
      const aggregate = await prisma.bill.aggregate({
        where,
        _count: { _all: true },
        _sum: { totalAmount: true },
      });
      return {
        count: aggregate._count._all,
        totalAmount: aggregate._sum.totalAmount?.toString() ?? "0",
      };
    }

    try {
      const [school, qaAccountant, academicYear] =
        await Promise.all([
          prisma.school.findUniqueOrThrow({
            where: { id: primarySchoolId },
            select: { id: true },
          }),
          prisma.user.findUniqueOrThrow({
            where: { id: qaAccountantId },
            select: { name: true, email: true, role: true },
          }),
          prisma.academicYear.findFirstOrThrow({
            where: { schoolId: primarySchoolId, isActive: true },
            orderBy: { startDate: "desc" },
            select: { id: true },
          }),
        ]);
      const student = await prisma.student.findFirstOrThrow({
        where: { schoolId: primarySchoolId },
        select: { id: true },
      });
      assert.equal(school.id, primarySchoolId);
      assert.equal(qaAccountant.name, "QA Accountant");
      assert.equal(qaAccountant.email, "qa.accountant@example.test");
      assert.equal(qaAccountant.role, "ACCOUNTANT");

      const billsWhere = {
        student: { is: { schoolId: school.id } },
        academicYear: { is: { schoolId: school.id } },
      };
      const activeBillsWhere = {
        ...billsWhere,
        status: { not: "CANCELLED" },
      };
      baselineBillSnapshot = await billSnapshot(billsWhere);
      baselineSchoolSnapshot = await prisma.school.findMany({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, name: true, createdAt: true, updatedAt: true },
      });
      baselineAcademicYearSnapshot = await prisma.academicYear.findMany({
        where: { schoolId: school.id },
        orderBy: [{ startDate: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          isActive: true,
          updatedAt: true,
        },
      });

      const cookie = await sessionCookie();
      const beforeBills = await getBills(cookie);
      const beforeProfile = await getStudentProfile(
        cookie,
        student.id,
        academicYear.id,
      );
      const beforeStudentSummary = beforeProfile.financial.summary;
      const beforeActiveTotal = Math.round(
        sumActiveBilledAmount(beforeBills) * 100,
      );
      const beforeActiveAggregate = await billSnapshot(activeBillsWhere);
      assert.equal(
        beforeActiveTotal,
        Math.round(Number(beforeActiveAggregate.totalAmount) * 100),
      );

      const marker = `CANCELLED-TOTAL-QA-${randomUUID()}`;
      const newFixtureBillId = `cancelled-total-${randomUUID()}`;
      const [existingBillId, existingBillNumber] = await Promise.all([
        prisma.bill.findUnique({
          where: { id: newFixtureBillId },
          select: { id: true },
        }),
        prisma.bill.findUnique({
          where: { billNumber: marker },
          select: { id: true },
        }),
      ]);
      assert.equal(existingBillId, null);
      assert.equal(existingBillNumber, null);
      fixtureBillId = newFixtureBillId;
      const createdBill = await prisma.bill.create({
        data: {
          id: fixtureBillId,
          studentId: student.id,
          academicYearId: academicYear.id,
          billNumber: marker,
          totalAmount: "123.45",
          periodStartYear: 2083,
          periodStartMonth: 1,
          periodEndYear: 2083,
          periodEndMonth: 1,
        },
        select: {
          id: true,
          billNumber: true,
          totalAmount: true,
          studentId: true,
          academicYearId: true,
        },
      });

      const cancelResponse = await fetch(
        new URL(
          `/api/bills/${encodeURIComponent(fixtureBillId)}/cancel`,
          origin,
        ),
        {
          method: "POST",
          headers: { cookie },
        },
      );
      assert.equal(cancelResponse.status, 200);

      const afterBills = await getBills(cookie);
      const retainedBill = afterBills.find(
        (bill) => bill.id === fixtureBillId,
      );
      assert.ok(retainedBill);
      assert.equal(retainedBill.billNumber, createdBill.billNumber);
      assert.equal(retainedBill.totalAmount, "123.45");
      assert.equal(retainedBill.status, "CANCELLED");
      assert.equal(
        Math.round(sumActiveBilledAmount(afterBills) * 100),
        beforeActiveTotal,
      );

      const afterProfile = await getStudentProfile(
        cookie,
        student.id,
        academicYear.id,
      );
      const afterStudentSummary = afterProfile.financial.summary;
      assert.equal(
        afterStudentSummary.totalBilled,
        beforeStudentSummary.totalBilled,
      );
      assert.equal(
        afterStudentSummary.totalPaid,
        beforeStudentSummary.totalPaid,
      );
      assert.equal(
        afterStudentSummary.totalDue,
        beforeStudentSummary.totalDue,
      );
      const profileHistoryBill = afterProfile.financial.bills.find(
        (bill) => bill.id === fixtureBillId,
      );
      assert.ok(profileHistoryBill);
      assert.equal(profileHistoryBill.status, "CANCELLED");
      assert.equal(profileHistoryBill.remainingAmount, 0);

      console.log(
        "CANCELLED_BILL_STUDENT_SUMMARY " +
          JSON.stringify({
            before: {
              totalBilled: beforeStudentSummary.totalBilled,
              totalPaid: beforeStudentSummary.totalPaid,
              totalOutstanding: beforeStudentSummary.totalDue,
            },
            after: {
              totalBilled: afterStudentSummary.totalBilled,
              totalPaid: afterStudentSummary.totalPaid,
              totalOutstanding: afterStudentSummary.totalDue,
            },
          }),
      );

      const persistedBill = await prisma.bill.findUniqueOrThrow({
        where: { id: fixtureBillId },
        include: {
          payments: { select: { id: true } },
          creditApplications: { select: { id: true } },
        },
      });
      assert.equal(persistedBill.status, "CANCELLED");
      assert.equal(persistedBill.totalAmount.toString(), "123.45");
      assert.equal(persistedBill.payments.length, 0);
      assert.equal(persistedBill.creditApplications.length, 0);
    } finally {
      try {
        if (fixtureBillId) {
          await prisma.bill.deleteMany({ where: { id: fixtureBillId } });
          assert.equal(
            await prisma.bill.count({ where: { id: fixtureBillId } }),
            0,
          );
        }

        if (baselineBillSnapshot) {
          assert.deepEqual(
            await billSnapshot({
              student: { is: { schoolId: primarySchoolId } },
              academicYear: { is: { schoolId: primarySchoolId } },
            }),
            baselineBillSnapshot,
          );
        }
        if (baselineSchoolSnapshot) {
          assert.deepEqual(
            await prisma.school.findMany({
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: {
                id: true,
                name: true,
                createdAt: true,
                updatedAt: true,
              },
            }),
            baselineSchoolSnapshot,
          );
        }
        if (baselineAcademicYearSnapshot) {
          assert.deepEqual(
            await prisma.academicYear.findMany({
              where: { schoolId: primarySchoolId },
              orderBy: [{ startDate: "asc" }, { id: "asc" }],
              select: {
                id: true,
                name: true,
                startDate: true,
                endDate: true,
                isActive: true,
                updatedAt: true,
              },
            }),
            baselineAcademicYearSnapshot,
          );
        }
      } finally {
        await prisma.$disconnect();
      }
    }
  },
);
