// src/store/mcp.ts
import { TauriStdioTransport } from '@/lib/transport';
import { atomWithSafeStorage } from '@/lib/utils';
import { createBuiltinExprEvaluatorServer } from '@/mcp/builtinExprEvaluator';
import { createBuiltinTimeServer } from '@/mcp/builtinTime'; // Import the time server creator
import type {
  Message,
  PendingToolCallInfo,
  ResultToolCallInfo,
  ToolCallInfo,
} from '@/types';
import { Client } from '@moinfra/mcp-client-sdk/client/index.js';
import { PseudoTransport } from '@moinfra/mcp-client-sdk/client/pseudo.js';
import { SSEClientTransport } from '@moinfra/mcp-client-sdk/client/sse.js';
import { McpServer } from '@moinfra/mcp-client-sdk/server/mcp.js';
import { Transport } from '@moinfra/mcp-client-sdk/shared/transport.js';
import { CallToolResult } from '@moinfra/mcp-client-sdk/types.js';
import { atom, Getter, Setter } from 'jotai';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { callOpenAIStreamLogic } from './apiActions';
import { activeChatIdAtom, chatsAtom } from './chatData';
import { updateMessagesInChat } from './messageActions';
import { getHistoryForApi } from './regeneration';
import { defaultMaxHistoryAtom } from './settings';

const formatJsonSchema = (schema: any) => JSON.stringify(schema, null, 2);

interface McpServerConfigBase {
  id: string; // Unique identifier
  name: string;
  description?: string;
  enabled: boolean; // Whether the user wants this connection active
  autoApproveTools: boolean; // Skip confirmation for tool calls
}

// Configuration for SSE (Server-Sent Events) type
export interface McpServerConfigSse extends McpServerConfigBase {
  type: 'sse';
  url: string; // URL for the SSE endpoint
}

// Configuration for Stdio (Standard I/O) type - Tauri only
export interface McpServerConfigStdio extends McpServerConfigBase {
  type: 'stdio';
  command: string; // The command/executable to run
  args: string[]; // Arguments to pass to the command
}

// Configuration for the built-in pseudo server (if applicable)
export interface McpServerConfigBuiltin extends McpServerConfigBase {
  type: 'builtin-pseudo';
  // No specific connection params needed for built-in
}

export type McpServerConfig =
  | McpServerConfigSse
  | McpServerConfigStdio
  | McpServerConfigBuiltin;

export interface McpDiscoveredCapabilities {
  tools?: { name: string; description?: string; inputSchema?: any }[];
  resources?: { name: string; uriTemplate?: string }[];
  prompts?: { name: string; arguments?: any[] }[];
}

export interface McpServerState {
  configId: string; // Link back to config
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  client: Client | null;
  transport: Transport | null;
  capabilities: McpDiscoveredCapabilities | null;
}

// --- MCP State Atoms ---

// --- Refactored Built-in Server Management ---
// Central registry for built-in server instances, keyed by their unique config ID.
// Initialized once when the atom is first read.
const builtinServersRegistryAtom = atom<Map<string, McpServer>>(() => {
  console.log('[MCP] Initializing built-in server registry...');
  const registry = new Map<string, McpServer>();

  // Add known built-in servers to the registry
  // The keys MUST match the 'id' field in their McpServerConfig
  registry.set('builtin::expr_evaluator', createBuiltinExprEvaluatorServer());
  registry.set('builtin::time', createBuiltinTimeServer());
  // Add other built-in servers here in the future

  console.log(
    `[MCP] Built-in server registry initialized with keys: ${Array.from(registry.keys()).join(', ')}`,
  );
  return registry;
});
// --- End Refactor ---

/** Stores the configuration for all MCP servers. Persisted. */
export const mcpServersAtom = atomWithSafeStorage<McpServerConfig[]>(
  'mcpServers',
  [
    // Add the built-in servers config by default
    {
      id: 'builtin::expr_evaluator', // Unique ID for the evaluator
      name: 'Expression Evaluator (Built-in)',
      description:
        'A simple JS expression evaluation tool (uses eval - use with caution). Runs locally.',
      enabled: true, // Enabled by default for testing
      type: 'builtin-pseudo',
      autoApproveTools: false,
    },
    // --- Added Time Server Config ---
    {
      id: 'builtin::time', // Unique ID for the time server
      name: 'Current Time (Built-in)',
      description: 'Provides the current date and time. Runs locally.',
      enabled: false, // Disabled by default
      type: 'builtin-pseudo',
      autoApproveTools: true, // Time is generally safe to auto-approve
    },
    // --- End Add ---
  ],
);

/** Holds the runtime state of each MCP server connection. Not persisted. */
export const mcpServerStatesAtom = atom<Map<string, McpServerState>>(new Map());

/** Controls the visibility of the MCP tools popover in the chat interface. */
export const isMcpToolsPopoverOpenAtom = atom(false);

/** Stores the IDs of the MCP tools *selected by the user* for injection into the current chat. */
export const selectedMcpServerIdsAtom = atom<string[]>([]);

/** Derived atom that returns the conncected MCP server ids. */
export const connectedMcpServerIdsAtom = atom((get) => {
  const states = get(mcpServerStatesAtom);
  return Array.from(states.entries())
    .filter(([, state]) => state.isConnected)
    .map(([id]) => id);
});

// --- MCP Action Atoms ---

/** Action to add a new MCP server configuration. */
export const addMcpServerAtom = atom(
  null,
  (
    get,
    set,
    config: Omit<McpServerConfig, 'id' | 'enabled' | 'type'> &
      (
        | {
            type: 'sse';
            url: string;
          }
        | {
            type: 'stdio';
            command: string;
            args: string[];
          }
      ),
  ) => {
    // Restrict adding only custom SSE for now
    // Prevent adding new 'builtin-pseudo' types via UI
    if ((config as any).type === 'builtin-pseudo') {
      toast.error("Cannot add new 'builtin-pseudo' servers via this action.");
      return;
    }
    const newId = `custom::${uuidv4()}`; // Simple namespacing for custom server IDs
    const newConfig: McpServerConfig = {
      ...config,
      id: newId,
      enabled: false, // Add as disabled by default
    };
    set(mcpServersAtom, (prev) => [...prev, newConfig]);
    toast.success(`MCP Server "${config.name}" added.`);
    // Optionally trigger connection if enabled? No, let user enable/connect manually.
  },
);

/** Action to update an MCP server configuration. */
export const updateMcpServerConfigAtom = atom(
  null,
  (get, set, update: Partial<Omit<McpServerConfig, 'id'>> & { id: string }) => {
    let serverName = 'Server';
    let needsReconnect = false;

    // Prevent changing the type or ID of built-in servers
    if (update.type === 'builtin-pseudo') {
      // *** For built-in, ONLY update autoApproveTools ***
      return {
        ...update, // Keep all original fields
        // Only apply the change from updatedConfig if it exists
        autoApproveTools: update.autoApproveTools ?? false,
      };
    }

    set(mcpServersAtom, (prev) =>
      prev.map((server) => {
        if (server.id === update.id) {
          serverName = update.name ?? server.name; // Get name for toast

          // Check if type is changing
          const typeChanged =
            update.type !== undefined && update.type !== server.type;

          // Check URL change only for SSE servers
          const urlChanged =
            !server.id.startsWith('builtin::') &&
            server.type === 'sse' &&
            (update as Partial<McpServerConfigSse>).url !== undefined &&
            (update as Partial<McpServerConfigSse>).url !==
              (server as McpServerConfigSse).url;

          const commandOrArgsChanged =
            !server.id.startsWith('builtin::') &&
            server.type === 'stdio' &&
            (update as Partial<McpServerConfigStdio>).command !== undefined &&
            (update as Partial<McpServerConfigStdio>).args !== undefined &&
            (update as Partial<McpServerConfigStdio>).command !==
              (server as McpServerConfigStdio).command &&
            (update as Partial<McpServerConfigStdio>).args !==
              (server as McpServerConfigStdio).args;

          if (typeChanged || urlChanged || commandOrArgsChanged) {
            needsReconnect = true;
          }

          // Create updated server config while preserving type safety
          const updatedServer = { ...server };
          // Apply updates while maintaining discriminated union
          Object.assign(updatedServer, update);
          return updatedServer;
        }
        return server;
      }),
    );
    toast.success(`MCP Server "${serverName}" updated.`);

    // If URL/Type changed for a non-builtin server, disconnect the old connection
    if (needsReconnect) {
      const currentState = get(mcpServerStatesAtom).get(update.id);
      if (currentState?.isConnected || currentState?.isConnecting) {
        console.log(
          `Disconnecting server ${update.id} due to config update (URL/Type).`,
        );
        set(disconnectMcpServerAtom, update.id); // Trigger disconnect
        // Optionally trigger reconnect if it was enabled? Or let user do it manually.
        // if (originalConfig?.enabled) { set(connectMcpServerAtom, update.id) }
      }
    }
  },
);

/** Action to delete an MCP server configuration. */
export const deleteMcpServerAtom = atom(null, (get, set, serverId: string) => {
  let serverName = 'Server';
  // Prevent deleting *any* built-in server config based on ID prefix
  if (serverId.startsWith('builtin::')) {
    const config = get(mcpServersAtom).find((s) => s.id === serverId);
    toast.error(
      `Cannot delete the built-in server: "${config?.name || serverId}".`,
    );
    return;
  }

  set(mcpServersAtom, (prev) => {
    const serverToDelete = prev.find((s) => s.id === serverId);
    serverName = serverToDelete?.name ?? serverId;
    return prev.filter((server) => server.id !== serverId);
  });

  // Disconnect and remove runtime state
  set(disconnectMcpServerAtom, serverId); // Ensure disconnected
  set(mcpServerStatesAtom, (prevMap) => {
    const newMap = new Map(prevMap);
    newMap.delete(serverId);
    return newMap;
  });
  // Remove from selected servers if present
  set(selectedMcpServerIdsAtom, (prev) => prev.filter((id) => id !== serverId));

  toast.success(`MCP Server "${serverName}" deleted.`);
});

/** Action to toggle the enabled state of an MCP server. */
export const toggleMcpServerEnabledAtom = atom(
  null,
  (get, set, serverId: string) => {
    let serverName = 'Server';
    let isEnabled = false;
    set(mcpServersAtom, (prev) =>
      prev.map((server) => {
        if (server.id === serverId) {
          serverName = server.name;
          isEnabled = !server.enabled; // Get the *new* state
          return { ...server, enabled: !server.enabled };
        }
        return server;
      }),
    );
    toast.info(
      `MCP Server "${serverName}" ${isEnabled ? 'enabled' : 'disabled'}.`,
    );

    // Automatically try to connect if enabled, disconnect if disabled
    if (isEnabled) {
      set(connectMcpServerAtom, serverId);
    } else {
      set(disconnectMcpServerAtom, serverId);
      // Also remove from selected servers if disabled
      set(selectedMcpServerIdsAtom, (prev) =>
        prev.filter((id) => id !== serverId),
      );
    }
  },
);

/** Action to connect to a specific MCP server. */
export const connectMcpServerAtom = atom(
  null,
  async (get, set, serverId: string) => {
    const config = get(mcpServersAtom).find((s) => s.id === serverId);
    if (!config) {
      console.error(`[MCP Connect] Config not found for ${serverId}`);
      toast.error(`Configuration for server ID "${serverId}" not found.`);
      return;
    }
    if (!config.enabled) {
      console.log(
        `[MCP Connect] Server ${serverId} (${config.name}) is disabled, skipping connect.`,
      );
      return;
    }

    const currentStates = get(mcpServerStatesAtom);
    const currentState = currentStates.get(serverId);

    if (currentState?.isConnected || currentState?.isConnecting) {
      console.log(
        `[MCP Connect] Server ${serverId} (${config.name}) is already connected or connecting.`,
      );
      return;
    }

    // Update state to 'connecting'
    const connectingState: McpServerState = {
      configId: serverId,
      isConnected: false,
      isConnecting: true,
      error: null,
      client: null,
      transport: null,
      capabilities: null,
    };
    set(
      mcpServerStatesAtom,
      new Map(currentStates).set(serverId, connectingState),
    );
    console.log(
      `[MCP Connect] Attempting to connect to ${serverId} (${config.name})...`,
    );
    toast.info(`Connecting to MCP server "${config.name}"...`);

    let client: Client | null = null;
    let transport: Transport | null = null;

    try {
      client = new Client({ name: 'Daan MCP Client', version: '1.0.0' }); // Basic client info

      // Create appropriate transport
      if (config.type === 'builtin-pseudo') {
        const registry = get(builtinServersRegistryAtom); // Get the registry
        const builtinServer = registry.get(config.id); // Look up the server instance by its ID

        if (!builtinServer) {
          throw new Error(
            `Built-in server instance not found in registry for ID: ${config.id}`,
          );
        }
        transport = new PseudoTransport(builtinServer); // Use the found instance
        console.log(
          `[MCP Connect] Using PseudoTransport with built-in server for ${config.id}`,
        );
        // --- End Refactor ---
      } else if (config.type === 'sse' && config.url) {
        console.log(`[MCP Connect] Using SSEClientTransport for ${config.id}`);
        transport = new SSEClientTransport(new URL(config.url));
      } else if (config.type === 'stdio' && config.command && config.args) {
        console.log(
          `[MCP Connect] Using StdioClientTransport for ${config.id}`,
        );
        transport = new TauriStdioTransport(config.command, config.args);
      } else {
        throw new Error(
          `Invalid server type (${config.type}) or missing URL for ${config.id}`,
        );
      }

      // Attempt connection
      await client.connect(transport); // This also starts the transport

      // Fetch capabilities after successful connection
      console.log(
        `[MCP Connect] Connected to ${serverId}. Fetching capabilities...`,
      );
      // Capabilities fetching logic
      let toolsResult;
      try {
        toolsResult = await client.listTools();
        console.log(`[MCP Connect] Tools for ${serverId}:`, toolsResult);
      } catch (error) {
        console.warn(
          `[MCP Connect] Failed to list tools for ${serverId}:`,
          error,
        );
        toolsResult = { tools: [] }; // Provide a default value to avoid further errors
      }

      let resourcesResult;
      try {
        resourcesResult = await client.listResources(); // Assuming listResources exists
        console.log(
          `[MCP Connect] Resources for ${serverId}:`,
          resourcesResult,
        );
      } catch (error) {
        console.warn(
          `[MCP Connect] Failed to list resources for ${serverId}:`,
          error,
        );
        resourcesResult = { resources: [] }; // Provide a default value
      }

      let promptsResult;
      try {
        promptsResult = await client.listPrompts(); // Assuming listPrompts exists
        console.log(`[MCP Connect] Prompts for ${serverId}:`, promptsResult);
      } catch (error) {
        console.warn(
          `[MCP Connect] Failed to list prompts for ${serverId}:`,
          error,
        );
        promptsResult = { prompts: [] }; // Provide a default value
      }

      const capabilities: McpDiscoveredCapabilities = {
        tools: toolsResult.tools || [],
        resources: resourcesResult.resources || [],
        prompts: promptsResult.prompts || [],
      };
      console.log(`[MCP Connect] Capabilities for ${serverId}:`, capabilities);

      // Update state to 'connected'
      const connectedState: McpServerState = {
        ...connectingState,
        isConnecting: false,
        isConnected: true,
        client: client, // Store client and transport
        transport: transport,
        capabilities: capabilities,
        error: null,
      };
      set(mcpServerStatesAtom, (prevMap) =>
        new Map(prevMap).set(serverId, connectedState),
      );
      toast.success(`MCP Server "${config.name}" connected.`);
    } catch (error: any) {
      console.error(`[MCP Connect] Failed to connect to ${serverId}:`, error);
      toast.error(`Failed to connect to "${config.name}": ${error.message}`);
      // Ensure client/transport are closed if partially initialized
      if (client) {
        await client
          .close()
          .catch((closeErr) =>
            console.error(
              `[MCP Cleanup Error] Failed to close client for ${serverId}:`,
              closeErr,
            ),
          );
      } else if (transport) {
        // Close transport directly if client didn't connect fully but transport started
        await transport
          .close()
          .catch((closeErr) =>
            console.error(
              `[MCP Cleanup Error] Failed to close transport for ${serverId}:`,
              closeErr,
            ),
          );
      }
      // Update state to 'error'
      const errorState: McpServerState = {
        ...connectingState,
        isConnecting: false,
        isConnected: false,
        client: null, // Clear client/transport on error
        transport: null,
        capabilities: null,
        error: error.message || 'Unknown connection error',
      };
      set(mcpServerStatesAtom, (prevMap) =>
        new Map(prevMap).set(serverId, errorState),
      );
    }
  },
);

/** Action to disconnect from a specific MCP server. */
export const disconnectMcpServerAtom = atom(
  null,
  async (get, set, serverId: string) => {
    const currentStates = get(mcpServerStatesAtom);
    const currentState = currentStates.get(serverId);
    const config = get(mcpServersAtom).find((s) => s.id === serverId); // For toast message

    if (
      !currentState ||
      (!currentState.isConnected && !currentState.isConnecting)
    ) {
      // console.log(`[MCP Disconnect] Server ${serverId} is not connected or connecting.`);
      // Ensure state is clean if it exists but wasn't connected/connecting
      if (currentState) {
        set(mcpServerStatesAtom, (prevMap) => {
          const newMap = new Map(prevMap);
          newMap.set(serverId, {
            // Reset state
            configId: serverId,
            isConnected: false,
            isConnecting: false,
            error: null,
            client: null,
            transport: null,
            capabilities: null,
          });
          return newMap;
        });
      }
      return;
    }

    console.log(
      `[MCP Disconnect] Disconnecting from ${serverId} (${config?.name || 'Unknown Name'})...`,
    );

    try {
      // Important: Close the client first if it exists, as it should handle the transport.
      if (currentState.client) {
        await currentState.client.close();
        console.log(`[MCP Disconnect] Client closed for ${serverId}.`);
      } else if (currentState.transport) {
        // Fallback: If only transport exists and was started (e.g., connect failed partially)
        await currentState.transport.close();
        console.log(
          `[MCP Disconnect] Transport closed directly for ${serverId}.`,
        );
      } else {
        console.log(
          `[MCP Disconnect] No active client or transport to close for ${serverId}.`,
        );
      }
      if (config) {
        // Only toast if config exists and we were actually connected/connecting
        toast.info(`MCP Server "${config.name}" disconnected.`);
      }
    } catch (error: any) {
      console.error(
        `[MCP Disconnect] Error disconnecting from ${serverId}:`,
        error,
      );
      toast.error(
        `Error disconnecting from "${config?.name || serverId}": ${error.message}`,
      );
    } finally {
      // Always update state to disconnected regardless of errors during close
      const disconnectedState: McpServerState = {
        configId: serverId,
        isConnected: false,
        isConnecting: false,
        error: null, // Clear any previous error on manual disconnect
        client: null,
        transport: null,
        capabilities: null, // Clear capabilities on disconnect
      };
      set(mcpServerStatesAtom, (prevMap) =>
        new Map(prevMap).set(serverId, disconnectedState),
      );
      // Remove from selected servers if disconnected manually or disabled
      set(selectedMcpServerIdsAtom, (prev) =>
        prev.filter((id) => id !== serverId),
      );
    }
  },
);

/** Action to connect to all enabled MCP servers. */
export const connectAllMcpServersAtom = atom(null, (get, set) => {
  console.log('[MCP Connect All] Triggered.');
  const configs = get(mcpServersAtom);
  configs.forEach((config) => {
    if (config.enabled) {
      // Check current state before attempting connect
      const currentState = get(mcpServerStatesAtom).get(config.id);
      if (!currentState?.isConnected && !currentState?.isConnecting) {
        console.log(
          `[MCP Connect All] Connecting ${config.id} (${config.name})`,
        );
        // Important: Use `set` directly for async write atoms
        set(connectMcpServerAtom, config.id);
      } else {
        console.log(
          `[MCP Connect All] Skipping ${config.id} (${config.name}) (already connected/connecting).`,
        );
      }
    } else {
      console.log(
        `[MCP Connect All] Skipping ${config.id} (${config.name}) (disabled).`,
      );
    }
  });
});

/** Action to disconnect from all connected MCP servers. */
export const disconnectAllMcpServersAtom = atom(null, (get, set) => {
  console.log('[MCP Disconnect All] Triggered.');
  const states = get(mcpServerStatesAtom);
  states.forEach((state, serverId) => {
    if (state.isConnected || state.isConnecting) {
      console.log(`[MCP Disconnect All] Disconnecting ${serverId}`);
      // Important: Use `set` directly for async write atoms
      set(disconnectMcpServerAtom, serverId);
    }
  });
  // Clear all selected servers when disconnecting all
  set(selectedMcpServerIdsAtom, []);
});

/**
 * Derived atom to generate the system prompt instruction for enabled/selected MCP tools,
 * using the ```json:mcp-tool-call code block format.
 */
export const mcpPromptInjectionAtom = atom<string>((get) => {
  const selectedIds = get(selectedMcpServerIdsAtom);
  const states = get(mcpServerStatesAtom);
  const servers = get(mcpServersAtom); // Get all server configs
  let injection = '';

  if (selectedIds.length === 0) {
    return ''; // No servers selected for injection
  }

  const availableToolsSections: string[] = [];

  selectedIds.forEach((serverId) => {
    const state = states.get(serverId);
    const config = servers.find((c) => c.id === serverId);

    // Check if server is selected, connected, and has capabilities
    if (state?.isConnected && state.capabilities && config) {
      const tools = state.capabilities.tools || [];

      if (tools.length > 0) {
        const toolDescriptions = tools
          .map((tool) => {
            // Format the JSON schema nicely (ensure formatJsonSchema handles potential issues)
            let schemaString = '{}'; // Default to empty object
            try {
              schemaString = tool.inputSchema
                ? JSON.stringify(
                    formatJsonSchema(tool.inputSchema as any), // Use helper carefully
                    null,
                    2,
                  )
                : '{}';
            } catch (e) {
              console.warn(
                `Failed to stringify/format schema for tool ${tool.name} on server ${serverId}`,
                e,
              );
              schemaString = '/* Error formatting schema */';
            }

            // Use triple backticks for the code block
            return `- Tool: \`${tool.name}\`\n  Description: ${tool.description || 'No description'}\n  Input JSON Schema:\n\`\`\`json\n${schemaString}\n\`\`\``;
          })
          .join('\n');

        // Use backticks for server name and ID
        availableToolsSections.push(
          `Server: \`${config.name}\` (ID: \`${serverId}\`)\n${toolDescriptions}`,
        );
      }
    }
  });

  if (availableToolsSections.length > 0) {
    // Construct the final prompt section using the new code block format instructions
    injection = `
---------------- MCP Tools Available ----------------
You have access to external tools via connected MCP servers which allow bot to call external functions.

To use a tool, follow these steps *strictly*:
1.  Provide your normal conversational response text first (if any).
2.  If you need to call a tool, place a **single JSON code block** at the **very end** of your response. Nothing must follow this block.
3.  The code block MUST use the language identifier \`json:mcp-tool-call\`.
4.  The JSON object inside the block MUST have the following structure:
    \`\`\`json
    {
      "serverId": "SERVER_ID",
      "toolName": "TOOL_NAME",
      "arguments": { /* JSON object matching the tool's Input JSON Schema */ }
    }
    \`\`\`
    - Replace \`SERVER_ID\` with the exact ID of the server providing the tool (e.g., "builtin::time", "custom::xyz").
    - Replace \`TOOL_NAME\` with the exact name of the tool to call (e.g., "getCurrentTime", "eval").
    - Replace the value of \`"arguments"\` with a valid JSON object containing the arguments needed for the tool, matching its schema.
    - For tools with no arguments according to their schema, use an empty object: \`"arguments": {}\`.

**Example Response (calling 'getCurrentTime' on server 'builtin::time'):**

Okay, you want the current time. I can get that for you.
\`\`\`json:mcp-tool-call
{
  "serverId": "builtin::time",
  "toolName": "getCurrentTime",
  "arguments": {}
}
\`\`\`

**Important:**
- Only one \`json:mcp-tool-call\` block is allowed per response.
- The block MUST be the absolute last thing in your output. If you have thinking ability, stop thinking before calling tools.
- Ensure the JSON inside the block is valid.
- Tool names are unique *within* a single server, but might overlap across different servers. Always use the correct \`serverId\`.

Available Tools START
${availableToolsSections.join('\n\n')}
Available Tools END
-----------------------------------------------------
`;
  }

  return injection.trim(); // Trim leading/trailing whitespace
});

// Helper to format tool result for display
function formatToolResultContent(result: CallToolResult): string {
  // Prioritize text content, handle errors, fallback for other types
  if (result.content && result.content.length > 0) {
    const resultPart = result.content[0]; // TODO: handle more than one part?
    if (result.isError) {
      // Assume error content is text
      return `Error: ${resultPart?.text || '[Unknown Error Structure]'}`;
    } else if (resultPart.type === 'text') {
      return resultPart.text || '""';
    }
    // else if (firstPart.type === 'json') { // now text cover this case
    //   try {
    //     // Pretty print JSON results
    //     return `\`\`\`json\n${JSON.stringify(firstPart.json, null, 2)}\n\`\`\``;
    //   } catch {
    //     return '[Invalid JSON Result Data]';
    //   }
    // }
    else {
      try {
        return JSON.stringify(resultPart, null, 2);
      } catch {
        return '"<invalid data>"';
      }
    }
  }
  return '[No Content Returned]';
}

// Helper to format tool result for AI consumption
function formatToolResultForAI(result: CallToolResult): string {
  // For now, just return the text content or error. Might need more structure later.
  // Could potentially return JSON string if the result content includes it.
  if (result.content && result.content.length > 0) {
    const firstPart = result.content[0];
    if (result.isError) {
      return `Error: ${firstPart?.text || '[Unknown Error Structure]'}`;
    } else if (firstPart.type === 'text') {
      return firstPart.text || '';
    }
    // else if (firstPart.type === 'json') {
    //   try {
    //     return JSON.stringify(firstPart.json); // Return JSON string
    //   } catch {
    //     return '[Invalid JSON Data]';
    //   }
    // }
    else {
      try {
        // Fallback for other unknown types
        return JSON.stringify(firstPart);
      } catch {
        return '[Unsupported Result Data]';
      }
    }
  }
  return '[Tool returned no content]';
}

/** Main action to handle an incoming tool call request detected from the AI */
export const handleMcpToolCallAtom = atom(
  null,
  async (
    get,
    set,
    toolCallData: {
      callId: string;
      chatId: string;
      serverId: string;
      toolName: string;
      args: object;
      rawBlock: string; // Keep rawBlock if needed for debugging or potential future use
    },
  ) => {
    const { callId, chatId, serverId, toolName, args } = toolCallData;
    console.log(
      `[MCP Handler] Processing tool call request: Server='${serverId}', Tool='${toolName}', Args='${JSON.stringify(args)}'`,
    );

    // 1. Find Server Config & State *first*
    const config = get(mcpServersAtom).find((s) => s.id === serverId);
    const state = get(mcpServerStatesAtom).get(serverId);

    if (!config) {
      // TODO: Inform AI that the server ID is invalid?
      // For now, toast and maybe add an error message to chat.
      const errorContent = `MCP Error: Configuration for server ID "${serverId}" not found. Cannot call tool "${toolName}".`;
      toast.error(errorContent);
      set(chatsAtom, (prev) =>
        updateMessagesInChat(prev, chatId, (msgs) => [
          ...msgs,
          {
            id: uuidv4(),
            role: 'system',
            content: errorContent,
            timestamp: Date.now(),
          },
        ]),
      );
      return;
    }
    if (!state?.isConnected || !state.client) {
      // TODO: Inform AI that the server is unavailable?
      const errorContent = `MCP Error: Server "${config.name}" (ID: ${serverId}) is not connected. Cannot call tool "${toolName}".`;
      toast.error(errorContent);
      set(chatsAtom, (prev) =>
        updateMessagesInChat(prev, chatId, (msgs) => [
          ...msgs,
          {
            id: uuidv4(),
            role: 'system',
            content: errorContent,
            timestamp: Date.now(),
          },
        ]),
      );
      // Maybe try to reconnect? For now, fail.
      // if (config.enabled) { set(connectMcpServerAtom, serverId); }
      return;
    }

    // Check if the requested tool actually exists on the connected server
    const availableTool = state.capabilities?.tools?.find(
      (t) => t.name === toolName,
    );
    if (!availableTool) {
      const errorContent = `MCP Error: Tool "${toolName}" not found on server "${config.name}" (ID: ${serverId}). Available tools: ${state.capabilities?.tools?.map((t) => t.name).join(', ') || 'None'}`;
      toast.error(errorContent);
      set(chatsAtom, (prev) =>
        updateMessagesInChat(prev, chatId, (msgs) => [
          ...msgs,
          {
            id: uuidv4(),
            role: 'system',
            content: errorContent,
            timestamp: Date.now(),
          },
        ]),
      );
      // Maybe re-trigger AI with this info?
      return;
    }

    // 2. Parse Arguments (done in apiAction)

    // 3. Create Pending Message
    const pendingToolCallInfo: PendingToolCallInfo = {
      type: 'pending',
      callId,
      serverId,
      serverName: config.name, // Use display name
      toolName,
      args,
      // Add schema for potential validation display later?
      // inputSchema: availableTool.inputSchema,
    };
    const pendingMessage: Message = {
      id: uuidv4(), // New message ID for the pending state display
      role: 'assistant', // Represents the AI's *request* to call the tool
      content: `Wants to use tool: **${toolName}** on **${config.name}** with arguments: \`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\``,
      timestamp: Date.now(),
      toolCallInfo: pendingToolCallInfo,
    };
    // Use specific chat ID to add the message
    set(chatsAtom, (prev) =>
      updateMessagesInChat(prev, chatId, (msgs) => [...msgs, pendingMessage]),
    );

    // 4. Check Auto-Approval & Execute or Wait
    if (config.autoApproveTools) {
      console.log(
        `[MCP Handler] Auto-approving tool call ${callId} for ${toolName} on ${serverId}`,
      );
      // Call the execution logic directly
      // Use await here if executeToolCall remains async
      await executeToolCall(
        get,
        set,
        chatId,
        pendingMessage.id, // Pass the ID of the message *we just created*
        pendingToolCallInfo,
        state.client, // Pass the connected client instance
      );
    } else {
      console.log(
        `[MCP Handler] Tool call ${callId} for ${toolName} requires manual approval.`,
      );
      // UI (`ChatMessageItem`) will show Approve/Deny buttons based on `toolCallInfo.type === 'pending'`
      // The buttons will trigger approveToolCallAtom or denyToolCallAtom below.
    }
  },
);

/** Action triggered when user approves a tool call */
export const approveToolCallAtom = atom(
  null,
  async (get, set, pendingMessageId: string) => {
    const chatId = get(activeChatIdAtom); // Assume approval is for the active chat
    if (!chatId) {
      console.error('[MCP Approve] No active chat ID found.');
      toast.error('Cannot approve tool call: No active chat selected.');
      return;
    }

    const chat = get(chatsAtom)[chatId];
    // Find the specific message using its ID
    const pendingMessageIndex = chat?.messages.findIndex(
      (m) => m.id === pendingMessageId && m.toolCallInfo?.type === 'pending',
    );

    if (
      pendingMessageIndex === undefined ||
      pendingMessageIndex === -1 ||
      !chat
    ) {
      console.error(
        `[MCP Approve] Could not find pending message with ID ${pendingMessageId} in active chat ${chatId}`,
      );
      toast.warning(
        'Could not find the tool call request to approve (it might have been processed or removed).',
      );
      return;
    }

    const pendingMessage = chat.messages[pendingMessageIndex];
    const pendingToolCallInfo =
      pendingMessage.toolCallInfo as PendingToolCallInfo; // Type assertion

    const serverId = pendingToolCallInfo.serverId;
    const state = get(mcpServerStatesAtom).get(serverId);
    const config = get(mcpServersAtom).find((c) => c.id === serverId); // Get config for name

    if (!state?.isConnected || !state.client) {
      toast.error(
        `MCP Error: Server "${config?.name || serverId}" is no longer connected. Cannot run tool.`,
      );
      // Update the pending message to show an error
      const errorInfo: ToolCallInfo = {
        ...pendingToolCallInfo,
        type: 'error',
        isError: true,
      };
      set(chatsAtom, (prev) =>
        updateMessagesInChat(prev, chatId, (msgs) =>
          msgs.map((m) =>
            m.id === pendingMessageId
              ? {
                  ...m,
                  content: `Error: Server "${config?.name || serverId}" disconnected before tool call could be approved.`,
                  toolCallInfo: errorInfo,
                }
              : m,
          ),
        ),
      );
      return;
    }

    console.log(
      `[MCP Approve] User approved tool call ${pendingToolCallInfo.callId} (${pendingToolCallInfo.toolName} on ${serverId})`,
    );
    // Pass the correct client instance
    await executeToolCall(
      get,
      set,
      chatId,
      pendingMessageId,
      pendingToolCallInfo,
      state.client,
    );
  },
);

/** Action triggered when user denies a tool call */
export const denyToolCallAtom = atom(
  null,
  (get, set, pendingMessageId: string) => {
    const chatId = get(activeChatIdAtom);
    if (!chatId) {
      console.error('[MCP Deny] No active chat ID found.');
      toast.error('Cannot deny tool call: No active chat selected.');
      return;
    }

    const chat = get(chatsAtom)[chatId];
    // Find the specific message using its ID
    const pendingMessageIndex = chat?.messages.findIndex(
      (m) => m.id === pendingMessageId && m.toolCallInfo?.type === 'pending',
    );

    if (
      pendingMessageIndex === undefined ||
      pendingMessageIndex === -1 ||
      !chat
    ) {
      console.error(
        `[MCP Deny] Could not find pending message with ID ${pendingMessageId} in active chat ${chatId}`,
      );
      toast.warning(
        'Could not find the tool call request to deny (it might have been processed or removed).',
      );
      return;
    }

    const pendingMessage = chat.messages[pendingMessageIndex];
    const pendingToolCallInfo =
      pendingMessage.toolCallInfo as PendingToolCallInfo; // Type assertion

    const deniedInfo: ToolCallInfo = {
      ...pendingToolCallInfo,
      type: 'denied',
    };
    // Use more specific content for the update
    const deniedContent = `User denied the request to use tool **${pendingToolCallInfo.toolName}** on **${pendingToolCallInfo.serverName}**.`;

    // Update the original pending message to show it was denied
    set(chatsAtom, (prev) =>
      updateMessagesInChat(prev, chatId, (msgs) =>
        msgs.map((m) =>
          m.id === pendingMessageId
            ? { ...m, content: deniedContent, toolCallInfo: deniedInfo }
            : m,
        ),
      ),
    );

    console.log(
      `[MCP Deny] User denied tool call ${pendingToolCallInfo.callId} (${pendingToolCallInfo.toolName})`,
    );
    toast.info(`Tool call "${pendingToolCallInfo.toolName}" denied.`);

    // Optionally inform the AI about the denial
    // Create user message indicating denial (could also be role 'tool' depending on model API)
    const denialFeedbackMessage: Message = {
      id: uuidv4(),
      // Consider using 'user' or potentially 'tool' if the API supports it better.
      // Using 'user' makes it look like user input clarifying the situation.
      role: 'user',
      content: `(Instruction: The previous request to use the tool "${pendingToolCallInfo.toolName}" on server "${pendingToolCallInfo.serverName}" was denied by the user. Please proceed without using this tool.)`,
      timestamp: Date.now(),
    };
    set(chatsAtom, (prev) =>
      updateMessagesInChat(prev, chatId, (msgs) => [
        ...msgs,
        denialFeedbackMessage,
      ]),
    );

    // Re-trigger AI call with denial info
    triggerAICallWithUpdatedHistory(get, set, chatId);
  },
);

// Internal function to execute the call (used by approveToolCallAtom and handleMcpToolCallAtom)
async function executeToolCall(
  get: Getter,
  set: Setter,
  chatId: string,
  pendingMessageId: string, // The ID of the message that shows the pending/running state
  toolCallInfo: PendingToolCallInfo, // Contains callId, serverName, toolName, args
  client: Client, // Pass the actual client instance
) {
  const { callId, serverName, toolName, args } = toolCallInfo;

  // 1. Update message to "running" state
  const runningInfo: ToolCallInfo = { ...toolCallInfo, type: 'running' };
  const runningContent = `Running tool: **${toolName}** on **${serverName}**... (ID: ${callId.substring(0, 8)})`; // Add partial ID for clarity
  set(chatsAtom, (prev) =>
    updateMessagesInChat(prev, chatId, (msgs) =>
      msgs.map((m) =>
        m.id === pendingMessageId
          ? { ...m, content: runningContent, toolCallInfo: runningInfo }
          : m,
      ),
    ),
  );

  try {
    // 2. Execute the tool call via the provided client instance
    console.log(
      `[MCP Execute] Calling tool ${toolName} on ${serverName} (Call ID: ${callId}) with args:`,
      args,
    );
    const result = (await client.callTool({
      name: toolName,
      arguments: args,
      callId: callId, // Pass callId if the SDK/protocol supports it for tracing
    })) as CallToolResult; // Assume result has { isError: boolean, content: [...] }
    console.log(
      `[MCP Execute] Tool ${toolName} (Call ID: ${callId}) result:`,
      result,
    );

    // 3. Process SUCCESS result - Update the message
    const resultContent = formatToolResultContent(result);
    const resultInfo: ResultToolCallInfo = {
      // Carry over necessary info from pending/running state
      callId: callId,
      toolName: toolName,
      serverId: toolCallInfo.serverId,
      serverName: serverName,
      args: toolCallInfo.args, // Keep args for display/context if needed
      // Result specific fields
      type: 'result',
      isError: false, // Explicitly false for success
      // Store raw result if needed later?
      // rawResult: result,
    };
    // Update the *same message* that was pending/running
    set(chatsAtom, (prev) =>
      updateMessagesInChat(prev, chatId, (msgs) =>
        msgs.map((m) =>
          m.id === pendingMessageId
            ? {
                ...m,
                content: `\`\`\`json:mcp-tool-resp[call-id=${callId}]\n${resultContent}\n\`\`\``,
                toolCallInfo: resultInfo,
              }
            : m,
        ),
      ),
    );

    // 4. Feed result back to AI (Add a NEW message for this purpose)
    // This message provides context for the AI's next turn.
    // Format depends on the AI model's expected input for tool results.
    // Using role 'user' as a generic way to provide feedback.
    const resultForAI = formatToolResultForAI(result);
    const feedbackMessage: Message = {
      id: uuidv4(),
      role: 'user', // Or 'tool' if using specific API like OpenAI's
      // Provide clear context about which tool call this result belongs to.
      content: `(Instruction: The tool "${toolName}" on server "${serverName}" (Call ID: ${callId.substring(0, 8)}) finished execution. Result: ${resultForAI})`,
      timestamp: Date.now(),
      // If using role 'tool', might need tool_call_id and potentially name
      // tool_call_id: callId,
      // name: toolName, // Example if needed by the model
    };
    set(chatsAtom, (prev) =>
      updateMessagesInChat(prev, chatId, (msgs) => [...msgs, feedbackMessage]),
    );

    // 5. Trigger AI again with the updated history including the result feedback
    triggerAICallWithUpdatedHistory(get, set, chatId);
  } catch (error: any) {
    // 3. Process ERROR result - Update the original message
    console.error(
      `[MCP Execute] Tool call ${toolName} (Call ID: ${callId}) failed:`,
      error,
    );
    const errorMessage =
      error?.message ||
      (typeof error === 'string' ? error : 'Unknown execution error');
    const errorContent = `Tool **${toolName}** on **${serverName}** failed: ${errorMessage}`;
    const errorInfo: ToolCallInfo = {
      // Carry over necessary info
      callId: callId,
      toolName: toolName,
      serverId: toolCallInfo.serverId,
      serverName: serverName,
      args: toolCallInfo.args,
      // Error specific fields
      type: 'error',
      isError: true,
      errorMessage: errorMessage, // Store the error message
    };
    // Update the *same message* that was pending/running
    set(chatsAtom, (prev) =>
      updateMessagesInChat(prev, chatId, (msgs) =>
        msgs.map((m) =>
          m.id === pendingMessageId
            ? { ...m, content: errorContent, toolCallInfo: errorInfo }
            : m,
        ),
      ),
    );

    // Display error toast to the user
    toast.error(`Tool "${toolName}" failed: ${errorMessage}`);

    // Decide whether to re-trigger AI after an error.
    // Option 1: Don't re-trigger (current behavior). User needs to prompt again.
    // Option 2: Feed error back to AI (similar to success).
    /*
        const errorForAI = `(Instruction: The tool "${toolName}" on server "${serverName}" (Call ID: ${callId.substring(0,8)}) failed to execute. Error: ${errorMessage}. Please inform the user or try a different approach.)`;
        const errorFeedbackMessage: Message = {
             id: uuidv4(),
             role: 'user', // Or 'tool'
             content: errorForAI,
             timestamp: Date.now(),
             // tool_call_id: callId, // If needed
        };
        set(chatsAtom, (prev) => updateMessagesInChat(prev, chatId, (msgs) => [...msgs, errorFeedbackMessage]));
        triggerAICallWithUpdatedHistory(get, set, chatId); // Re-trigger AI to react to the error
     */
    // For now, sticking with Option 1: No automatic re-trigger on error.
  }
  // No finally block needed as state updates happen within try/catch
}

// Helper to re-trigger the AI call after a tool result or denial
// (Ensure this uses the latest messages after updates)
function triggerAICallWithUpdatedHistory(
  get: Getter,
  set: Setter,
  chatId: string,
) {
  // Read the *latest* state right before preparing the API call
  const chat = get(chatsAtom)[chatId]; // Read latest chat state
  if (!chat) {
    console.error(
      '[MCP Trigger AI] Chat not found after tool call/denial:',
      chatId,
    );
    return;
  }

  const maxHistory = chat.maxHistory ?? get(defaultMaxHistoryAtom);
  // Pass the latest messages from the chat state
  const messagesToSend = getHistoryForApi(
    get,
    chat.messages, // Use the up-to-date messages from the chat atom
    maxHistory,
    chat.systemPrompt, // Include system prompt
    // No need to include latest MCP prompt injection because getHistoryForApi handle that
  );

  // Check if there's meaningful content to send
  // const hasUserOrAssistantContent = messagesToSend.some(
  //   (msg) => msg.role === 'user' || msg.role === 'assistant',
  // );
  // Allow re-triggering even if only system/tool messages exist,
  // as the tool result/denial itself is the new context.
  if (
    messagesToSend.length === 0 ||
    (messagesToSend.length === 1 &&
      messagesToSend[0].role === 'system' &&
      !get(mcpPromptInjectionAtom))
  ) {
    console.warn(
      '[MCP Trigger AI] No messages or only empty system prompt to send. Aborting re-trigger.',
    );
    return;
  }

  console.log(
    `[MCP Trigger AI] Re-triggering AI call for chat ${chatId} with updated history (${messagesToSend.length} messages).`,
  );

  // Call the main API logic function, passing get and set for Jotai context
  // Ensure callOpenAIStreamLogic correctly handles message stream updates
  callOpenAIStreamLogic(get, set, messagesToSend); // Pass chatId if needed by the stream logic
}
