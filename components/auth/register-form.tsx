"use client";

import { useActionState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { registerAction } from "@/app/(auth)/register/actions";
import { initialAuthState, type AuthActionState } from "@/lib/auth/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RegisterForm() {
  const [state, action, pending] = useActionState<
    AuthActionState,
    FormData
  >(registerAction, initialAuthState);

  useEffect(() => {
    if (state.status === "error" && state.message) {
      toast.error(state.message);
    }
    if (state.status === "success") {
      toast.success("Welcome! Redirecting to your workspace...");
    }
  }, [state]);

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          placeholder="Jane Doe"
          autoComplete="name"
          aria-invalid={state.fieldErrors?.name ? "true" : "false"}
        />
        {state.fieldErrors?.name ? (
          <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={state.fieldErrors?.email ? "true" : "false"}
        />
        {state.fieldErrors?.email ? (
          <p className="text-sm text-destructive">
            {state.fieldErrors.email[0]}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          aria-invalid={state.fieldErrors?.password ? "true" : "false"}
        />
        {state.fieldErrors?.password ? (
          <p className="text-sm text-destructive">
            {state.fieldErrors.password[0]}
          </p>
        ) : null}
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Creating account...
          </span>
        ) : (
          "Create account"
        )}
      </Button>
    </form>
  );
}

