"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Mic } from "lucide-react";

import { signOutAction } from "@/app/(dashboard)/actions";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { appNavItems } from "@/lib/navigation";

type SidebarProps = {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
};

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 shrink-0 border-r border-border/80 bg-card/50 backdrop-blur xl:block">
      <div className="flex h-full flex-col px-6 py-8">
        <div className="mb-10">
          <Link
            href="/dictation"
            className="flex items-center gap-3 text-lg font-semibold"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Mic className="h-5 w-5" />
            </span>
            Kai Voice Keyboard
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">
            Stream dictation, tune vocabulary, and stay in flow.
          </p>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {appNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/dictation" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-primary/10",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-primary",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-10 flex items-center gap-4 rounded-lg border border-border/80 bg-background/60 p-4">
          <Avatar className="h-12 w-12">
            {user.image ? <AvatarImage src={user.image} alt={user.name ?? ""} /> : null}
            <AvatarFallback>
              {user.name
                ? user.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()
                : "YOU"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="text-sm font-medium">
              {user.name ?? user.email ?? "Your account"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {user.email}
            </p>
          </div>
          <form action={signOutAction}>
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              <span className="sr-only">Sign out</span>
            </Button>
          </form>
        </div>
      </div>
    </aside>
  );
}

