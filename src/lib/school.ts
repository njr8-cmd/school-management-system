import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type SchoolDatabaseClient = Pick<Prisma.TransactionClient, "school">;

export type SchoolProfileInput = {
  name: string;
  shortName?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  establishedYear?: number | null;
  description?: string | null;
};

export const SCHOOL_SETUP_REQUIRED_MESSAGE =
  "School setup is required. Configure the school profile before using school modules.";

export class SchoolConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchoolConfigurationError";
  }
}

export async function getConfiguredSchool(
  client: SchoolDatabaseClient = prisma,
) {
  const schools = await client.school.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 2,
  });

  if (process.env.NODE_ENV === "production" && schools.length > 1) {
    throw new SchoolConfigurationError(
      "Multiple school records were found. This single-school installation must be reconciled before it can continue.",
    );
  }

  const configuredSchoolId = process.env.SCHOOL_ID?.trim();
  if (configuredSchoolId) {
    const school =
      schools.find(({ id }) => id === configuredSchoolId) ??
      (await client.school.findUnique({
        where: { id: configuredSchoolId },
      }));

    if (!school) {
      throw new SchoolConfigurationError(
        "The configured SCHOOL_ID does not match an existing school. Verify the deployment configuration.",
      );
    }

    return school;
  }

  if (schools.length > 1) {
    throw new SchoolConfigurationError(
      "Multiple school records were found. Configure SCHOOL_ID for this environment or reconcile the installation; school switching is not supported.",
    );
  }

  return schools[0] ?? null;
}

export async function saveConfiguredSchool(
  data: SchoolProfileInput,
  database: typeof prisma = prisma,
) {
  return database.$transaction(
    async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended('school-management-single-school-setup', 0)
        )
      `;

      const existingSchool = await getConfiguredSchool(tx);
      if (existingSchool) {
        return {
          school: await tx.school.update({
            where: { id: existingSchool.id },
            data,
          }),
          created: false,
        };
      }

      return {
        school: await tx.school.create({ data }),
        created: true,
      };
    },
    {
      maxWait: 15_000,
      timeout: 30_000,
    },
  );
}
