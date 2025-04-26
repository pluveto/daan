import {
  Transport,
  TransportSendOptions,
} from '@moinfra/mcp-client-sdk/shared/transport.js';
import { JSONRPCMessage } from '@moinfra/mcp-client-sdk/types.js';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { isDesktopEnv } from './env';

/**
 * Tauri transport for stdio communication with a backend-managed process.
 */
export class TauriStdioTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  private processId: string | null = null;
  private command: string;
  private args: string[];
  private unlisteners: UnlistenFn[] = [];
  private isClosed = false; // Flag to prevent actions after close

  // We don't implement sessionId here, but could if needed.
  sessionId?: string;

  constructor(command: string, args: string[] = []) {
    if (!isDesktopEnv()) {
      throw new Error(
        'TauriStdioTransport can only be used in a Tauri environment.',
      );
    }
    this.command = command;
    this.args = args;
  }

  async start(): Promise<void> {
    if (this.processId) {
      throw new Error('Transport already started.');
    }
    if (this.isClosed) {
      throw new Error('Transport has been closed.');
    }

    console.log(
      `Requesting backend to start process: ${this.command} ${this.args.join(' ')}`,
    );

    try {
      const pid = await invoke<string>('start_external_process', {
        command: this.command,
        args: this.args,
      });
      this.processId = pid;
      console.log(`Backend started process with ID: ${this.processId}`);
      await this.setupEventListeners();
      // Maybe emit a custom "started" event or resolve promise here
    } catch (error) {
      console.error('Failed to start external process:', error);
      const err = new Error(`Failed to start process: ${error}`);
      this.onerror?.(err);
      await this.cleanup(); // Ensure cleanup if start fails
      throw err; // Re-throw error
    }
  }

  private async setupEventListeners(): Promise<void> {
    if (!this.processId) return;

    const messageEvent = `process_message_${this.processId}`;
    const errorEvent = `process_error_${this.processId}`;
    const stderrEvent = `process_stderr_${this.processId}`; // Listen to stderr for debugging
    const closeEvent = `process_closed_${this.processId}`;

    try {
      const unlistenMessage = await listen<string>(messageEvent, (event) => {
        console.debug(
          `Received raw message from backend (${this.processId}):`,
          event.payload,
        );
        try {
          const message = JSON.parse(event.payload) as JSONRPCMessage;
          this.onmessage?.(message);
        } catch (e) {
          console.error(
            `Failed to parse JSON message from process ${this.processId}:`,
            event.payload,
            e,
          );
          const err = new Error(`Received non-JSON message: ${event.payload}`);
          this.onerror?.(err);
        }
      });

      const unlistenError = await listen<string>(errorEvent, (event) => {
        console.error(
          `Received error event from backend (${this.processId}):`,
          event.payload,
        );
        const err = new Error(`Process error: ${event.payload}`);
        this.onerror?.(err);
        // Consider if an error should trigger closure
        // this.close();
      });

      const unlistenStderr = await listen<string>(stderrEvent, (event) => {
        console.warn(`[Process ${this.processId} stderr]:`, event.payload);
        // Optionally trigger onerror for stderr messages if desired
        // const err = new Error(`Process stderr: ${event.payload}`);
        // this.onerror?.(err);
      });

      const unlistenClose = await listen<string>(closeEvent, (event) => {
        console.log(
          `Received close event from backend (${this.processId}):`,
          event.payload,
        );
        this.handleClose(); // Call internal close handler
      });

      this.unlisteners = [
        unlistenMessage,
        unlistenError,
        unlistenStderr,
        unlistenClose,
      ];
      console.log(`Event listeners setup for process ${this.processId}`);
    } catch (error) {
      console.error(
        `Failed to set up event listeners for process ${this.processId}:`,
        error,
      );
      const err = new Error(`Failed to listen to backend events: ${error}`);
      this.onerror?.(err);
      await this.close(); // Close if listeners can't be set up
      throw err;
    }
  }

  async send(
    message: JSONRPCMessage,
    options?: TransportSendOptions,
  ): Promise<void> {
    if (!this.processId || this.isClosed) {
      throw new Error('Transport not started or already closed.');
    }

    try {
      const messageString = JSON.stringify(message);
      console.debug(
        `Sending message to process ${this.processId}:`,
        messageString,
      );
      await invoke('send_message_to_process', {
        id: this.processId,
        message: messageString,
      });
    } catch (error) {
      console.error(
        `Failed to send message to process ${this.processId}:`,
        error,
      );
      const err = new Error(`Failed to send message: ${error}`);
      this.onerror?.(err);
      throw err; // Re-throw error
    }
  }

  async close(): Promise<void> {
    if (this.isClosed) {
      return; // Already closed
    }
    console.log(`Requesting backend to stop process ${this.processId}`);
    const pid = this.processId; // Store pid before cleanup might nullify it
    await this.cleanup(); // Clean up listeners first

    if (pid) {
      try {
        await invoke('stop_external_process', { id: pid });
        console.log(`Stop command sent for process ${pid}`);
      } catch (error) {
        console.error(
          `Failed to invoke stop_external_process for ${pid}:`,
          error,
        );
        // Don't trigger onerror here usually, as the close was requested.
        // Backend might have already cleaned up. Log it.
      }
    }
    // Note: The actual onclose callback is triggered by the backend event listener
    // calling handleClose(). We call it here ensure it's called even if events failed.
    this.handleClose(true); // Force handleClose if not already called by event
  }

  // Internal handler for closure logic, avoids calling onclose multiple times
  private handleClose(force: boolean = false): void {
    if (!this.isClosed) {
      this.isClosed = true;
      console.log(`Transport closed for process ${this.processId}`);
      // If forced (e.g. from explicit close call), call onclose
      // Otherwise, it's called by the event listener
      if (force) {
        this.onclose?.();
      }
      // If called by event, we still set isClosed and log
    }
  }

  private async cleanup(): Promise<void> {
    console.log(`Cleaning up resources for process ${this.processId}`);
    this.unlisteners.forEach((unlisten) => unlisten());
    this.unlisteners = [];
    // Don't nullify processId here, it might be needed for the final stop command
    // this.processId = null;
  }
}

// --- Example Usage (in your frontend code) ---

/*
import { TauriStdioTransport } from './transport';
import { YourMCPClient } from './your-mcp-library';

async function setupCommunication() {
    const command = 'path/to/your/external/program'; // Or just 'program_name' if in PATH
    const args = ['--some-arg', 'value'];

    const transport = new TauriStdioTransport(command, args);
    const client = new YourMCPClient(transport); // Use your MCP client library

    transport.onerror = (error) => {
        console.error("Transport Error:", error);
        // Handle UI feedback for error
    };

    transport.onclose = () => {
        console.log("Transport Connection Closed");
        // Handle UI feedback for closure
    };

     // The MCP Client library usually handles onmessage internally,
     // but you might set it up directly on transport for debugging:
     transport.onmessage = (message) => {
         console.log("Raw message received:", message);
     };

    try {
        // The MCP Client library's connect/start method should internally call transport.start()
        await client.connect(); // Or whatever method your library uses

        console.log("MCP Client connected via Tauri stdio transport.");

        // Now you can use your MCP client to send requests
        // const response = await client.sendRequest({ method: 'some_method', params: [...] });
        // console.log("Response:", response);

        // To close:
        // await client.disconnect(); // This should call transport.close()

    } catch (error) {
        console.error("Failed to connect or communicate:", error);
    }
}

setupCommunication();
*/
