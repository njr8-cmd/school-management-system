import { isAppRole } from "@/lib/auth/roles";

export function canManageStudentCredits(
  role: string | null | undefined,
): boolean {
  return isAppRole(role);
}
