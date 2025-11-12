import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { MobileNav } from "@/components/navigation/mobile-nav";
import { Sidebar } from "@/components/navigation/sidebar";

type DashboardLayoutProps = {
  children: ReactNode;
};

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <>
      <MobileNav userName={session.user.name ?? session.user.email} />
      <div className="flex min-h-[calc(100vh-64px)] bg-background xl:min-h-screen">
        <Sidebar user={session.user} />
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="mx-auto h-full w-full max-w-5xl px-4 py-8 md:px-6 md:py-10">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}

