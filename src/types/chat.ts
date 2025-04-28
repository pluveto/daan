import { ToolCallInfo } from './tool-call';

export interface Message {
  content: string;
  id: string;
  isStreaming?: boolean;
  role:
    | 'user'
    | 'assistant'
    | 'system'
    | 'divider'
    | 'tool_call_pending'
    | 'tool_call_result';
  timestamp: number;
  toolCallInfo?: ToolCallInfo | null;
}
