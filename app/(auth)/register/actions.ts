"use server";

import { Prisma } from "@prisma/client";
import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { registerSchema } from "@/lib/auth/schemas";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import type { AuthActionState } from "@/lib/auth/types";

export async function registerAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please review the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { name, email, password } = parsed.data;

  try {
    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await hashPassword(password),
        settings: {
          create: {},
        },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        status: "error",
        fieldErrors: { email: ["Email is already registered"] },
      };
    }
    throw error;
  }

  const credentials = new FormData();
  credentials.set("email", email);
  credentials.set("password", password);
  credentials.set("redirectTo", "/dictation");

  try {
    await signIn("credentials", credentials);
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        status: "error",
        message:
          "Account created, but automatic sign-in failed. Please sign in with your credentials.",
      };
    }
    throw error;
  }

  return { status: "success" };
}

