import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "Password should be at least 8 characters long")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const loginSchema = z
  .object({
    email: z.string().email("Provide a valid email"),
    password: z.string().min(8, "Password is required"),
  })
  .transform((data) => ({
    ...data,
    email: data.email.toLowerCase(),
  }));

export const registerSchema = z
  .object({
    name: z
      .string()
      .min(2, "Name is too short")
      .max(64, "Name is too long"),
    email: z.string().email("Provide a valid email"),
    password: passwordSchema,
  })
  .transform((data) => ({
    ...data,
    email: data.email.toLowerCase(),
  }));

