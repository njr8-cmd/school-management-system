import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const expectedHost = process.env.ADMIN_PROVISION_EXPECTED_HOST;
  const expectedDatabase = process.env.ADMIN_PROVISION_EXPECTED_DATABASE;
  const name = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (process.env.ADMIN_PROVISION_CONFIRMATION !== "CREATE_ADMIN") {
    throw new Error(
      "Set ADMIN_PROVISION_CONFIRMATION=CREATE_ADMIN to confirm account creation.",
    );
  }

  if (
    !databaseUrl ||
    !expectedHost ||
    !expectedDatabase ||
    !name ||
    !email ||
    !password
  ) {
    throw new Error(
      "DATABASE_URL, ADMIN_PROVISION_EXPECTED_HOST, ADMIN_PROVISION_EXPECTED_DATABASE, ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD are required.",
    );
  }

  let target: URL;
  try {
    target = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  const database = decodeURIComponent(target.pathname.replace(/^\/+/, ""));
  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    target.hostname !== expectedHost ||
    database !== expectedDatabase
  ) {
    throw new Error(
      "DATABASE_URL does not match the explicitly approved provisioning host and database.",
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("ADMIN_EMAIL must be a valid email address.");
  }

  if (password.length < 14) {
    throw new Error("ADMIN_PASSWORD must be at least 14 characters.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended('school-management-admin-bootstrap', 0)
          )
        `;

        const userCount = await tx.user.count();
        const schoolCount = await tx.school.count();

        if (userCount > 0 || schoolCount > 0) {
          throw new Error(
            "Admin bootstrap requires a database with no users or schools; no data was changed.",
          );
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        await tx.user.create({
          data: {
            name,
            email,
            password: hashedPassword,
            role: "ADMIN",
          },
        });
      },
      {
        maxWait: 15_000,
        timeout: 30_000,
      },
    );

    console.info(`Admin account created for ${email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Admin provisioning failed.",
  );
  process.exitCode = 1;
});
