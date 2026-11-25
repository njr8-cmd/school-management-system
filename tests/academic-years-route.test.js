import assert from "node:assert/strict";
import test from "node:test";

const demoSchool = {
  id: "demo-school",
  name: "Fictional Demo School",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

function request(body) {
  return new Request("https://demo.example/api/academic-years", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function withRouteMocks(t, transaction) {
  const previousSchoolId = process.env.SCHOOL_ID;
  delete process.env.SCHOOL_ID;

  const { prisma } = await import("../src/lib/prisma.ts");
  const schoolFindManyDescriptor = Object.getOwnPropertyDescriptor(
    prisma.school,
    "findMany",
  );
  Object.defineProperty(prisma.school, "findMany", {
    ...schoolFindManyDescriptor,
    value: async () => [demoSchool],
  });
  const transactionDescriptor = Object.getOwnPropertyDescriptor(
    prisma,
    "$transaction",
  );
  Object.defineProperty(prisma, "$transaction", {
    ...transactionDescriptor,
    value: transaction,
  });

  t.after(() => {
    Object.defineProperty(
      prisma.school,
      "findMany",
      schoolFindManyDescriptor,
    );
    Object.defineProperty(prisma, "$transaction", transactionDescriptor);
    if (previousSchoolId === undefined) {
      delete process.env.SCHOOL_ID;
    } else {
      process.env.SCHOOL_ID = previousSchoolId;
    }
  });
}

test("academic year creation persists through the single-school route and returns an active first year", async (t) => {
  const saved = [];
  let transactionOptions;
  const transactionClient = {
    $executeRaw: async () => 1,
    academicYear: {
      findFirst: async () => null,
      create: async ({ data }) => {
        const academicYear = { id: "demo-year", ...data };
        saved.push(academicYear);
        return academicYear;
      },
    },
  };

  await withRouteMocks(t, async (callback, options) => {
    transactionOptions = options;
    return callback(transactionClient);
  });

  const { POST } = await import("../src/app/api/academic-years/route.ts");
  const response = await POST(
    request({
      name: "2084",
      startDate: "2027-04-14T00:00:00.000Z",
      endDate: "2028-04-13T00:00:00.000Z",
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.id, "demo-year");
  assert.equal(body.schoolId, demoSchool.id);
  assert.equal(body.isActive, true);
  assert.equal(saved.length, 1);
  assert.deepEqual(transactionOptions, { maxWait: 15_000, timeout: 30_000 });
});

test("academic year creation surfaces database failures as an API error", async (t) => {
  await withRouteMocks(t, async () => {
    throw new Error("database unavailable");
  });

  const { POST } = await import("../src/app/api/academic-years/route.ts");
  const response = await POST(
    request({
      name: "2084",
      startDate: "2027-04-14T00:00:00.000Z",
      endDate: "2028-04-13T00:00:00.000Z",
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error, "Failed to create academic year.");
});

test("academic year route rejects invalid input before attempting a database write", async (t) => {
  let transactionCalls = 0;
  await withRouteMocks(t, async () => {
    transactionCalls += 1;
    throw new Error("must not be called");
  });

  const { POST } = await import("../src/app/api/academic-years/route.ts");
  const response = await POST(request({ name: "", startDate: "bad", endDate: "bad" }));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /required/i);
  assert.equal(transactionCalls, 0);
});
