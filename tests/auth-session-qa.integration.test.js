import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import "dotenv/config";
import { encode } from "next-auth/jwt";
import test from "node:test";
import {
  connectToTestDatabase,
  getVerifiedTestTarget,
} from "./billing/helpers/database.js";

const enabled =
  process.env.PHASE6_AUTH_QA_CONFIRMATION === "PHASE6_AUTH_QA_ONLY";
const approvedHost =
  "ep-green-glade-ayptuugl-pooler.c-5.us-east-2.aws.neon.tech";
const approvedDatabase = "neondb";
const qaAccountantId = "cmwtatksy0001row4l4pgi3x7";
const primarySchoolId = "cmwtatkm10000row42cgw4b64";
const temporaryExpenseIds = new Set();
const operationalApiPaths = [
  "/api/students",
  "/api/academic-years",
  "/api/fees",
  "/api/bills",
  "/api/payments",
  "/api/expenses",
  "/api/student-credits",
  "/api/teacher-salaries",
];

test(
  "Phase 6 auth/session and role QA against isolated QA app",
  { skip: enabled ? false : "requires explicit isolated auth QA approval" },
  async (t) => {
    const target = getVerifiedTestTarget();
    assert.equal(target.host, approvedHost);
    assert.equal(target.database, approvedDatabase);

    const baseUrl = process.env.PHASE6_AUTH_TEST_BASE_URL;
    assert.ok(baseUrl, "Set PHASE6_AUTH_TEST_BASE_URL to the local QA app.");
    const origin = new URL(baseUrl);
    assert.equal(origin.protocol, "http:");
    assert.ok(
      origin.hostname === "127.0.0.1" ||
        origin.hostname === "localhost" ||
        origin.hostname === "::1",
      "Auth integration tests may only call a loopback app.",
    );

    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
    assert.ok(secret, "Auth secret must be loaded from the local .env file.");

    const prisma = await connectToTestDatabase();
    let qaAccount;
    let temporaryUserId;
    let qaRoleChanged = false;
    const temporaryEmail = `phase6-auth-${randomUUID()}@example.test`;

    async function sessionCookie(id, role) {
      const token = await encode({
        secret,
        salt: "authjs.session-token",
        token: {
          id,
          sub: id,
          role,
          name: "Phase 6 session test",
          email: "phase6-session@example.test",
        },
      });
      return `authjs.session-token=${token}`;
    }

    async function get(path, cookie, redirect = "follow") {
      return fetch(new URL(path, origin), {
        headers: cookie ? { cookie } : {},
        redirect,
      });
    }

    async function post(path, cookie, body) {
      return fetch(new URL(path, origin), {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    }

    async function patch(path, cookie, body) {
      return fetch(new URL(path, origin), {
        method: "PATCH",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    }

    async function remove(path, cookie, body) {
      return fetch(new URL(path, origin), {
        method: "DELETE",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    }

    try {
      qaAccount = await prisma.user.findUniqueOrThrow({
        where: { id: qaAccountantId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          password: true,
          createdAt: true,
        },
      });
      assert.equal(qaAccount.name, "QA Accountant");
      assert.equal(qaAccount.email, "qa.accountant@example.test");
      assert.equal(qaAccount.role, "ACCOUNTANT");

      await t.test("anonymous APIs and protected pages are rejected", async () => {
        const apiResponse = await get("/api/users", null);
        assert.equal(apiResponse.status, 401);
        const expenseVoidResponse = await remove(
          "/api/expenses?id=phase6-anonymous",
          "",
          { reason: "Unauthenticated request test" },
        );
        assert.equal(expenseVoidResponse.status, 401);
        const pageResponse = await get(
          "/dashboard/finance/expenses",
          null,
          "manual",
        );
        assert.ok([302, 307].includes(pageResponse.status));
        assert.match(pageResponse.headers.get("location") ?? "", /\/login/);
      });

      for (const role of ["ADMIN", "ACCOUNTANT"]) {
        await t.test(`deleted ${role} sessions are rejected`, async () => {
          const cookie = await sessionCookie(
            `deleted-${randomUUID()}`,
            role,
          );
          const apiResponse = await get("/api/students", cookie);
          assert.equal(apiResponse.status, 401);
          const pageResponse = await get(
            "/dashboard/finance/expenses",
            cookie,
            "manual",
          );
          assert.ok([302, 307].includes(pageResponse.status));
          assert.match(pageResponse.headers.get("location") ?? "", /\/login/);
        });
      }

      const staleAdminCookie = await sessionCookie(qaAccount.id, "ADMIN");
      const accountantCookie = await sessionCookie(
        qaAccount.id,
        "ACCOUNTANT",
      );

      await t.test(
        "database ACCOUNTANT role overrides stale ADMIN JWT permissions",
        async () => {
          const managementResponse = await get(
            "/api/users",
            staleAdminCookie,
          );
          assert.equal(managementResponse.status, 403);
          const operationalResponse = await get(
            "/api/students",
            staleAdminCookie,
          );
          assert.equal(operationalResponse.status, 200);
          const userPage = await get(
            "/dashboard/users",
            staleAdminCookie,
            "manual",
          );
          assert.ok([302, 307].includes(userPage.status));
          assert.match(
            userPage.headers.get("location") ?? "",
            /\/dashboard/,
          );
        },
      );

      await t.test(
        "ACCOUNTANT retains academic and financial operational access",
        async () => {
          for (const path of operationalApiPaths) {
            const response = await get(path, accountantCookie);
            assert.equal(
              response.status,
              200,
              `${path} returned ${response.status}`,
            );
          }

          const missingReasonResponse = await remove(
            "/api/expenses?id=phase6-missing-reason",
            accountantCookie,
            {},
          );
          assert.equal(missingReasonResponse.status, 400);

          const academicYear = await prisma.academicYear.findFirstOrThrow({
            where: { schoolId: primarySchoolId, isActive: true },
            orderBy: { startDate: "desc" },
            select: { id: true },
          });
          const marker = `PHASE6-AUTH-${randomUUID()}`;
          const createdResponse = await post(
            "/api/expenses",
            accountantCookie,
            {
              academicYearId: academicYear.id,
              category: "OTHER",
              description: marker,
              amount: 1,
              expenseDate: "2083-08-07",
              paymentMethod: "CASH",
            },
          );
          assert.equal(createdResponse.status, 201);
          const created = await createdResponse.json();
          temporaryExpenseIds.add(created.id);

          const voidResponse = await remove(
            `/api/expenses?id=${encodeURIComponent(created.id)}`,
            accountantCookie,
            { reason: "Authorized QA void" },
          );
          assert.equal(voidResponse.status, 200);
          const persistedExpense = await prisma.expense.findUniqueOrThrow({
            where: { id: created.id },
            select: {
              voidedAt: true,
              voidReason: true,
              voidedByUserId: true,
            },
          });
          assert.ok(persistedExpense.voidedAt);
          assert.equal(persistedExpense.voidReason, "Authorized QA void");
          assert.equal(persistedExpense.voidedByUserId, qaAccount.id);

          const expensesResponse = await get(
            "/api/expenses",
            accountantCookie,
          );
          assert.equal(expensesResponse.status, 200);
          const listedExpenses = await expensesResponse.json();
          const retainedExpense = listedExpenses.find(
            (expense) => expense.id === created.id,
          );
          assert.equal(retainedExpense?.voidReason, "Authorized QA void");
          assert.equal(retainedExpense?.voidedBy?.id, qaAccount.id);
        },
      );

      await t.test(
        "ACCOUNTANT cannot create users or promote their own role",
        async () => {
          const createResponse = await post("/api/users", accountantCookie, {
            name: "Rejected Phase 6 account",
            email: temporaryEmail,
            password: randomBytes(24).toString("base64url"),
            role: "ADMIN",
          });
          assert.equal(createResponse.status, 403);

          const promoteResponse = await patch(
            `/api/users/${encodeURIComponent(qaAccount.id)}`,
            accountantCookie,
            { role: "ADMIN" },
          );
          assert.equal(promoteResponse.status, 403);
          const schoolSettingsPage = await get(
            "/dashboard/school",
            accountantCookie,
            "manual",
          );
          assert.ok([302, 307].includes(schoolSettingsPage.status));
          assert.match(
            schoolSettingsPage.headers.get("location") ?? "",
            /\/dashboard$/,
          );
          assert.equal(
            await prisma.user.count({ where: { email: temporaryEmail } }),
            0,
          );
          assert.equal(
            (
              await prisma.user.findUniqueOrThrow({
                where: { id: qaAccount.id },
                select: { role: true },
              })
            ).role,
            "ACCOUNTANT",
          );
        },
      );

      await t.test(
        "a changed database role becomes effective with an old JWT",
        async () => {
          qaRoleChanged = true;
          await prisma.user.update({
            where: { id: qaAccount.id },
            data: { role: "ADMIN" },
          });

          const managementResponse = await get(
            "/api/users",
            accountantCookie,
          );
          assert.equal(managementResponse.status, 200);
          const userPage = await get(
            "/dashboard/users",
            accountantCookie,
            "manual",
          );
          assert.equal(userPage.status, 200);
          assert.match(await userPage.text(), /User accounts/);
          const schoolSettingsPage = await get(
            "/dashboard/school",
            accountantCookie,
            "manual",
          );
          assert.equal(schoolSettingsPage.status, 200);
        },
      );

      const adminCookie = await sessionCookie(qaAccount.id, "ADMIN");

      await t.test(
        "ADMIN can create and change account roles without exposing passwords",
        async () => {
          const createdResponse = await post("/api/users", adminCookie, {
            name: `PHASE6-AUTH-${randomUUID()}`,
            email: temporaryEmail,
            password: randomBytes(24).toString("base64url"),
            role: "ACCOUNTANT",
          });
          assert.equal(createdResponse.status, 201);
          const created = await createdResponse.json();
          temporaryUserId = created.id;
          assert.ok(temporaryUserId);
          assert.equal(Object.hasOwn(created, "password"), false);

          const stored = await prisma.user.findUniqueOrThrow({
            where: { id: temporaryUserId },
            select: { role: true },
          });
          assert.equal(stored.role, "ACCOUNTANT");

          const changedResponse = await patch(
            `/api/users/${encodeURIComponent(temporaryUserId)}`,
            adminCookie,
            { role: "ADMIN" },
          );
          assert.equal(changedResponse.status, 200);
          assert.equal((await changedResponse.json()).role, "ADMIN");
        },
      );

      await t.test("unknown roles cannot be assigned", async () => {
        const response = await post("/api/users", adminCookie, {
          name: "Invalid role test",
          email: temporaryEmail,
          password: randomBytes(24).toString("base64url"),
          role: "BOARD_MEMBER",
        });
        assert.equal(response.status, 400);
        assert.equal(
          await prisma.user.count({ where: { email: temporaryEmail } }),
          temporaryUserId ? 1 : 0,
        );
      });

      await t.test(
        "ADMIN retains all sampled Accountant operational API access",
        async () => {
          for (const path of operationalApiPaths) {
            const response = await get(path, adminCookie);
            assert.equal(
              response.status,
              200,
              `${path} returned ${response.status}`,
            );
          }
        },
      );
    } finally {
      if (temporaryExpenseIds.size > 0) {
        await prisma.expense.deleteMany({
          where: { id: { in: [...temporaryExpenseIds] } },
        });
      }
      if (temporaryUserId) {
        await prisma.user.deleteMany({ where: { id: temporaryUserId } });
      }
      if (qaRoleChanged) {
        await prisma.user.update({
          where: { id: qaAccountantId },
          data: { role: "ACCOUNTANT" },
        });
      }

      if (qaAccount) {
        const [remainingTemporaryUsers, restoredQaAccount] =
          await Promise.all([
            prisma.user.findMany({
              where: { email: temporaryEmail },
              select: { id: true },
            }),
            prisma.user.findUniqueOrThrow({
              where: { id: qaAccountantId },
              select: {
                name: true,
                email: true,
                role: true,
                createdAt: true,
                password: true,
              },
            }),
          ]);
        assert.deepEqual(remainingTemporaryUsers, []);
        assert.equal(restoredQaAccount.name, "QA Accountant");
        assert.equal(restoredQaAccount.email, "qa.accountant@example.test");
        assert.equal(restoredQaAccount.role, "ACCOUNTANT");
        assert.equal(restoredQaAccount.password, qaAccount.password);
      }
      await prisma.$disconnect();
      console.log(
        "AUTH_QA_CLEANUP " +
          JSON.stringify({
            temporaryUserIds: temporaryUserId ? [temporaryUserId] : [],
            remainingTemporaryUserIds: [],
            qaAccountRoleRestored: qaAccount ? "ACCOUNTANT" : null,
          }),
      );
    }
  },
);
