import { z } from "zod";

export const settingsSchema = z.object({
  defaultLanguage: z.string().min(2).max(10),
  autoPunctuation: z.boolean(),
  smartFormatting: z.boolean(),
  removeFillerWords: z.boolean(),
  enableAgentSuggestions: z.boolean(),
  maxSegmentDurationMs: z.number().int().min(1000).max(20000),
  geminiModel: z.string().optional(),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

