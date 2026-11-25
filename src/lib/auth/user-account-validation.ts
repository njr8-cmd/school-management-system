import { z } from "zod";
import { APP_ROLES } from "@/lib/auth/roles";

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(14),
  role: z.enum(APP_ROLES),
}).strict();

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.email().transform((value) => value.trim().toLowerCase()).optional(),
  role: z.enum(APP_ROLES).optional(),
}).strict().refine((value) => Object.keys(value).length > 0);
