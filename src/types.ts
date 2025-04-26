// src/types.ts

export type ValidRoles = 'user' | 'assistant' | 'system';

// --- Tool Call Info Structure ---
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
  }
}

// --- End Tool Call Info ---

export interface Message {
  content: string;
  id: string;
  isStreaming?: boolean;
  role: ValidRoles | 'divider' | 'tool_call_pending' | 'tool_call_result';
  timestamp: number;
  toolCallInfo?: ToolCallInfo | null;
}

// Represents a namespaced model ID, e.g., "openai::gpt-4o" or "custom::my-model"
export type NamespacedModelId = `${string}::${string}`;

export interface Chat {
  createdAt: number;
  icon: string;
  id: string;
  characterId: string | null;
  isPinned: boolean;
  maxHistory: number | null;
  messages: Message[];
  model: NamespacedModelId; // Use namespaced ID
  name: string;
  systemPrompt: string;
  input: string;
  updatedAt: number;

  /** Overrides the default temperature for this chat. Null uses default. */
  temperature?: number | null;
  /** Overrides the default max tokens for this chat. Null uses default. */
  maxTokens?: number | null;
  /** Overrides the default top P for this chat. Null uses default. */
  topP?: number | null;
}

// Model definition within a provider
export interface ApiModelConfig {
  id: NamespacedModelId; // Fully namespaced ID (e.g., "openai::gpt-4o")
  name: string; // User-facing display name (e.g., "GPT-4o")
  supportsFileUpload?: boolean;
  supportsImageUpload?: boolean;
  // Optional model-specific parameter overrides (null = use provider/global default)
  temperature?: number | null;
  maxTokens?: number | null;
  topP?: number | null;
}

// API Provider Configuration
export interface ApiProviderConfig {
  id: string; // Unique provider ID (e.g., "openai", "custom")
  name: string; // User-facing display name (e.g., "OpenAI")
  description?: string;
  enabled: boolean;
  // Optional provider-level overrides (null/empty = use global fallback)
  apiKey?: string | null;
  apiBaseUrl?: string | null;
  defaultTemperature?: number | null;
  defaultMaxTokens?: number | null;
  defaultTopP?: number | null;
  // List of models offered by this provider
  models: ApiModelConfig[];
}

// Common emojis list (unchanged)
export const commonEmojis = [
  '💬',
  '🧠',
  '💡',
  '📝',
  '🔍',
  '⚙️',
  '🚀',
  '🧪',
  '🤖',
  '💻',
  '📚',
  '📊',
  '📈',
  '🤔',
  '✅',
  '❓',
  '✨',
  '🎉',
  '📌',
  '📎',
];

// Custom Character type (unchanged)
export interface CustomCharacter {
  id: string;
  sort: number;
  name: string;
  description?: string;
  icon: string;
  prompt: string;
  model: NamespacedModelId; // Use namespaced ID
  maxHistory: number | null;
  createdAt: number;
  updatedAt: number;
}

export type PartialCharacter = Partial<CustomCharacter>;

export interface MiniappDefinition {
  id: string; // UUID recommended
  icon?: string;
  name: string;
  description?: string;
  htmlContent: string;
  // Optional: JSON schema object for validation/UI generation
  configSchema?: Record<string, any>;
  // Optional: Default values for the config
  defaultConfig?: Record<string, any>;
  enabled: boolean; // Controls if it *can* be activated
  dependencies?: string[];
  requiredApis?: string[]; // For future permission checks
  createdAt: number; // timestamp
  updatedAt: number; // timestamp
}

// Represents the actual stored configuration for a Miniapp instance
export interface MiniappConfig {
  [key: string]: any;
}

export interface MiniappPermissions {
  // Can it read config of other Miniapps? List allowed target IDs or undefined for all, empty for none.
  readConfig?: string[];
  // Can it call functions on other Miniapps? List allowed target IDs or undefined for all, empty for none.
  callMiniapp?: string[];
  // Which Tauri commands can it invoke?
  allowedTauriCommands?: string[];
  // Can it use the generic storage API? (Default true usually)
  useStorage?: boolean;
}

export interface MiniappDefinition {
  permissions?: MiniappPermissions;
}

// Represents a running instance of a MiniApp
export interface MiniappInstance {
  instanceId: string; // Unique ID for this running instance
  definitionId: string; // ID of the MiniappDefinition being run
  minimized: boolean; // Whether the window is minimized or not
  // Consider adding definition directly if needed frequently, or derive it
  // definition: MiniappDefinition;
}

// Structure for the Miniapp Bridge Context
export type SendMessageFunc = (
  type: string,
  payload: any,
  requestId?: string,
  error?: string,
) => void;

export interface MiniappBridgeRegistry {
  registerSendMessage: (id: string, func: SendMessageFunc) => void;
  unregisterSendMessage: (id: string) => void;
  getSendMessage: (id: string) => SendMessageFunc | undefined;
  broadcastToMiniapps: (eventType: string, payload: any) => void;
}
