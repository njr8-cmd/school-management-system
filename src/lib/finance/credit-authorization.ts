import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageStudentCredits } from "@/lib/finance/credit-access";

type CreditAuthorization =
  | {
      ok: true;
      actorId: string;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export function authorizeCreditSession(session: {
  user: { id: string; role: string };
} | null): CreditAuthorization {
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 },
      ),
    };
  }

  if (!canManageStudentCredits(session.user.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Only ADMIN or ACCOUNTANT can manage student credits." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    actorId: session.user.id,
  };
}

export async function authorizeCreditManagement(): Promise<CreditAuthorization> {
  return authorizeCreditSession(await auth());
}
