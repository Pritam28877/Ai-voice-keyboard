import type { Metadata } from "next";

import { DictationWorkspace } from "@/components/dictation/dictation-workspace";

export const metadata: Metadata = {
  title: "Dictation | Kai Voice Keyboard",
};

export default function DictationPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Live dictation
        </h1>
        <p className="text-muted-foreground">
          Stream microphone audio to Gemini in buffered slices, apply your custom
          dictionary, and get ready-to-send prose instantly.
        </p>
      </header>

      <DictationWorkspace />
    </div>
  );
}

