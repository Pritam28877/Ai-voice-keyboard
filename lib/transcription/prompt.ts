import type { DictionaryEntry } from "@prisma/client";

type BuildInstructionOptions = {
  language: string;
  dictionary: DictionaryEntry[];
  extraContext?: string | null;
};

export function buildTranscriptionInstruction({
  language,
  dictionary,
  extraContext,
}: BuildInstructionOptions) {
  const base = [
    `You are a meticulous AI transcription agent tasked with converting streaming voice dictation into clean, publishable ${language} text.`,
    "Apply smart punctuation, paragraphing, and casing automatically.",
    "Preserve speaker intent while removing filler words and obvious disfluencies.",
  ];

  if (extraContext) {
    base.push(`User context: ${extraContext}`);
  }

  if (dictionary.length > 0) {
    const formatted = dictionary
      .map((entry) => {
        const canonical = entry.canonical ?? entry.substitution ?? entry.phrase;
        const hints = [
          `Use "${canonical}" when the speaker says "${entry.phrase}".`,
        ];
        if (entry.substitution && entry.substitution !== canonical) {
          hints.push(`Preferred substitution: "${entry.substitution}".`);
        }
        if (entry.notes) {
          hints.push(`Notes: ${entry.notes}`);
        }
        return `- ${hints.join(" ")}`;
      })
      .join("\n");

    base.push(
      "Custom vocabulary rules (highest priority, override model guesses):",
      formatted,
    );
  }

  base.push(
    "Return only the transcript text. Never invent content the user did not say.",
  );

  return base.join("\n\n");
}

