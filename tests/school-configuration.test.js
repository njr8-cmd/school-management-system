import assert from "node:assert/strict";
import test from "node:test";

const configuredSchool = {
  id: "qa-configured-school",
  name: "Configured QA school",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};
const unexpectedSchoolRecord = {
  id: "qa-unexpected-school-record",
  name: "Unexpected QA school record",
  createdAt: new Date("2026-01-02T00:00:00.000Z"),
};

async function withSchoolConfig(env, run) {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSchoolId = process.env.SCHOOL_ID;
  process.env.NODE_ENV = env.nodeEnv ?? "test";
  if (env.schoolId === undefined) {
    delete process.env.SCHOOL_ID;
  } else {
    process.env.SCHOOL_ID = env.schoolId;
  }

  try {
    const { getConfiguredSchool } = await import("../src/lib/school.ts");
    const schools = env.schoolRecords ?? [configuredSchool];
    const client = {
      school: {
        findMany: async () => schools,
        findUnique: async ({ where }) =>
          schools.find((school) => school.id === where.id) ?? null,
      },
    };
    await run(getConfiguredSchool, client);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousSchoolId === undefined) {
      delete process.env.SCHOOL_ID;
    } else {
      process.env.SCHOOL_ID = previousSchoolId;
    }
  }
}

test("QA deployment configuration selects only the explicitly configured school", async () => {
  await withSchoolConfig(
    {
      schoolId: configuredSchool.id,
      schoolRecords: [configuredSchool, unexpectedSchoolRecord],
    },
    async (getSchool, client) => {
      assert.equal((await getSchool(client)).id, configuredSchool.id);
    },
  );
});

test("an unexpected extra school record requires reconciliation without SCHOOL_ID", async () => {
  await withSchoolConfig(
    { schoolRecords: [configuredSchool, unexpectedSchoolRecord] },
    async (getSchool, client) => {
      await assert.rejects(
        getSchool(client),
        /Multiple school records were found/,
      );
    },
  );
});

test("production rejects extra school records even when SCHOOL_ID is set", async () => {
  await withSchoolConfig(
    {
      nodeEnv: "production",
      schoolId: configuredSchool.id,
      schoolRecords: [configuredSchool, unexpectedSchoolRecord],
    },
    async (getSchool, client) => {
      await assert.rejects(
        getSchool(client),
        /single-school installation must be reconciled/,
      );
    },
  );
});

test("a missing SCHOOL_ID does not fall back to another existing school", async () => {
  await withSchoolConfig(
    { schoolId: "missing-school" },
    async (getSchool, client) => {
      await assert.rejects(
        getSchool(client),
        /configured SCHOOL_ID does not match an existing school/,
      );
    },
  );
});

test("a single school needs no SCHOOL_ID override", async () => {
  await withSchoolConfig({}, async (getSchool) => {
    const singleSchoolClient = {
      school: {
        findMany: async () => [configuredSchool],
        findUnique: async () => null,
      },
    };
    assert.equal(
      (await getSchool(singleSchoolClient)).id,
      configuredSchool.id,
    );
  });
});

test("initial setup creates one record and repeated setup updates that same record", async () => {
  await withSchoolConfig({}, async () => {
    const { saveConfiguredSchool } = await import("../src/lib/school.ts");
    const records = [];
    let creates = 0;
    let updates = 0;
    const transaction = {
      $executeRaw: async () => 1,
      school: {
        findMany: async () =>
          [...records]
            .sort(
              (left, right) =>
                left.createdAt - right.createdAt ||
                left.id.localeCompare(right.id),
            )
            .slice(0, 2),
        findUnique: async ({ where }) =>
          records.find((school) => school.id === where.id) ?? null,
        create: async ({ data }) => {
          creates += 1;
          const school = {
            ...data,
            id: "created-school",
            createdAt: new Date("2026-01-03T00:00:00.000Z"),
            updatedAt: new Date("2026-01-03T00:00:00.000Z"),
          };
          records.push(school);
          return school;
        },
        update: async ({ where, data }) => {
          updates += 1;
          const school = records.find((item) => item.id === where.id);
          Object.assign(school, data);
          school.updatedAt = new Date("2026-01-04T00:00:00.000Z");
          return school;
        },
      },
    };
    const database = {
      $transaction: async (callback) => callback(transaction),
    };
    const first = await saveConfiguredSchool(
      { name: "Configured QA school" },
      database,
    );
    const second = await saveConfiguredSchool(
      { name: "Updated QA school" },
      database,
    );

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(first.school.id, second.school.id);
    assert.equal(creates, 1);
    assert.equal(updates, 1);
    assert.equal(records.length, 1);
    assert.equal(records[0].name, "Updated QA school");
  });
});

test("missing school configuration remains empty for setup guidance", async () => {
  await withSchoolConfig({}, async (getSchool) => {
    const emptyClient = {
      school: {
        findMany: async () => [],
        findUnique: async () => null,
      },
    };
    assert.equal(await getSchool(emptyClient), null);
    const { SCHOOL_SETUP_REQUIRED_MESSAGE } = await import(
      "../src/lib/school.ts"
    );
    assert.match(SCHOOL_SETUP_REQUIRED_MESSAGE, /School setup is required/);
  });
});
