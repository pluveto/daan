// src/components/CharacterEditor/validation.ts
import { z } from 'zod';

// Helper to allow empty string or positive integer
const optionalPositiveIntegerString = z.union([
  z.literal(''), // Allow empty string
  z
    .string()
    .regex(/^\d+$/, { message: 'Must be a non-negative integer' }) // Ensure it's digits
    .transform((val) => parseInt(val, 10)) // Convert to number
    .refine((val) => val >= 0, { message: 'Must be non-negative' }) // Ensure non-negative
    .transform((val) => String(val)), // Convert back to string for the input field if needed, or handle in submit
]);

export const characterSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  icon: z.string().max(2).optional(), // Allow empty, max 2 chars (for potential single emoji + variation selector)
  description: z.string().optional(),
  prompt: z.string().optional(),
  model: z.string().min(1, { message: 'Model selection is required' }), // Assuming a model must be selected
  maxHistoryStr: optionalPositiveIntegerString.optional(), // Validate as string first
});

export type CharacterFormData = z.infer<typeof characterSchema>;
