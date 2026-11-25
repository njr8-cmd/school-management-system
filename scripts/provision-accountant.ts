import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const expectedHost = process.env.ACCOUNTANT_PROVISION_EXPECTED_HOST;
  const expectedDatabase = process.env.ACCOUNTANT_PROVISION_EXPECTED_DATABASE;
  const name = process.env.ACCOUNTANT_NAME?.trim();
  const email = process.env.ACCOUNTANT_EMAIL?.trim().toLowerCase();
  const password = process.env.ACCOUNTANT_PASSWORD;

  if (process.env.ACCOUNTANT_PROVISION_CONFIRMATION !== "CREATE_ACCOUNTANT") {
    throw new Error(
      "Set ACCOUNTANT_PROVISION_CONFIRMATION=CREATE_ACCOUNTANT to confirm account creation.",
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
      "DATABASE_URL, ACCOUNTANT_PROVISION_EXPECTED_HOST, ACCOUNTANT_PROVISION_EXPECTED_DATABASE, ACCOUNTANT_NAME, ACCOUNTANT_EMAIL, and ACCOUNTANT_PASSWORD are required.",
    );
  }

  let target: URL;
  try {
    target = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  const database = decodeURIComponent(target.pathname.replace(/^\//, ""));
  if (target.hostname !== expectedHost || database !== expectedDatabase) {
    throw new Error(
      "DATABASE_URL does not match the explicitly approved provisioning host and database.",
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("ACCOUNTANT_EMAIL must be a valid email address.");
  }

  if (password.length < 14) {
    throw new Error("ACCOUNTANT_PASSWORD must be at least 14 characters.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new Error(
        "An account already exists for ACCOUNTANT_EMAIL; no account or password was changed.",
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: "ACCOUNTANT",
      },
    });

    console.info(`Accountant account created for ${email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Account provisioning failed.",
  );
  process.exitCode = 1;
});
