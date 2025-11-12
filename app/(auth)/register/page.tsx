import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AuthCard, AuthFooterLink } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Create account | Kai Voice Keyboard",
  description: "Create your account to unlock the AI voice keyboard.",
};

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dictation");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4 py-16">
      <div className="w-full max-w-md">
        <AuthCard
          title="Create an account"
          description="We’ll optimize your dictations using Gemini in real-time."
          footer={
            <AuthFooterLink
              message="Already have an account?"
              href="/login"
              linkText="Sign in"
            />
          }
        >
          <RegisterForm />
        </AuthCard>
      </div>
    </div>
  );
}

