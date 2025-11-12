import type { Metadata } from "next";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import { HistoryList } from "@/components/history/history-list";

export const metadata: Metadata = {
  title: "Transcription History | Kai Voice Keyboard",
};

export default async function HistoryPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return null;
  }

  const transcriptions = await prisma.transcription.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      title: true,
      content: true,
      status: true,
      createdAt: true,
      completedAt: true,
      durationMs: true,
      updatedAt: true,
    },
  });

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Transcription history
        </h1>
        <p className="text-muted-foreground">
          Quickly review past dictations, grab polished snippets, and continue
          where you left off.
        </p>
      </header>

      <HistoryList items={transcriptions} />
    </div>
  );
}

