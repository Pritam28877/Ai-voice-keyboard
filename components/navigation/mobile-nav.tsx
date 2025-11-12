"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Mic } from "lucide-react";

import { signOutAction } from "@/app/(dashboard)/actions";
import { appNavItems } from "@/lib/navigation";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

export function MobileNav({
  userName,
}: {
  userName?: string | null;
}) {
  const pathname = usePathname();

  return (
    <header className="flex items-center justify-between border-b border-border/70 bg-background/80 px-4 py-4 backdrop-blur xl:hidden">
      <Link href="/dictation" className="flex items-center gap-2 text-base font-semibold">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Mic className="h-4 w-4" />
        </span>
        Kai Voice Keyboard
      </Link>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="flex flex-col">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Mic className="h-4 w-4" />
              </span>
              Kai Voice Keyboard
            </SheetTitle>
            <SheetDescription>
              Signed in as {userName ?? "you"}
            </SheetDescription>
          </SheetHeader>
          <nav className="mt-6 flex flex-col gap-1">
            {appNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/dictation" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="w-full"
                >
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    className="mb-1 flex w-full items-center justify-start gap-3"
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </nav>
          <Separator className="my-6" />
          <form action={signOutAction} className="mt-auto">
            <Button variant="destructive" className="w-full">
              Sign out
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </header>
  );
}

