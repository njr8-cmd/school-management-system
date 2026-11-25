import { isAppRole, type AppRole } from "@/lib/auth/roles";

type SessionLike = {
  user?: {
    id?: unknown;
    role?: unknown;
  } | null;
} | null;

export type AuthorizationResult =
  | {
      ok: true;
      userId: string;
      role: AppRole;
    }
  | {
      ok: false;
      status: 401 | 403;
      message: string;
    };

export function authorizeSession(
  session: SessionLike,
  allowedRoles: readonly AppRole[],
): AuthorizationResult {
  const userId = session?.user?.id;
  const role = session?.user?.role;

  if (
    typeof userId !== "string" ||
    userId.length === 0 ||
    !isAppRole(role)
  ) {
    return {
      ok: false,
      status: 401,
      message: "You must be signed in.",
    };
  }

  if (!allowedRoles.includes(role)) {
    return {
      ok: false,
      status: 403,
      message: "You do not have permission to perform this action.",
    };
  }

  return { ok: true, userId, role };
}
