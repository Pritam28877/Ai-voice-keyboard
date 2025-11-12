import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dictation | Kai Voice Keyboard",
};

export default function DictationPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          Live Dictation
        </h1>
        <p className="text-muted-foreground">
          Capture your thoughts with real-time Gemini transcription.
        </p>
      </header>
      <div className="rounded-xl border border-dashed border-border/70 bg-card/50 p-12 text-center text-muted-foreground">
        Dictation workspace coming together — next steps wire the audio agent,
        streaming UI, and transcription timeline.
      </div>
    </div>
  );
}

