// src/host-api.js
// --- Start of hostApi script ---
// This script MUST be included in the <head> or <body> of the Miniapp HTML.
// It provides the communication bridge for the Miniapp to interact with the Daan host application.
window.hostApi = (() => {
  /** @type {Map<string, { resolve: Function, reject: Function, timeoutId: number }>} */
  const pendingRequests = new Map();
  let messageIdCounter = 0;
  /** @type {Map<string, Function>} */
  const registeredFunctions = new Map();

  /** @type {Function | null} */
  let mcpRequestHandler = null;

  // --- Internal: Send message TO Host ---
  /**
   * Sends a message to the host application.
   * @param {string} type - The type of the message.
   * @param {any} payload - The data payload.
   * @param {string} [requestId] - Optional unique ID for request/response matching.
   * @param {string} [error] - Optional error message (used for responses).
   */
  function sendMessageToHost(type, payload, requestId, error) {
    // SECURITY WARNING: In production, replace '*' with the specific origin
    // of the host window if it's known and static. This provides better security.
    // const targetOrigin = 'YOUR_HOST_ORIGIN'; // e.g., 'https://daan.one'
    const targetOrigin = '*'; // Less secure, but necessary if host origin can vary (e.g., localhost, custom domains)

    window.parent.postMessage(
      {
        type,
        payload,
        requestId,
        error,
        // Optional: Add miniapp ID if easily available, for host logging
        // miniappId: window.miniappDefinition?.id // Assuming host injects this
      },
      targetOrigin,
    );
  }

  // --- Internal: Handle messages FROM Host ---
  /**
   * Handles incoming messages from the host application.
   * @param {MessageEvent} event - The message event.
   */
  function handleHostMessage(event) {
    // Basic security: Check if the message is from the parent window (the host)
    // Note: This isn't foolproof. Host should also verify iframe origin/source upon loading.
    if (event.source !== window.parent) {
      // console.warn('Miniapp: Ignoring message not from parent window');
      return;
    }
    // Optional: Further security check on origin
    // if (event.origin !== 'YOUR_HOST_ORIGIN') {
    //   console.warn(`Miniapp: Ignoring message from unexpected origin ${event.origin}`);
    //   return;
    // }

    const { type, payload, requestId, error } = event.data;

    // --- Response to a 'apiRequest' previously sent FROM this Miniapp ---
    if (type === 'apiResponse' && requestId && pendingRequests.has(requestId)) {
      const requestInfo = pendingRequests.get(requestId);
      if (!requestInfo) return; // Should not happen if map is consistent

      clearTimeout(requestInfo.timeoutId); // Clear the timeout associated with this request

      console.debug(
        `Miniapp: Received apiResponse for ${requestId}`,
        payload,
        error,
      );
      if (error) {
        requestInfo.reject(new Error(error));
      } else {
        requestInfo.resolve(payload);
      }
      pendingRequests.delete(requestId);
    }
    // --- Request FROM the Host to execute a function defined in this Miniapp ---
    else if (
      type === 'executeFunction' &&
      payload?.functionName &&
      registeredFunctions.has(payload.functionName)
    ) {
      const { functionName, args } = payload;
      console.debug(
        `Miniapp: Received request to execute function '${functionName}' with args:`,
        args,
      );
      const handler = registeredFunctions.get(functionName);
      try {
        // Execute the registered function. Handle both sync and async.
        const result = handler(...(Array.isArray(args) ? args : [args]));

        // Check if the result is a Promise
        if (result && typeof result.then === 'function') {
          result
            .then((asyncResult) => {
              console.debug(
                `Miniapp: Sending async functionResponse for ${requestId}`,
              );
              sendMessageToHost('functionResponse', asyncResult, requestId);
            })
            .catch((asyncError) => {
              console.error(
                `Miniapp: Error in async executed function '${functionName}':`,
                asyncError,
              );
              sendMessageToHost(
                'functionResponse',
                null,
                requestId,
                asyncError?.message || String(asyncError),
              );
            });
        } else {
          // Handle synchronous result
          console.debug(
            `Miniapp: Sending sync functionResponse for ${requestId}`,
          );
          sendMessageToHost('functionResponse', result, requestId);
        }
      } catch (syncError) {
        console.error(
          `Miniapp: Error in sync executed function '${functionName}':`,
          syncError,
        );
        sendMessageToHost(
          'functionResponse',
          null,
          requestId,
          syncError?.message || String(syncError),
        );
      }
    }
    // --- Host Events (e.g., theme change, lifecycle events) ---
    else if (type === 'hostEvent') {
      console.debug('Miniapp: Received host event:', payload);
      // Example: Dispatch a DOM event for other scripts in the Miniapp to listen to
      // You might want more specific event types than just 'hostevent'
      window.dispatchEvent(
        new CustomEvent(`daan:${payload.eventType || 'generic'}`, {
          detail: payload.data,
        }),
      );
    }
    // --- LLM Response Handling (Added for Requirement 2 later) ---
    else if (type === 'llmCallResponseChunk' && requestId) {
      // Dispatch specific event for LLM chunk
      window.dispatchEvent(
        new CustomEvent('daan:llmChunk', {
          detail: { requestId, chunk: payload.chunk },
        }),
      );
    } else if (type === 'llmCallResponseFinal' && requestId) {
      // Dispatch specific event for LLM final result
      window.dispatchEvent(
        new CustomEvent('daan:llmFinal', {
          detail: {
            requestId,
            result: payload.content,
            finishReason:
              payload.finishReason /* Adjust based on host structure */,
          },
        }),
      );
    } else if (type === 'llmCallError' && requestId) {
      // Dispatch specific event for LLM error
      window.dispatchEvent(
        new CustomEvent('daan:llmError', { detail: { requestId, error } }),
      );
    } else if (type === 'mcpRequest' && payload && requestId) {
      console.debug(`Miniapp: Received mcpRequest ${requestId}`, payload);
      if (typeof mcpRequestHandler === 'function') {
        // Use Promise.resolve to handle both sync/async handlers
        Promise.resolve(mcpRequestHandler(payload)) // Pass the JSON-RPC request payload
          .then((result) => {
            // Assume handler returns a valid JSON-RPC Response object
            console.debug(`Miniapp: Sending mcpResponse for ${requestId}`);
            sendMessageToHost('mcpResponse', result, requestId);
          })
          .catch((err) => {
            console.error(
              `Miniapp: Error in MCP request handler for ${requestId}:`,
              err,
            );
            // Construct a JSON-RPC error response object
            const errorResponsePayload = {
              jsonrpc: '2.0',
              id: payload.id, // Use the ID from the original request
              error: {
                code: -32000, // Generic server error
                message: err?.message || 'Miniapp MCP handler failed.',
                // data: err?.stack // Optional: include stack in data?
              },
            };
            sendMessageToHost('mcpResponse', errorResponsePayload, requestId);
          });
      } else {
        console.warn(
          `Miniapp: Received mcpRequest ${requestId} but no MCP handler registered.`,
        );
        const errorResponsePayload = {
          jsonrpc: '2.0',
          id: payload.id, // Use the ID from the original request
          error: {
            code: -32601,
            message: 'Method not found (No MCP handler registered in Miniapp)',
          },
        };
        sendMessageToHost('mcpResponse', errorResponsePayload, requestId);
      }
    }
    // Add handlers for other message types as needed
  }

  window.addEventListener('message', handleHostMessage);

  // --- Public API Method: Call Host Functionality ---
  /**
   * Calls a function exposed by the host application.
   * @param {string} apiName - The name of the host API function to call.
   * @param {any} [args] - Arguments to pass to the host function.
   * @param {number} [timeoutMs=15000] - Timeout duration in milliseconds.
   * @returns {Promise<any>} A promise that resolves with the result from the host or rejects on error/timeout.
   */
  function callHost(apiName, args, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const requestId = `miniappReq_${messageIdCounter++}_${apiName}`;

      const timeoutId = setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          console.warn(
            `Miniapp: Host API call '${apiName}' (ID: ${requestId}) timed out after ${timeoutMs}ms.`,
          );
          pendingRequests
            .get(requestId)
            ?.reject(new Error(`Host API call '${apiName}' timed out`));
          pendingRequests.delete(requestId);
        }
      }, timeoutMs);

      pendingRequests.set(requestId, { resolve, reject, timeoutId });

      console.debug(
        `Miniapp: Sending apiRequest '${apiName}' with ID ${requestId}`,
        args,
      );

      sendMessageToHost('apiRequest', { apiName, args }, requestId);
    });
  }

  // --- Public API Object ---
  const publicApi = {
    /**
     * Logs messages to the host's developer console.
     * @param {...any} args - Arguments to log.
     * @returns {Promise<void>}
     */
    log: (...args) => callHost('log', args, 5000), // Shorter timeout for logging

    /**
     * Retrieves the configuration specific to this Miniapp instance.
     * @returns {Promise<Record<string, any>>} Promise resolving with the config object.
     */
    getOwnConfig: () => callHost('getOwnConfig'),

    /**
     * Sets the configuration for this Miniapp instance.
     * The provided config object will be merged with existing config (shallow merge).
     * @param {Record<string, any>} config - The configuration object to set/update.
     * @returns {Promise<void>}
     */
    setOwnConfig: (config) => callHost('setOwnConfig', { config }),

    /**
     * Retrieves the configuration schema defined for this Miniapp.
     * @returns {Promise<Record<string, any> | null>} Promise resolving with the JSON schema object or null.
     */
    getOwnSchema: () => callHost('getOwnSchema'),

    /**
     * Accesses the persistent storage scoped to this Miniapp definition.
     */
    storage: {
      /**
       * Stores a value associated with a key. Value will be JSON-stringified.
       * @param {string} key - The storage key.
       * @param {any} value - The value to store (must be JSON-serializable).
       * @returns {Promise<void>}
       */
      setItem: (key, value) => callHost('storageSetItem', { key, value }),
      /**
       * Retrieves a value associated with a key. Value will be JSON-parsed.
       * @param {string} key - The storage key.
       * @returns {Promise<any | null>} Promise resolving with the stored value or null if not found.
       */
      getItem: (key) => callHost('storageGetItem', { key }),
      /**
       * Removes a key-value pair from storage.
       * @param {string} key - The storage key to remove.
       * @returns {Promise<void>}
       */
      removeItem: (key) => callHost('storageRemoveItem', { key }),
      /**
       * Retrieves all keys currently stored for this Miniapp.
       * @returns {Promise<string[]>} Promise resolving with an array of keys.
       */
      getAllKeys: () => callHost('storageGetAllKeys'),
      // Potential future addition:
      // clearAll: () => callHost('storageClearAll'),
    },

    /**
     * Calls a function registered by another Miniapp instance.
     * @param {string} targetId - The instanceId of the target Miniapp.
     * @param {string} functionName - The name of the function registered by the target.
     * @param {any} [args] - Arguments to pass to the target function.
     * @returns {Promise<any>} Promise resolving with the result from the target Miniapp.
     */
    callMiniapp: (targetId, functionName, args) =>
      callHost('callMiniapp', { targetId, functionName, args }),

    /**
     * Invokes a Tauri command (only available in Tauri desktop environment).
     * Requires the command to be allowed in the Miniapp's permissions.
     * @param {string} command - The Tauri command name.
     * @param {any} [args] - Arguments for the Tauri command.
     * @returns {Promise<any>} Promise resolving with the result from Tauri.
     */
    invokeTauri: (command, args) =>
      callHost('invokeTauri', { command, args }, 30000), // Longer timeout for potentially complex commands

    /**
     * Registers a function within this Miniapp that can be called by the host
     * or other Miniapps (via `hostApi.callMiniapp`).
     * @param {string} functionName - The name to register the function under.
     * @param {Function} handler - The function handler (can be async).
     */
    registerFunction: (functionName, handler) => {
      if (typeof functionName === 'string' && typeof handler === 'function') {
        console.debug(
          `Miniapp: Registering function '${functionName}' for external calls.`,
        );
        registeredFunctions.set(functionName, handler);
        // Optional: Notify host about registration? Could be useful for discovery.
        // sendMessageToHost('functionRegistered', { functionName });
      } else {
        console.error(
          'Miniapp: Invalid arguments for registerFunction. Requires string name and function handler.',
        );
      }
    },

    /**
     * Unregisters a previously registered function.
     * @param {string} functionName - The name of the function to unregister.
     */
    unregisterFunction: (functionName) => {
      if (registeredFunctions.has(functionName)) {
        console.debug(`Miniapp: Unregistering function '${functionName}'.`);
        registeredFunctions.delete(functionName);
        // Optional: Notify host about unregistration?
        // sendMessageToHost('functionUnregistered', { functionName });
      }
    },

    /**
     * Reports an error that occurred within the Miniapp to the host.
     * @param {Error | string} error - The error object or message.
     * @returns {Promise<void>}
     */
    reportError: (error) => {
      let errorPayload = { message: String(error), stack: undefined };
      if (error instanceof Error) {
        errorPayload.message = error.message;
        errorPayload.stack = error.stack;
      }
      return callHost('reportError', errorPayload, 5000); // Short timeout
    },

    // --- LLM API Namespace (Added for Req 2) ---
    llm: {
      /**
       * Retrieves the list of available AI models and providers from the host.
       * @returns {Promise<ApiProviderConfig[]>}
       */
      getModels: () => callHost('llmGetModels'),
      /**
       * Retrieves the host's default LLM settings.
       * @returns {Promise<object>} Object containing default model, temperature etc.
       */
      getDefaults: () => callHost('llmGetDefaults'),
      /**
       * Initiates a call to an Language Model via the host.
       * Requires listening for 'daan:llmChunk', 'daan:llmFinal', 'daan:llmError' CustomEvents.
       * @param {object} options - Call options.
       * @param {string} options.requestId - A unique ID you provide to track this specific call.
       * @param {string | undefined} options.model - The namespaced model ID (e.g., "openai::gpt-4o").
       * @param {Array<{role: string, content: string}>} options.messages - The message history/prompt.
       * @param {boolean} options.stream - Whether to stream the response (true) or get it all at once (false). when false, data will be received in 'daan:llmFinal' event.
       * @param {number} [options.temperature] - Optional temperature override.
       * @param {number} [options.maxTokens] - Optional maxTokens override.
       * @param {number} [options.topP] - Optional topP override.
       * @returns {Promise<void>} Resolves when the request is sent to the host, rejects on immediate errors. Does *not* wait for the LLM response.
       */
      call: (options) => {
        if (!options || typeof options !== 'object' || !options.requestId) {
          return Promise.reject(
            new Error(
              'Miniapp: hostApi.llm.call requires options object with a unique requestId.',
            ),
          );
        }
        // Basic validation, host will do more thorough checks
        if (!Array.isArray(options.messages)) {
          return Promise.reject(
            new Error('Miniapp: hostApi.llm.call requires messages array.'),
          );
        }
        return callHost('llmCall', options, 60000); // Longer timeout for potentially long calls
      },
      /**
       * Requests the host to abort an ongoing LLM call.
       * @param {string} requestId - The unique ID of the LLM call to abort.
       * @returns {Promise<void>}
       */
      abort: (requestId) => callHost('llmAbort', { requestId }),
    },
    /**
     * Registers a handler function to process incoming MCP requests from the host.
     * The handler receives the JSON-RPC request object and MUST return a Promise
     * resolving with a valid JSON-RPC response object (containing 'result' or 'error').
     * @param {function(object): Promise<object>} handler - Async function (request) => Promise<response>.
     */
    registerMcpHandler: (handler) => {
      if (typeof handler === 'function') {
        console.debug('Miniapp: Registering MCP request handler.');
        mcpRequestHandler = handler;
      } else {
        console.error(
          'Miniapp: Invalid MCP handler provided. Must be a function.',
        );
      }
    },
    /** Unregisters the MCP request handler. */
    unregisterMcpHandler: () => {
      console.debug('Miniapp: Unregistering MCP request handler.');
      mcpRequestHandler = null;
    },

    // --- Cleanup on Unload ---
    // Automatically unregister functions and potentially abort pending requests when the Miniapp unloads.
    _cleanup: () => {
      console.log('Miniapp: Running hostApi cleanup...');
      // Abort pending requests
      pendingRequests.forEach((reqInfo, reqId) => {
        clearTimeout(reqInfo.timeoutId);
        reqInfo.reject(new Error('Miniapp unloaded before host responded.'));
        console.debug(`Miniapp: Aborted request ${reqId} due to unload.`);
      });
      pendingRequests.clear();
      // Clear registered functions (though host should handle this too)
      registeredFunctions.clear();
      // Remove the main listener
      window.removeEventListener('message', handleHostMessage);
      mcpRequestHandler = null; // Clear handler on unload
      console.log('Miniapp: hostApi cleanup complete (incl. MCP).');
    },
  };

  // Add cleanup listener
  window.addEventListener('unload', publicApi._cleanup);

  console.info('Miniapp: hostApi initialized.');
  return publicApi;
})();
// --- End of hostApi script ---
