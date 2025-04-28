// src/types/internal.ts
import type { CustomCharacter as _CustomCharacter } from './character'; // Import original for re-export
import { NamespacedModelId } from './misc';
import { ToolCallInfo } from './tool-call'; // Assuming ToolCallInfo is sufficiently generic

/** Internal representation of a message */
export interface MessageEntity {
  id: string; // Unique message ID (UUID)
  chatId: string; // Foreign key to the chat
  role:
    | 'user'
    | 'assistant'
    | 'system'
    | 'tool_call_result'
    | 'tool_call_pending'; // Core roles + tool handling
  content: string; // The message text content
  timestamp: number; // Unix timestamp (ms) of creation/last update
  providerFormatData?: Record<string, any>; // Optional: Store original provider data if needed
  toolCallInfo?: ToolCallInfo | null; // Link to tool call state/result
  metadata?: Record<string, any>; // For future expansion (e.g., reactions, edits)

  // Transient UI state hints (Not typically stored directly in the main message table)
  isStreaming?: boolean; // Hint for UI rendering
  isError?: boolean; // Indicate if this message represents an error state
  isHidden?: boolean; // E.g., for hidden tool call result messages fed to the AI
}

/** Internal representation of a chat */
export interface ChatEntity {
  id: string; // Unique chat ID (UUID)
  name: string;
  icon: string;
  createdAt: number; // Timestamp of creation
  updatedAt: number; // Timestamp of last message or setting change
  isPinned: boolean;
  characterId: string | null; // Link to CustomCharacter ID

  // Core parameters (saved with the chat)
  model: NamespacedModelId;
  systemPrompt: string;
  maxHistory: number | null; // Max *messages* (user/assistant count) sent to API. null = use global default.
  temperature: number | null; // Explicitly null means use effective default
  maxTokens: number | null; // Explicitly null means use effective default
  topP: number | null; // Explicitly null means use effective default

  // Transient UI state (Not stored in DB)
  // transientInput?: string; // Managed by Jotai input state
}

/** Internal representation of Character - currently same as external */
export type CharacterEntity = _CustomCharacter;
// Re-export for convenience if needed elsewhere
export type { _CustomCharacter as CustomCharacter };
