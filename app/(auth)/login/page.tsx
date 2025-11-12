import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AuthCard, AuthFooterLink } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in | Kai Voice Keyboard",
  description: "Access your AI voice keyboard workspace.",
};

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dictation");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4 py-16">
      <div className="w-full max-w-md">
        <AuthCard
          title="Welcome back"
          description="Sign in to start dictating instantly."
          footer={
            <AuthFooterLink
              message="Don’t have an account?"
              href="/register"
              linkText="Create one"
            />
          }
        >
          <LoginForm />
        </AuthCard>
      </div>
    </div>
  );
}

