export interface MiniappDefinition {
  id: string; // UUID recommended
  icon?: string;
  name: string;
  description?: string;
  htmlContent: string;
  configSchema?: Record<string, any>;
  defaultConfig?: Record<string, any>;
  defaultWindowSize?: { width: number; height: number };
  enabled: boolean; // Controls if it *can* be activated
  dependencies?: string[];
  permissions?: MiniappPermissions;
  requiredApis?: string[];
  createdAt: number; // timestamp
  updatedAt: number; // timestamp
}

export interface MiniappConfig {
  [key: string]: any;
}

export interface MiniappPermissions {
  readConfig?: string[];
  callMiniapp?: string[];
  llmAccess?: boolean; // Can it access the LLM?
  allowedTauriCommands?: string[];
  useStorage?: boolean;
}

export interface MiniappInstance {
  instanceId: string; // Unique ID for this running instance
  definitionId: string; // ID of the MiniappDefinition being run
  minimized: boolean; // Whether the window is minimized or not
}

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
