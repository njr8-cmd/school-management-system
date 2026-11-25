import assert from "node:assert/strict";
import test from "node:test";

async function setupDatabase(activeYear) {
  const created = [];
  const options = [];
  let lockCalls = 0;
  const transaction = {
    $executeRaw: async () => {
      lockCalls += 1;
    },
    academicYear: {
      findFirst: async () => activeYear,
      create: async ({ data }) => {
        const year = { id: "created-year", ...data };
        created.push(year);
        return year;
      },
    },
  };
  const database = {
    $transaction: async (callback, transactionOptions) => {
      options.push(transactionOptions);
      return callback(transaction);
    },
  };

  const { createAcademicYearForSchool } = await import(
    "../src/lib/academic-year-setup.ts"
  );
  const year = await createAcademicYearForSchool(
    {
      name: "2084",
      startDate: new Date("2027-04-14T00:00:00.000Z"),
      endDate: new Date("2028-04-13T00:00:00.000Z"),
      schoolId: "demo-school",
    },
    database,
  );

  return { year, created, lockCalls, options };
}

test("the first academic year becomes active in a guarded transaction", async () => {
  const { year, created, lockCalls, options } = await setupDatabase(null);

  assert.equal(year.isActive, true);
  assert.equal(created.length, 1);
  assert.equal(lockCalls, 1);
  assert.deepEqual(options, [{ maxWait: 15_000, timeout: 30_000 }]);
});

test("creating another year does not deactivate the existing active year", async () => {
  const activeYear = { id: "existing-active-year" };
  const { year, created, lockCalls, options } =
    await setupDatabase(activeYear);

  assert.equal(year.isActive, false);
  assert.equal(created.length, 1);
  assert.equal(lockCalls, 1);
  assert.deepEqual(options, [{ maxWait: 15_000, timeout: 30_000 }]);
});
