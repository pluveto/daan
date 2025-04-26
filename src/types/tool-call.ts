export type ValidRoles = 'user' | 'assistant' | 'system';

interface BaseToolCallInfo {
  callId: string; // Unique ID for this specific tool call instance
  toolName: string;
}

export interface PendingToolCallInfo extends BaseToolCallInfo {
  type: 'pending';
  serverId: string;
  serverName: string; // User-friendly name for display
  args: any; // Parsed arguments
}

export interface RunningToolCallInfo extends BaseToolCallInfo {
  type: 'running';
  serverId: string;
  serverName: string;
  args: any;
}

export interface ResultToolCallInfo extends BaseToolCallInfo {
  type: 'result';
  isError: false;
  serverId: string;
  serverName: string;
  args: any;
}

export interface ErrorToolCallInfo extends BaseToolCallInfo {
  type: 'error';
  isError: true;
  serverId?: string;
  serverName?: string;
  args?: any;
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
