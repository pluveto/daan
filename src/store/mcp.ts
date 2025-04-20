// src/store/mcp.ts
import { atomWithSafeStorage } from '@/lib/utils';
import { Client } from '@moinfra/mcp-client-sdk/client/index.js';
import { atom } from 'jotai';

// Define types for MCP configuration and state
export interface McpServerConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  type: 'builtin-pseudo' | 'sse-client';
  url?: string; // Required for sse-client
  autoApproveTools: boolean; // Global setting for this server
  // Could add per-tool auto-approve settings later
}

export interface McpServerState {
  config: McpServerConfig;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  client: Client | null; // Store the connected client instance
  capabilities: any; // Store server capabilities
  tools: any[]; // List of discovered tools
  resources: any[]; // List of discovered resources
  prompts: any[]; // List of discovered prompts
  // Maybe add status for individual tool discovery if it's async
}

// --- MCP State Atoms ---

/** Stores the configuration for all MCP servers. Persisted. */
export const mcpServersAtom = atomWithSafeStorage<McpServerConfig[]>(
  'mcpServers',
  [],
);

/** Derived atom holding the runtime state of each configured MCP server.
 * Not persisted, managed programmatically based on configuration and connection logic.
 * This will be a Map where keys are server IDs.
 */
export const mcpServerStatesAtom = atom<Map<string, McpServerState>>(new Map());

/** Controls the visibility of the MCP tools popover in the chat interface. */
export const isMcpToolsPopoverOpenAtom = atom(false);

/** Stores the IDs of the MCP tools that are currently selected/enabled for prompt injection. */
export const selectedMcpToolsAtom = atomWithSafeStorage<string[]>(
  'selectedMcpTools',
  [],
);

// --- MCP Action Atoms (Placeholders) ---

/** Action to add a new MCP server configuration. */
export const addMcpServerAtom = atom(
  null,
  (get, set, config: Omit<McpServerConfig, 'id' | 'enabled'>) => {
    // TODO: Implement add server logic
    console.log('TODO: Implement addMcpServerAtom', config);
  },
);

/** Action to update an MCP server configuration. */
export const updateMcpServerConfigAtom = atom(
  null,
  (get, set, update: Partial<McpServerConfig> & { id: string }) => {
    // TODO: Implement update server config logic
    console.log('TODO: Implement updateMcpServerConfigAtom', update);
  },
);

/** Action to delete an MCP server configuration. */
export const deleteMcpServerAtom = atom(null, (get, set, serverId: string) => {
  // TODO: Implement delete server logic (and disconnect if connected)
  console.log('TODO: Implement deleteMcpServerAtom', serverId);
});

/** Action to toggle the enabled state of an MCP server. */
export const toggleMcpServerEnabledAtom = atom(
  null,
  (get, set, serverId: string) => {
    // TODO: Implement toggle enabled logic (and connect/disconnect accordingly)
    console.log('TODO: Implement toggleMcpServerEnabledAtom', serverId);
  },
);

/** Action to connect to a specific MCP server. */
export const connectMcpServerAtom = atom(null, (get, set, serverId: string) => {
  // TODO: Implement connect logic using PseudoTransport or SSEClientTransport
  console.log('TODO: Implement connectMcpServerAtom', serverId);
});

/** Action to disconnect from a specific MCP server. */
export const disconnectMcpServerAtom = atom(
  null,
  (get, set, serverId: string) => {
    // TODO: Implement disconnect logic
    console.log('TODO: Implement disconnectMcpServerAtom', serverId);
  },
);

/** Action to connect to all enabled MCP servers. */
export const connectAllMcpServersAtom = atom(null, (get, set) => {
  // TODO: Implement connect all logic
  console.log('TODO: Implement connectAllMcpServersAtom');
});

/** Action to disconnect from all connected MCP servers. */
export const disconnectAllMcpServersAtom = atom(null, (get, set) => {
  // TODO: Implement disconnect all logic
  console.log('TODO: Implement disconnectAllMcpServersAtom');
});

/** Derived atom to generate the system prompt instruction for enabled/selected MCP tools. */
export const mcpPromptInjectionAtom = atom<string>((get) => {
  // TODO: Implement prompt injection logic based on connected/selected tools
  console.log('TODO: Implement mcpPromptInjectionAtom');
  return ''; // Return empty string for now
});

/** Action to handle an incoming tool call request from the AI. */
export const handleMcpToolCallAtom = atom(
  null,
  async (get, set, toolCall: any) => {
    // TODO: Implement tool call handling logic (parsing, asking user, calling client, reporting result)
    console.log('TODO: Implement handleMcpToolCallAtom', toolCall);
  },
);
