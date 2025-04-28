import { z } from 'zod';

export type ValidRoles = 'user' | 'assistant' | 'system';

export const McpToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.any(),
  outputSchema: z.any().optional(),
});

export const MiniappMcpDefinitionSchema = z.object({
  serverInfo: z.object({
    name: z.string(),
    version: z.string(),
  }),
  tools: McpToolDefinitionSchema.array(),
});

export type McpToolDefinition = z.infer<typeof McpToolDefinitionSchema>;
export type MiniappMcpDefinition = z.infer<typeof MiniappMcpDefinitionSchema>;

interface BaseToolCallInfo {
  callId: string; // Unique ID for this specific tool call instance
  toolName: string;
  serverId: string;
  serverName: string; // User-friendly name for display
  args: any; // Parsed arguments
}

export interface PendingToolCallInfo extends BaseToolCallInfo {
  type: 'pending';
}

export interface RunningToolCallInfo extends BaseToolCallInfo {
  type: 'running';
}

export interface ResultToolCallInfo extends BaseToolCallInfo {
  type: 'result';
  isError: false;
}

export interface ErrorToolCallInfo extends BaseToolCallInfo {
  type: 'error';
  isError: true;
  errorMessage?: string;
}

export interface DeniedToolCallInfo extends BaseToolCallInfo {
  type: 'denied';
}

export type ToolCallInfo =
  | PendingToolCallInfo
  | RunningToolCallInfo
  | ResultToolCallInfo
  | ErrorToolCallInfo
  | DeniedToolCallInfo;

export function getFriendlyNameOfToolCallInfo(info: ToolCallInfo): string {
  switch (info.type) {
    case 'pending':
      return info.serverName;
    case 'running':
      return info.serverName;
    case 'result':
      return '(Result)';
    case 'error':
      return '(Error)';
    case 'denied':
      return '(Denied)';
    default:
      return '';
  }
}
