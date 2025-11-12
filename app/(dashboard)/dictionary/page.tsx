import type { Metadata } from "next";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import { DictionaryManager } from "@/components/dictionary/dictionary-manager";

export const metadata: Metadata = {
  title: "Dictionary | Kai Voice Keyboard",
};

export default async function DictionaryPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return null;
  }

  const entries = await prisma.dictionaryEntry.findMany({
    where: { userId },
    orderBy: [
      { priority: "desc" },
      { createdAt: "desc" },
    ],
  });

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Dictionary</h1>
        <p className="text-muted-foreground">
          Teach Gemini your brand names, abbreviations, and stylistic quirks so
          every transcript is spell-checked by context.
        </p>
      </header>

      <DictionaryManager initialEntries={entries} />
    </div>
  );
}

