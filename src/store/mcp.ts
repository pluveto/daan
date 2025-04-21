// src/store/mcp.ts
import { atomWithSafeStorage } from '@/lib/utils';
import { createBuiltinExprEvaluatorServer } from '@/mcp/builtinExprEvaluator';
import type {
  Message,
  NamespacedModelId,
  PendingToolCallInfo,
  ToolCallInfo,
} from '@/types';
// Import ToolCallInfo
import { Client } from '@moinfra/mcp-client-sdk/client/index.js';
import { PseudoTransport } from '@moinfra/mcp-client-sdk/client/pseudo.js';
import { SSEClientTransport } from '@moinfra/mcp-client-sdk/client/sse.js';
import { McpServer } from '@moinfra/mcp-client-sdk/server/mcp.js';
import { CallToolResult } from '@moinfra/mcp-client-sdk/types.js'; // Import necessary types

//FIXME: more robust formatting
import { atom, Getter, Setter } from 'jotai';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { callOpenAIStreamLogic } from './apiActions'; // To re-trigger AI
import { activeChatIdAtom, chatsAtom } from './chatData'; // To get chat messages/config

import { updateMessagesInChat } from './messageActions';
import { getHistoryForApi } from './regeneration'; // To prepare history
import { defaultMaxHistoryAtom } from './settings'; // For history limit

const formatJsonSchema = (schema: any) => JSON.stringify(schema, null, 2);

// --- Types --- (Keep existing definitions)
export interface McpServerConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  type: 'builtin-pseudo' | 'sse-client';
  url?: string; // Required for sse-client
  autoApproveTools: boolean;
}

export interface McpDiscoveredCapabilities {
  // Simplified structure for now
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
  transport: PseudoTransport | SSEClientTransport | null; // Keep track of transport
  capabilities: McpDiscoveredCapabilities | null;
  // We'll store capabilities directly, not separate lists initially
  // tools: any[];
  // resources: any[];
  // prompts: any[];
}

// --- MCP State Atoms ---

// Atom to hold the singleton instance of the built-in server
// We initialize it once when the atom is first read.
const builtinExprEvaluatorServerInstanceAtom = atom<McpServer>(() => {
  return createBuiltinExprEvaluatorServer();
});

/** Stores the configuration for all MCP servers. Persisted. */
export const mcpServersAtom = atomWithSafeStorage<McpServerConfig[]>(
  'mcpServers',
  [
    // Add the built-in server config by default
    {
      id: 'builtin::expr_evaluator',
      name: 'Expression Evaluator (Built-in)',
      description:
        'A simple JS expression evaluation tool (uses eval - use with caution). Runs locally.',
      enabled: true, // Enabled by default for testing
      type: 'builtin-pseudo',
      autoApproveTools: false, // Default to requiring approval
    },
  ],
);

/** Holds the runtime state of each MCP server connection. Not persisted. */
export const mcpServerStatesAtom = atom<Map<string, McpServerState>>(new Map());

/** Controls the visibility of the MCP tools popover in the chat interface. */
export const isMcpToolsPopoverOpenAtom = atom(false);

/** Stores the IDs of the MCP tools *selected by the user* for injection into the current chat. */
// We need to store selected *servers* or *capabilities*, not just tool names,
// as tool names might not be unique across servers.
// Let's store selected server IDs for now. The injection logic will use capabilities from these servers.
export const selectedMcpServerIdsAtom = atomWithSafeStorage<string[]>(
  'selectedMcpServerIds',
  [],
);

// --- MCP Action Atoms ---

/** Action to add a new MCP server configuration. */
export const addMcpServerAtom = atom(
  null,
  (get, set, config: Omit<McpServerConfig, 'id' | 'enabled'>) => {
    const newId =
      config.type === 'builtin-pseudo'
        ? `builtin::${uuidv4()}`
        : `custom::${uuidv4()}`; // Simple namespacing for ID
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
    set(mcpServersAtom, (prev) =>
      prev.map((server) => {
        if (server.id === update.id) {
          serverName = update.name ?? server.name; // Get name for toast
          return { ...server, ...update };
        }
        return server;
      }),
    );
    toast.success(`MCP Server "${serverName}" updated.`);
    // If URL/Type changed, might need to disconnect the old connection?
    const currentState = get(mcpServerStatesAtom).get(update.id);
    if (currentState?.isConnected || currentState?.isConnecting) {
      console.log(`Disconnecting server ${update.id} due to config update.`);
      set(disconnectMcpServerAtom, update.id); // Trigger disconnect
    }
  },
);

/** Action to delete an MCP server configuration. */
export const deleteMcpServerAtom = atom(null, (get, set, serverId: string) => {
  let serverName = 'Server';
  // Prevent deleting the default built-in server config
  if (serverId === 'builtin::expr_evaluator') {
    toast.error('Cannot delete the built-in Expression Evaluator server.');
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
      return;
    }
    if (!config.enabled) {
      console.log(
        `[MCP Connect] Server ${serverId} is disabled, skipping connect.`,
      );
      return;
    }

    const currentStates = get(mcpServerStatesAtom);
    const currentState = currentStates.get(serverId);

    if (currentState?.isConnected || currentState?.isConnecting) {
      console.log(
        `[MCP Connect] Server ${serverId} is already connected or connecting.`,
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
    let transport: PseudoTransport | SSEClientTransport | null = null;

    try {
      client = new Client({ name: 'Daan MCP Client', version: '1.0.0' }); // Basic client info

      // Create appropriate transport
      if (config.type === 'builtin-pseudo') {
        // Use the singleton instance of the built-in server
        const builtinServer = get(builtinExprEvaluatorServerInstanceAtom);
        if (!builtinServer) {
          throw new Error('Built-in server instance not available.');
        }
        transport = new PseudoTransport(builtinServer);
      } else if (config.type === 'sse-client' && config.url) {
        transport = new SSEClientTransport(new URL(config.url));
      } else {
        throw new Error(
          `Invalid server type or missing URL for ${config.type}`,
        );
      }

      // Attempt connection
      await client.connect(transport); // This also starts the transport

      // Fetch capabilities after successful connection
      console.log(
        `[MCP Connect] Connected to ${serverId}. Fetching capabilities...`,
      );
      const toolsResult = await client.listTools();
      const resourcesResult = await client.listResources(); // Assuming listResources exists
      const promptsResult = await client.listPrompts(); // Assuming listPrompts exists

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
        // && client.isConnected but MCP dont provide that api
        await client
          .close()
          .catch((closeErr) =>
            console.error(
              `[MCP Cleanup Error] Failed to close client for ${serverId}:`,
              closeErr,
            ),
          );
      } else if (transport) {
        // Close transport directly if client didn't connect fully
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
      // console.log(`[MCP Disconnect] Server ${serverId} is not connected.`);
      // Ensure state is clean if it exists but wasn't connected
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

    console.log(`[MCP Disconnect] Disconnecting from ${serverId}...`);

    try {
      if (currentState.client) {
        // client.close() should also close the associated transport
        await currentState.client.close();
        console.log(`[MCP Disconnect] Client closed for ${serverId}.`);
      } else if (currentState.transport) {
        // Fallback if only transport exists (e.g., connect failed partially)
        await currentState.transport.close();
        console.log(
          `[MCP Disconnect] Transport closed directly for ${serverId}.`,
        );
      }
      if (config) {
        // Only toast if config exists
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
        error: currentState.error, // Preserve previous error if any? Or clear? Let's clear.
        client: null,
        transport: null,
        capabilities: null, // Clear capabilities on disconnect
      };
      set(mcpServerStatesAtom, (prevMap) =>
        new Map(prevMap).set(serverId, disconnectedState),
      );
      // Remove from selected servers if disconnected manually
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
        console.log(`[MCP Connect All] Connecting ${config.id}`);
        set(connectMcpServerAtom, config.id); // Use async atom correctly
      } else {
        console.log(
          `[MCP Connect All] Skipping ${config.id} (already connected/connecting).`,
        );
      }
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
      set(disconnectMcpServerAtom, serverId);
    }
  });
  // Clear all selected servers
  set(selectedMcpServerIdsAtom, []);
});

// TODO: Implement remaining atoms later:
/** Derived atom to generate the system prompt instruction for enabled/selected MCP tools. */
export const mcpPromptInjectionAtom = atom<string>((get) => {
  const selectedIds = get(selectedMcpServerIdsAtom);
  const states = get(mcpServerStatesAtom);
  let injection = '';

  if (selectedIds.length === 0) {
    return ''; // No servers selected for injection
  }

  const availableToolsSections: string[] = [];

  selectedIds.forEach((serverId) => {
    const state = states.get(serverId);
    const config = get(mcpServersAtom).find((c) => c.id === serverId);

    // Check if server is selected, connected, and has capabilities
    if (state?.isConnected && state.capabilities && config) {
      const tools = state.capabilities.tools || [];
      // const resources = state.capabilities.resources || []; // Add if needed later
      // const prompts = state.capabilities.prompts || []; // Add if needed later

      if (tools.length > 0) {
        const toolDescriptions = tools
          .map((tool) => {
            // Format the JSON schema nicely
            const schemaString = tool.inputSchema
              ? JSON.stringify(
                  formatJsonSchema(tool.inputSchema as any),
                  null,
                  2,
                )
              : '{}';

            return `- Tool: ${tool.name}\n  Description: ${tool.description || 'No description'}\n  Input JSON Schema:\n\`\`\`json\n${schemaString}\n\`\`\``;
          })
          .join('\n');

        availableToolsSections.push(
          `Server: ${config.name} (ID: ${serverId})
${toolDescriptions}`,
        );
      }
    }
  });

  if (availableToolsSections.length > 0) {
    // Construct the final prompt section
    injection = `
---------------- MCP Tools Available ----------------
You have access to the following external tools provided by connected MCP servers.
To use a tool, respond *ONLY* with the following XML tag format, replacing placeholders:
<mcp-tool-call server="SERVER_ID" tool="TOOL_NAME" arguments='JSON_ARGUMENTS'>Optional thinking text</mcp-tool-call>

- Replace SERVER_ID with the ID of the server providing the tool.
- Replace TOOL_NAME with the exact name of the tool you want to call.
- Replace JSON_ARGUMENTS with a valid JSON string matching the tool's Input JSON Schema. Ensure proper escaping if the JSON string contains quotes. For tools with no arguments, use '{}'.
- You can optionally include thinking text between the tags, but it will be ignored by the system.

Available Tools:
${availableToolsSections.join('\n\n')}
-----------------------------------------------------
`;
  }

  return injection.trim(); // Trim leading/trailing whitespace
});

// --- Tool Call Handling Logic ---

// Helper to safely parse arguments, returns null on error
function safeParseArgs(argsString: string, toolName: string): any | null {
  try {
    // Basic unescape for JSON strings within the attribute
    const unescapedArgs = argsString.replace(/\\'/g, "'").replace(/\\"/g, '"');
    return JSON.parse(unescapedArgs);
  } catch (e) {
    console.error(
      `[MCP Tool Call] Failed to parse arguments for tool ${toolName}:`,
      argsString,
      e,
    );
    toast.error(`Invalid arguments format for tool ${toolName}.`);
    return null;
  }
}

// Helper to format tool result for display
function formatToolResultContent(result: CallToolResult): string {
  // Prioritize text content, handle errors, fallback for other types
  if (result.content && result.content.length > 0) {
    const firstPart = result.content[0];
    if (result.isError) {
      return `Error: ${firstPart.text}`;
    } else if (firstPart.type === 'text') {
      return firstPart.text || '[Empty Text Result]';
    } else {
      // Fallback for other types (e.g., image, json) - just stringify simply for now
      try {
        return JSON.stringify(firstPart, null, 2);
      } catch {
        return '[Unsupported Result Type]';
      }
    }
  }
  return '[No Content Returned]';
}

// Helper to format tool result for AI consumption
function formatToolResultForAI(result: CallToolResult): string {
  // For now, just return the text content or error. Might need more structure later.
  // Could potentially return JSON if the result content includes it.
  if (result.content && result.content.length > 0) {
    const firstPart = result.content[0];
    if (result.isError) {
      return `Error: ${firstPart.text}`;
    } else if (firstPart.type === 'text') {
      return firstPart.text || '';
    } else {
      try {
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
      chatId: string;
      serverId: string;
      toolName: string;
      argsString: string;
      rawTag: string;
    },
  ) => {
    const { chatId, serverId, toolName, argsString } = toolCallData;
    console.log(
      `[MCP Handler] Processing tool call for ${toolName} on ${serverId}`,
    );

    const callId = uuidv4(); // Unique ID for this invocation

    // 1. Parse Arguments
    const parsedArgs = safeParseArgs(argsString, toolName);
    if (parsedArgs === null) {
      // Add error message to chat? For now, just log and maybe toast.
      // TODO: Add user-facing error message in chat?
      return;
    }

    // 2. Find Server Config & State
    const config = get(mcpServersAtom).find((s) => s.id === serverId);
    const state = get(mcpServerStatesAtom).get(serverId);

    if (!config) {
      toast.error(
        `MCP Error: Configuration for server "${serverId}" not found.`,
      );
      return;
    }
    if (!state?.isConnected || !state.client) {
      toast.error(`MCP Error: Server "${config.name}" is not connected.`);
      // Maybe try to reconnect? For now, fail.
      // set(connectMcpServerAtom, serverId);
      return;
    }

    // 3. Create Pending Message
    const pendingToolCallInfo: PendingToolCallInfo = {
      type: 'pending',
      callId,
      serverId,
      serverName: config.name, // Use display name
      toolName,
      args: parsedArgs,
    };
    const pendingMessage: Message = {
      id: uuidv4(), // New message ID for the pending state display
      role: 'assistant', // Or maybe a custom role/type if needed for styling/filtering
      content: `Wants to use tool: **${toolName}** on **${config.name}**`,
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
        `[MCP Handler] Auto-approving tool call ${callId} for ${toolName}`,
      );
      // Call the execution logic directly
      await executeToolCall(
        get,
        set,
        chatId,
        pendingMessage.id,
        pendingToolCallInfo,
        state.client,
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
    if (!chatId) return;

    const chat = get(chatsAtom)[chatId];
    const pendingMessage = chat?.messages.find(
      (m) => m.id === pendingMessageId && m.toolCallInfo?.type === 'pending',
    );

    if (
      !pendingMessage ||
      !pendingMessage.toolCallInfo ||
      pendingMessage.toolCallInfo.type !== 'pending'
    ) {
      console.error(
        `[MCP Approve] Could not find pending message with ID ${pendingMessageId}`,
      );
      return;
    }

    const serverId = pendingMessage.toolCallInfo.serverId;
    const state = get(mcpServerStatesAtom).get(serverId);

    if (!state?.isConnected || !state.client) {
      toast.error(
        `MCP Error: Server "${pendingMessage.toolCallInfo.serverName}" is no longer connected.`,
      );
      // Update the pending message to show an error?
      const errorInfo: ToolCallInfo = {
        ...pendingMessage.toolCallInfo,
        type: 'error',
        isError: true,
      };
      set(chatsAtom, (prev) =>
        updateMessagesInChat(prev, chatId, (msgs) =>
          msgs.map((m) =>
            m.id === pendingMessageId
              ? {
                  ...m,
                  content: `Error: Server "${(pendingMessage.toolCallInfo as PendingToolCallInfo).serverName}" disconnected.`,
                  toolCallInfo: errorInfo,
                }
              : m,
          ),
        ),
      );
      return;
    }

    console.log(
      `[MCP Approve] User approved tool call ${pendingMessage.toolCallInfo.callId}`,
    );
    await executeToolCall(
      get,
      set,
      chatId,
      pendingMessageId,
      pendingMessage.toolCallInfo,
      state.client,
    );
  },
);

/** Action triggered when user denies a tool call */
export const denyToolCallAtom = atom(
  null,
  (get, set, pendingMessageId: string) => {
    const chatId = get(activeChatIdAtom);
    if (!chatId) return;

    const chat = get(chatsAtom)[chatId];
    const pendingMessage = chat?.messages.find(
      (m) => m.id === pendingMessageId && m.toolCallInfo?.type === 'pending',
    );

    if (
      !pendingMessage ||
      !pendingMessage.toolCallInfo ||
      pendingMessage.toolCallInfo.type !== 'pending'
    ) {
      console.error(
        `[MCP Deny] Could not find pending message with ID ${pendingMessageId}`,
      );
      return;
    }

    const deniedInfo: ToolCallInfo = {
      ...pendingMessage.toolCallInfo,
      type: 'denied',
    };
    const deniedContent = `Tool call **${pendingMessage.toolCallInfo.toolName}** denied by user.`;

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
      `[MCP Deny] User denied tool call ${pendingMessage.toolCallInfo.callId}`,
    );
    toast.info(`Tool call "${pendingMessage.toolCallInfo.toolName}" denied.`);

    // Optionally inform the AI about the denial
    // Create user message indicating denial
    const denialFeedbackMessage: Message = {
      id: uuidv4(),
      role: 'user', // Send as user context back to AI
      content: `(User denied the request to run tool: ${pendingMessage.toolCallInfo.toolName})`,
      timestamp: Date.now(),
    };
    set(chatsAtom, (prev) =>
      updateMessagesInChat(prev, chatId, (msgs) => [
        ...msgs,
        denialFeedbackMessage,
      ]),
    );

    // Re-trigger AI call with denial info? (similar to feeding back results)
    triggerAICallWithUpdatedHistory(get, set, chatId);
  },
);

async function executeToolCall(
  get: Getter,
  set: Setter,
  chatId: string,
  pendingMessageId: string,
  toolCallInfo: PendingToolCallInfo,
  client: Client,
) {
  const { callId, serverId, serverName, toolName, args } = toolCallInfo;

  // 1. Update pending message to "running" state
  const runningInfo: ToolCallInfo = { ...toolCallInfo, type: 'running' };
  const runningContent = `Running tool: **${toolName}** on **${serverName}**...`;
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
    // 2. Execute the tool call
    console.log(`[MCP Execute] Calling tool ${toolName} with args:`, args);
    const result = (await client.callTool({
      name: toolName,
      arguments: args,
    })) as CallToolResult;
    console.log(`[MCP Execute] Tool ${toolName} result:`, result);

    // 3. Process SUCCESS result
    const resultContent = formatToolResultContent(result);
    const resultInfo: ToolCallInfo = {
      callId,
      toolName,
      type: 'result',
      isError: false,
    };
    const resultMessage: Message = {
      id: uuidv4(),
      role: 'system', // Use system role for tool results for clarity? Or assistant? Let's try system.
      content: resultContent, // Display formatted result
      timestamp: Date.now(),
      toolCallInfo: resultInfo,
    };
    // Add the result message
    set(chatsAtom, (prev) =>
      updateMessagesInChat(prev, chatId, (msgs) => [...msgs, resultMessage]),
    );

    // 4. Feed result back to AI
    const resultForAI = formatToolResultForAI(result);
    const feedbackMessage: Message = {
      id: uuidv4(),
      // MUST be role 'tool' for some models like OpenAI function calling V2,
      // or 'user'/'assistant' containing structured info.
      // Let's try using a descriptive user message for now for broad compatibility.
      role: 'user',
      content: `(Tool ${toolName} finished with result: ${resultForAI})`, // Context for the AI
      timestamp: Date.now(),
    };
    set(chatsAtom, (prev) =>
      updateMessagesInChat(prev, chatId, (msgs) => [...msgs, feedbackMessage]),
    );

    // 5. Trigger AI again with the updated history
    triggerAICallWithUpdatedHistory(get, set, chatId);
  } catch (error: any) {
    // 3. Process ERROR result
    console.error(`[MCP Execute] Tool call ${toolName} failed:`, error);
    const errorContent = `Tool **${toolName}** failed: ${error.message || 'Unknown error'}`;
    const errorInfo: ToolCallInfo = {
      callId,
      toolName,
      type: 'error',
      isError: true,
    };
    const errorMessage: Message = {
      id: uuidv4(),
      role: 'system', // Keep consistent with success result message role
      content: errorContent,
      timestamp: Date.now(),
      toolCallInfo: errorInfo,
    };
    // Add the error message
    set(chatsAtom, (prev) =>
      updateMessagesInChat(prev, chatId, (msgs) => [...msgs, errorMessage]),
    );

    // Decide whether to re-trigger AI after an error. Maybe not automatically.
    // The user might want to retry or modify their request based on the error.
    toast.error(
      `Tool "${toolName}" failed: ${error.message || 'Unknown error'}`,
    );
  } finally {
    // Should we update the original 'running' message? Maybe remove it?
    // For now, let's leave the history (pending -> running -> result/error)
    // Or maybe update the running message to final state?
    // Let's just leave it and add the separate result/error message.
  }
}

// Helper to re-trigger the AI call after a tool result or denial
function triggerAICallWithUpdatedHistory(
  get: Getter,
  set: Setter,
  chatId: string,
) {
  const chat = get(chatsAtom)[chatId];
  if (!chat) {
    console.error(
      '[MCP Trigger AI] Chat not found after tool call/denial:',
      chatId,
    );
    return;
  }

  const maxHistory = chat.maxHistory ?? get(defaultMaxHistoryAtom);
  const messagesToSend = getHistoryForApi(
    get, // Pass get
    chat.messages, // Use the latest messages
    maxHistory,
    chat.systemPrompt,
  );

  // Check if there's anything to send besides system prompt
  const hasUserOrAssistantContent = messagesToSend.some(
    (msg) => msg.role === 'user' || msg.role === 'assistant',
  );
  if (!hasUserOrAssistantContent && messagesToSend.length <= 1) {
    // Allow system prompt only
    console.warn(
      '[MCP Trigger AI] Not enough context to re-trigger AI after tool call/denial.',
    );
    return;
  }

  console.log(
    '[MCP Trigger AI] Re-triggering AI call with updated history including tool result/denial.',
  );

  // Call the main API logic function, passing get and set
  callOpenAIStreamLogic(get, set, messagesToSend);
}
