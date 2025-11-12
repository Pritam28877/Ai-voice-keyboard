import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dictionary | Kai Voice Keyboard",
};

export default function DictionaryPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Dictionary</h1>
        <p className="text-muted-foreground">
          Define domain-specific vocabulary so Gemini nails every pronunciation.
        </p>
      </header>
      <div className="rounded-xl border border-dashed border-border/70 bg-card/50 p-12 text-center text-muted-foreground">
        Dictionary editor incoming — add, update, and prioritize custom terms
        soon.
      </div>
    </div>
  );
}

