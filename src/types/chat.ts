import { NamespacedModelId } from './misc';
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

export interface Chat {
  createdAt: number;
  icon: string;
  id: string;
  characterId: string | null;
  isPinned: boolean;
  maxHistory: number | null;
  messages: Message[];
  model: NamespacedModelId;
  name: string;
  systemPrompt: string;
  input: string;
  updatedAt: number;
  temperature?: number | null;
  maxTokens?: number | null;
  topP?: number | null;
}
