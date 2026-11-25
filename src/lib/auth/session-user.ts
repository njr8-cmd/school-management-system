import { isAppRole, type AppRole } from "@/lib/auth/roles";

export type CurrentSessionUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
};

type UserLookup = (
  id: string,
) => Promise<{
  id: string;
  name: string;
  email: string;
  role: unknown;
} | null>;

export async function getCurrentSessionUser(
  userId: unknown,
  findUser: UserLookup,
): Promise<CurrentSessionUser | null> {
  if (typeof userId !== "string" || userId.length === 0) {
    return null;
  }

  const user = await findUser(userId);
  if (!user || !isAppRole(user.role)) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export async function refreshSessionToken<
  T extends Record<string, unknown>,
>(
  token: T,
  userId: unknown,
  findUser: UserLookup,
): Promise<(T & CurrentSessionUser) | null> {
  const currentUser = await getCurrentSessionUser(userId, findUser);
  return currentUser ? { ...token, ...currentUser } : null;
}
