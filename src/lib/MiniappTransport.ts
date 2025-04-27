// src/lib/MiniappTransport.ts
import { activeMiniappTransportsAtom } from '@/store/miniapp';
import type {
  MiniappBridgeRegistry,
  MiniappInstance,
  SendMessageFunc,
} from '@/types';
import type {
  Transport,
  TransportSendOptions,
} from '@moinfra/mcp-client-sdk/shared/transport.js';
import type { JSONRPCMessage } from '@moinfra/mcp-client-sdk/types.js';
import { atom, Getter, Setter } from 'jotai';
import { v4 as uuidv4 } from 'uuid'; // For session ID

/**
 * A transport layer for MCP communication between the host application
 * and a Miniapp running in an iframe, using the postMessage bridge.
 */
export class MiniappTransport implements Transport {
  private _targetMiniappId: string;
  private _bridgeRegistry: MiniappBridgeRegistry;
  private _activeInstancesGetter: () => MiniappInstance[];

  // === Connection State ===
  private _targetInstanceId: string | null = null;
  private _sendMessageFunc: SendMessageFunc | undefined = undefined;
  private _isStarted: boolean = false;
  private _isConnected: boolean = false; // Reflects if the target instance is currently reachable

  // === Transport Interface Callbacks ===
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public onmessage?: (message: JSONRPCMessage) => void; // Handles ALL incoming messages

  // === Session ID ===
  public sessionId: string; // Required by some MCP flows, generate unique ID per transport instance

  constructor(
    targetMiniappId: string,
    bridgeRegistry: MiniappBridgeRegistry,
    activeInstancesGetter: () => MiniappInstance[],
  ) {
    if (!targetMiniappId) throw new Error('targetMiniappId is required');
    if (!bridgeRegistry) throw new Error('bridgeRegistry is required');
    if (!activeInstancesGetter)
      throw new Error('activeInstancesGetter is required');

    this._targetMiniappId = targetMiniappId;
    this._bridgeRegistry = bridgeRegistry;
    this._activeInstancesGetter = activeInstancesGetter;
    this.sessionId = uuidv4(); // Generate a unique ID for this transport session

    console.log(
      `MiniappTransport[${this.sessionId.substring(0, 6)}]: Created for target DefID ${targetMiniappId}`,
    );
  }

  /**
   * Internal handler called by the bridge mechanism when a message
   * is received *from* the connected Miniapp instance.
   * It forwards the message to the MCP Client via the onmessage callback.
   * @param message The JSONRPCMessage received from the Miniapp.
   */
  public _handleBridgeMessage(message: JSONRPCMessage): void {
    if (!this._isStarted || !this._isConnected) {
      console.warn(
        `MiniappTransport[${this.sessionId.substring(0, 6)}]: Received bridge message but transport is not active. Ignoring.`,
        message,
      );
      return;
    }
    console.debug(
      `MiniappTransport[${this.sessionId.substring(0, 6)}]: Received message from bridge, forwarding via onmessage:`,
      message,
    );
    try {
      // Forward the *entire* JSONRPCMessage to the client
      this.onmessage?.(message);
    } catch (error: any) {
      console.error(
        `MiniappTransport[${this.sessionId.substring(0, 6)}]: Error in onmessage handler:`,
        error,
      );
      this.onerror?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Internal handler called by the bridge mechanism if the target
   * Miniapp instance becomes unavailable (e.g., closed).
   */
  public _handleBridgeDisconnect(): void {
    if (!this._isConnected) return; // Already disconnected
    console.warn(
      `MiniappTransport[${this.sessionId.substring(0, 6)}]: Target instance ${this._targetInstanceId} disconnected.`,
    );
    this._isConnected = false;
    this._sendMessageFunc = undefined;
    this.onerror?.(
      new Error(`Miniapp instance ${this._targetInstanceId} disconnected.`),
    );
    // Optionally trigger onclose as well, depending on desired behavior for abrupt disconnects
    // this.onclose?.();
  }

  // --- Transport Interface Implementation ---

  async start(): Promise<void> {
    if (this._isStarted) {
      console.warn(
        `MiniappTransport[${this.sessionId.substring(0, 6)}]: Already started.`,
      );
      return;
    }
    console.log(
      `MiniappTransport[${this.sessionId.substring(0, 6)}]: Starting...`,
    );

    // Ensure callbacks are set before proceeding (as per interface docs)
    // Although the MCP Client sets them before calling start usually.
    if (!this.onmessage || !this.onerror || !this.onclose) {
      console.warn(
        `MiniappTransport[${this.sessionId.substring(0, 6)}]: Starting transport before all handlers (onmessage, onerror, onclose) are set.`,
      );
    }

    const activeInstances = this._activeInstancesGetter();
    const targetInstance = activeInstances.find(
      (inst) => inst.definitionId === this._targetMiniappId,
    );

    if (!targetInstance) {
      this._isStarted = true; // Mark as started even if connect fails initially
      throw new Error(
        `MiniappTransport Error: No active instance found for target Miniapp Definition ID: ${this._targetMiniappId}. Please start the Miniapp.`,
      );
    }

    this._targetInstanceId = targetInstance.instanceId;
    this._sendMessageFunc = this._bridgeRegistry.getSendMessage(
      this._targetInstanceId,
    );

    if (!this._sendMessageFunc) {
      // Instance exists but bridge isn't ready? Retry briefly.
      await new Promise((resolve) => setTimeout(resolve, 150));
      this._sendMessageFunc = this._bridgeRegistry.getSendMessage(
        this._targetInstanceId,
      );
      if (!this._sendMessageFunc) {
        this._isStarted = true;
        throw new Error(
          `MiniappTransport Error: Could not find sendMessage function for active instance ${this._targetInstanceId}. Bridge might be initializing.`,
        );
      }
    }

    this._isConnected = true;
    this._isStarted = true;
    console.log(
      `MiniappTransport[${this.sessionId.substring(0, 6)}]: Started successfully. Target Instance: ${this._targetInstanceId}`,
    );

    // NOTE: The mechanism for receiving messages (_handleBridgeMessage)
    // needs to be established by the host's bridge logic (useMiniappBridge)
    // which maps incoming iframe messages to this specific transport instance.
  }

  async close(): Promise<void> {
    if (!this._isStarted) {
      console.warn(
        `MiniappTransport[${this.sessionId.substring(0, 6)}]: Transport not started, cannot close.`,
      );
      return;
    }
    console.log(
      `MiniappTransport[${this.sessionId.substring(0, 6)}]: Closing connection...`,
    );

    const wasConnected = this._isConnected;
    this._isConnected = false;
    this._isStarted = false; // Mark as stopped
    this._sendMessageFunc = undefined;
    const instanceId = this._targetInstanceId;
    this._targetInstanceId = null;

    // TODO: Need mechanism for useMiniappBridge to stop routing messages to this instance's _handleBridgeMessage

    // Call the onclose handler if it was previously connected or started
    // Use setTimeout to avoid issues if close() is called from within another handler
    if (wasConnected || this.onclose) {
      // Trigger if we were connected or if handler exists
      const handler = this.onclose;
      setTimeout(() => {
        try {
          handler?.();
        } catch (e) {
          console.error('Error in transport onclose handler:', e);
        }
      }, 0);
    }
    // Clear handlers to prevent future calls
    this.onmessage = undefined;
    this.onerror = undefined;
    this.onclose = undefined;
    console.log(
      `MiniappTransport[${this.sessionId.substring(0, 6)}]: Closed (Instance was ${instanceId}).`,
    );
  }

  async send(
    message: JSONRPCMessage,
    options?: TransportSendOptions,
  ): Promise<void> {
    if (!this._isStarted) {
      return Promise.reject(
        new Error('MiniappTransport Error: Transport not started.'),
      );
    }
    if (!this._isConnected || !this._sendMessageFunc) {
      // Transport might be started but target instance disappeared
      return Promise.reject(
        new Error(
          `MiniappTransport Error: Not connected to target instance ${this._targetInstanceId || this._targetMiniappId}.`,
        ),
      );
    }

    // The promise resolves when the message is successfully sent over the bridge,
    // or rejects if the bridge communication fails immediately.
    return new Promise((resolve, reject) => {
      try {
        console.debug(
          `MiniappTransport[${this.sessionId.substring(0, 6)}]: Sending message via bridge to ${this._targetInstanceId}:`,
          message,
        );
        // Send the actual JSONRPCMessage as the payload
        // Use a distinct bridge message type for clarity
        this._sendMessageFunc?.(
          'mcpOutgoingMessage', // Bridge message type
          message, // Payload is the JSONRPCMessage
          // No specific bridge requestId needed here unless we want bridge ACK
        );
        resolve(); // Message handed off to bridge successfully
      } catch (sendError: any) {
        console.error(
          `MiniappTransport[${this.sessionId.substring(0, 6)}]: Failed to send message via bridge:`,
          sendError,
        );
        this.onerror?.(sendError); // Report error to client
        reject(sendError); // Reject the send promise
      }
    });
  }
}

// --- Bridge Hook Interaction Logic ---
/**
 * To be called by the mechanism that creates/manages transports,
 * associating a transport with its target instance ID.
 */
export function registerMiniappTransportForInstance(
  set: Setter, // Pass Jotai setter
  instanceId: string,
  transport: MiniappTransport,
): void {
  set(activeMiniappTransportsAtom, (prevMap) => {
    const newMap = new Map(prevMap);
    // If another transport was somehow registered for this instance, warn/replace?
    if (newMap.has(instanceId)) {
      console.warn(
        `Bridge Router: Replacing existing transport registration for instance ${instanceId}`,
      );
      // Optionally close the old one? transport.close() might be called anyway.
    }
    console.log(
      `Bridge Router: Registering transport ${transport.sessionId.substring(0, 6)} for instance ${instanceId}`,
    );
    newMap.set(instanceId, transport);
    return newMap;
  });
  // TODO: Add listener for when this specific instanceId is closed/removed from activeMiniappInstancesAtom
  // to automatically call unregisterMiniappTransportForInstance and transport.close()
}

/**
 * Unregisters a transport instance from the global Jotai atom map.
 * Should be called when the transport is closed or the instance disappears.
 */
export function unregisterMiniappTransportForInstance(
  set: Setter, // Pass Jotai setter
  instanceId: string,
): void {
  set(activeMiniappTransportsAtom, (prevMap) => {
    if (prevMap.has(instanceId)) {
      const transport = prevMap.get(instanceId);
      console.log(
        `Bridge Router: Unregistering transport ${transport?.sessionId.substring(0, 6)} for instance ${instanceId}`,
      );
      const newMap = new Map(prevMap);
      newMap.delete(instanceId);
      return newMap;
    }
    return prevMap; // Return original map if not found
  });
}

/**
 * Routes an incoming message from the bridge to the correct transport.
 * To be called by useMiniappBridge's message handler.
 */
function routeMessageToMiniappTransport(
  get: Getter,
  instanceId: string,
  message: JSONRPCMessage,
): boolean {
  // Return true if routed, false otherwise
  const transportMap = get(activeMiniappTransportsAtom);
  const transport = transportMap.get(instanceId);

  if (transport) {
    transport._handleBridgeMessage(message);
    return true;
  } else {
    // Only warn if it looks like an MCP message to avoid noise
    if ('jsonrpc' in message && message.jsonrpc === '2.0') {
      console.warn(
        `Bridge Router: No active MiniappTransport found for instance ${instanceId} to route MCP message:`,
        message,
      );
    }
    return false;
  }
}

export const routeMessageToMiniMcpAtom = atom(
  null,
  (get: Getter, set: Setter, instanceId: string, message: JSONRPCMessage) => {
    return routeMessageToMiniappTransport(get, instanceId, message);
  },
);

/**
 * Notifies the relevant transport that its underlying Miniapp instance disconnected.
 */
export function notifyMiniappTransportOfDisconnect(
  get: Getter,
  instanceId: string,
): void {
  const transportMap = get(activeMiniappTransportsAtom);
  const transport = transportMap.get(instanceId);
  transport?._handleBridgeDisconnect();
  // Unregistration should happen separately when the transport is confirmed closed or instance removed
}
