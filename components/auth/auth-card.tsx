import Link from "next/link";
import { type ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AuthCardProps = {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
};

export function AuthCard({
  title,
  description,
  children,
  footer,
}: AuthCardProps) {
  return (
    <Card className="w-full max-w-md border border-border/60 bg-card/70 backdrop-blur">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">{children}</CardContent>
      <CardFooter className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
        {footer}
      </CardFooter>
    </Card>
  );
}

export function AuthFooterLink({
  message,
  href,
  linkText,
}: {
  message: ReactNode;
  href: string;
  linkText: string;
}) {
  return (
    <span>
      {message}{" "}
      <Link href={href} className="font-medium text-primary hover:underline">
        {linkText}
      </Link>
    </span>
  );
}

