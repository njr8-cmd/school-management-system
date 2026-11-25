export const APP_ROLES = ["ADMIN", "ACCOUNTANT"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function isAppRole(value: unknown): value is AppRole {
  return value === "ADMIN" || value === "ACCOUNTANT";
}
