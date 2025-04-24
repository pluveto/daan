import { z } from 'zod';

const baseSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Server name is required'),
  description: z.string().optional(),
  autoApproveTools: z.boolean().default(false),
});

const sseSchema = baseSchema.extend({
  type: z.literal('sse'),
  url: z.string().url('Must be a valid URL').min(1, 'URL is required'),
  command: z.undefined().optional(),
  args: z.undefined().optional(),
});

const stdioSchema = baseSchema.extend({
  type: z.literal('stdio'),
  command: z.string().min(1, 'Command is required'),
  // Allow comma-separated string input for args for user convenience, convert to array
  args: z.preprocess(
    (val) =>
      typeof val === 'string'
        ? val
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean) // Split, trim, remove empty
        : Array.isArray(val)
          ? val.map(String).filter(Boolean) // Ensure elements are strings if array
          : [], // Default to empty array if unexpected type
    z.array(z.string()).default([]), // Expect an array of strings, default to empty
  ),
  // Ensure sse fields are not present or undefined
  url: z.undefined().optional(),
});

const builtinSchema = baseSchema.extend({
  type: z.literal('builtin-pseudo'),
  // No connection-specific fields needed validation here for the form's purpose
  url: z.undefined().optional(),
  command: z.undefined().optional(),
  args: z.undefined().optional(),
  // Note: Even though name/description aren't form-editable for built-in,
  // keeping them in the base schema is fine for type consistency.
  // The UI will handle disabling the fields.
});

export const mcpServerFormSchema = z.discriminatedUnion('type', [
  sseSchema,
  stdioSchema,
  builtinSchema, // Ensure it's included
]);

// Infer the form data type from the schema
export type McpServerFormData = z.infer<typeof mcpServerFormSchema>;
