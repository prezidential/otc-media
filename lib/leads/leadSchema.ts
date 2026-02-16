import { z } from "zod";

export const LeadItemSchema = z.object({
  angle: z.string().min(10),
  why_now: z.string().min(10),
  who_it_impacts: z.string().min(5),
  contrarian_take: z.string().min(10),
  confidence: z.number().min(0).max(1),
  sources: z.array(z.string().url()).min(1)
});

export const LeadsOutputSchema = z.object({
  directive: z.string(),
  leads: z.array(LeadItemSchema).min(1).max(6)
});

export type LeadItem = z.infer<typeof LeadItemSchema>;
export type LeadsOutput = z.infer<typeof LeadsOutputSchema>;