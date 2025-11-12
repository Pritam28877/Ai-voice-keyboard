import { z } from "zod";

export const dictionaryEntrySchema = z.object({
  id: z.string().optional(),
  phrase: z.string().trim().min(1, "Phrase is required"),
  canonical: z.string().trim().optional(),
  substitution: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  priority: z.number().int().min(0).max(100).default(0),
});

export type DictionaryEntryInput = z.infer<typeof dictionaryEntrySchema>;

