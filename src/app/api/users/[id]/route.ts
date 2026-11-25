import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authorizeSession } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { updateUserSchema } from "@/lib/auth/user-account-validation";

function hasPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid account update." },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  try {
    const user = await prisma.user.update({
      where: { id },
      data: parsed.data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
    return NextResponse.json(user);
  } catch (error) {
    if (hasPrismaErrorCode(error, "P2025")) {
      return NextResponse.json(
        { error: "User account not found." },
        { status: 404 },
      );
    }
    if (hasPrismaErrorCode(error, "P2002")) {
      return NextResponse.json(
        { error: "An account already exists for this email address." },
        { status: 409 },
      );
    }

    console.error("Failed to update user account:", error);
    return NextResponse.json(
      { error: "Failed to update user account." },
      { status: 500 },
    );
  }
}
