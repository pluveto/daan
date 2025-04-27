// src/settings/McpSettingsTab/schema.ts
import { z } from 'zod';

// Base schema with common fields
const McpServerConfigBaseSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Server name is required.'),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  autoApproveTools: z.boolean().default(false),
});

// Schemas for specific types
const McpServerConfigSseSchema = McpServerConfigBaseSchema.extend({
  type: z.literal('sse'),
  url: z.string().url('Invalid URL format.'),
});

const McpServerConfigStdioSchema = McpServerConfigBaseSchema.extend({
  type: z.literal('stdio'),
  command: z.string().min(1, 'Command is required.'),
  args: z.array(z.string()).optional().default([]),
});

const McpServerConfigBuiltinSchema = McpServerConfigBaseSchema.extend({
  type: z.literal('builtin-pseudo'),
  // No specific fields needed
});

// === NEW: Schema for Miniapp type ===
const McpServerConfigMiniappSchema = McpServerConfigBaseSchema.extend({
  type: z.literal('miniapp'),
  targetMiniappId: z.string().min(1, 'Target Miniapp must be selected.'),
});

// Discriminated union schema for the form
export const mcpServerFormSchema = z
  .discriminatedUnion('type', [
    McpServerConfigSseSchema,
    McpServerConfigStdioSchema,
    McpServerConfigBuiltinSchema,
    McpServerConfigMiniappSchema,
  ])
  // Refine to ensure Stdio fields are undefined if not Stdio, etc.
  // This helps TypeScript understand the shape better after validation.
  .refine((data) => (data.type === 'sse' ? !!data.url : true), {
    message: 'URL is required for SSE type',
    path: ['url'],
  })
  .refine((data) => (data.type === 'stdio' ? !!data.command : true), {
    message: 'Command is required for Stdio type',
    path: ['command'],
  })
  .refine((data) => (data.type === 'miniapp' ? !!data.targetMiniappId : true), {
    message: 'Target Miniapp ID is required for Miniapp type',
    path: ['targetMiniappId'],
  });

// Type for form data derived from the schema
export type McpServerFormData = z.infer<typeof mcpServerFormSchema>;
