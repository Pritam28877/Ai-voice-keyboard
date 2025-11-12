import type { Metadata } from "next";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import { SettingsManager } from "@/components/settings/settings-manager";

export const metadata: Metadata = {
  title: "Settings | Kai Voice Keyboard",
};

export default async function SettingsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return null;
  }

  const settings = await prisma.userSetting.findUnique({
    where: { userId },
  });

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Tune transcription defaults, Gemini models, and workflow automation to
          match your writing cadence.
        </p>
      </header>

      <SettingsManager
        initialSettings={
          settings ?? {
            userId,
            defaultLanguage: "en-US",
            autoPunctuation: true,
            smartFormatting: true,
            removeFillerWords: false,
            enableAgentSuggestions: true,
            maxSegmentDurationMs: 7000,
            geminiModel: undefined,
            extraConfig: null,
            id: "",
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        }
      />
    </div>
  );
}

