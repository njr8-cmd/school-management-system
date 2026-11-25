import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { authorizeSession } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { createUserSchema } from "@/lib/auth/user-account-validation";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function GET() {
  const authorization = authorizeSession(await auth(), ["ADMIN"]);
  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.message },
      { status: authorization.status },
    );
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error("Failed to load user accounts:", error);
    return NextResponse.json(
      { error: "Failed to load user accounts." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const authorization = authorizeSession(await auth(), ["ADMIN"]);
  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.message },
      { status: authorization.status },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid user account." },
      { status: 400 },
    );
  }

  try {
    const password = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        password,
        role: parsed.data.role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { error: "An account already exists for this email address." },
        { status: 409 },
      );
    }

    console.error("Failed to create user account:", error);
    return NextResponse.json(
      { error: "Failed to create user account." },
      { status: 500 },
    );
  }
}
