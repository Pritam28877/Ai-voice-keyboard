"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { loginSchema } from "@/lib/auth/schemas";
import type { AuthActionState } from "@/lib/auth/types";

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
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

  const credentials = new FormData();
  credentials.set("email", parsed.data.email);
  credentials.set("password", parsed.data.password);
  credentials.set("redirectTo", "/dictation");

  try {
    await signIn("credentials", credentials);
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return {
          status: "error",
          message: "Invalid email or password.",
        };
      }

      return {
        status: "error",
        message: "Unable to sign in right now. Please try again.",
      };
    }

    throw error;
  }

  return { status: "success" };
}

