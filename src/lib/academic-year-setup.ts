import { prisma } from "@/lib/prisma";

type AcademicYearSetupData = {
  name: string;
  startDate: Date;
  endDate: Date;
  schoolId: string;
};

export async function createAcademicYearForSchool(
  data: AcademicYearSetupData,
  database: typeof prisma = prisma,
) {
  return database.$transaction(
    async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(
            ${`school-management-academic-year:${data.schoolId}`},
            0
          )
        )
      `;

      const activeAcademicYear = await tx.academicYear.findFirst({
        where: {
          schoolId: data.schoolId,
          isActive: true,
        },
        select: { id: true },
      });

      return tx.academicYear.create({
        data: {
          ...data,
          isActive: activeAcademicYear === null,
        },
      });
    },
    {
      maxWait: 15_000,
      timeout: 30_000,
    },
  );
}
