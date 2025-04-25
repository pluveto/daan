// --- Start of hostApi script ---
// This script should be included in the <head> or <body> of the Miniapp HTML.
window.hostApi = (() => {
  const pendingRequests = new Map(); // Map<requestId, { resolve, reject }>
  let messageIdCounter = 0;
  const registeredFunctions = new Map(); // Map<functionName, Function>

  // Listen for messages FROM the Host
  window.addEventListener('message', (event) => {
    // Basic security: Check if the message is from the parent window (the host)
    // Note: This isn't foolproof, but better than nothing. Host should verify iframe source too.
    if (event.source !== window.parent) {
      // console.warn('Miniapp: Ignoring message not from parent window', event.source, window.parent);
      return;
    }
    // Optionally check event.origin if a specific host origin is expected

    const { type, payload, requestId, error } = event.data;

    // Response to a previous 'apiRequest' sent FROM this Miniapp
    if (type === 'apiResponse' && requestId && pendingRequests.has(requestId)) {
      const { resolve, reject } = pendingRequests.get(requestId);
      console.log(
        `Miniapp: Received apiResponse for ${requestId}`,
        payload,
        error,
      );
      if (error) {
        reject(new Error(error));
      } else {
        resolve(payload);
      }
      pendingRequests.delete(requestId);
    }
    // Request FROM the Host (or another Miniapp via Host) to execute a function defined here
    else if (
      type === 'executeFunction' &&
      payload?.functionName &&
      registeredFunctions.has(payload.functionName)
    ) {
      const { functionName, args } = payload;
      console.log(
        `Miniapp: Received request to execute function '${functionName}' with args:`,
        args,
      );
      const handler = registeredFunctions.get(functionName);
      try {
        // Execute the registered function. Handle both sync and async functions.
        const result = handler(...(Array.isArray(args) ? args : [args]));

        // Check if the result is a Promise
        if (result && typeof result.then === 'function') {
          result
            .then((asyncResult) => {
              console.log(
                `Miniapp: Sending async functionResponse for ${requestId}`,
              );
              window.parent.postMessage(
                { type: 'functionResponse', payload: asyncResult, requestId },
                '*',
              ); // Target origin!
            })
            .catch((asyncError) => {
              console.error(
                `Miniapp: Error in async executed function '${functionName}':`,
                asyncError,
              );
              window.parent.postMessage(
                {
                  type: 'functionResponse',
                  payload: null,
                  error: asyncError.message || String(asyncError),
                  requestId,
                },
                '*',
              ); // Target origin!
            });
        } else {
          // Handle synchronous result
          console.log(
            `Miniapp: Sending sync functionResponse for ${requestId}`,
          );
          window.parent.postMessage(
            { type: 'functionResponse', payload: result, requestId },
            '*',
          ); // Target origin!
        }
      } catch (syncError) {
        console.error(
          `Miniapp: Error in sync executed function '${functionName}':`,
          syncError,
        );
        window.parent.postMessage(
          {
            type: 'functionResponse',
            payload: null,
            error: syncError.message || String(syncError),
            requestId,
          },
          '*',
        ); // Target origin!
      }
    }
    // Handle other host-initiated message types (e.g., 'hostEvent') if needed
    else if (type === 'hostEvent') {
      console.log('Miniapp: Received host event:', payload);
      // Example: Dispatch a DOM event for other scripts in the Miniapp to listen to
      window.dispatchEvent(new CustomEvent('hostevent', { detail: payload }));
    }
  });

  // Function used by Miniapp code to call Host APIs
  function callHost(apiName, args) {
    return new Promise((resolve, reject) => {
      const requestId = `miniappReq_${messageIdCounter++}_${apiName}`;
      pendingRequests.set(requestId, { resolve, reject });
      console.log(
        `Miniapp: Sending apiRequest '${apiName}' with ID ${requestId}`,
        args,
      );

      // SECURITY: Replace '*' with the actual host origin in production if known.
      window.parent.postMessage(
        {
          type: 'apiRequest',
          payload: { apiName, args },
          requestId: requestId,
        },
        '*',
      );

      // Optional: Timeout for requests to the host
      setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          console.warn(
            `Miniapp: Host API call '${apiName}' (ID: ${requestId}) timed out.`,
          );
          pendingRequests
            .get(requestId)
            ?.reject(new Error(`Host API call '${apiName}' timed out`));
          pendingRequests.delete(requestId);
        }
      }, 15000); // 15 second timeout
    });
  }

  // The public API object exposed to the Miniapp's code
  return {
    // Host interaction APIs
    log: (...args) => callHost('log', args),
    // Config APIs
    getOwnConfig: () => callHost('getOwnConfig'),
    getConfig: (miniappId) => callHost('getConfig', { miniappId }),
    setOwnConfig: (config) => callHost('setOwnConfig', { config }),
    getOwnSchema: () => callHost('getOwnSchema'), // Optional schema access

    // Storage APIs
    storage: {
      setItem: (key, value) => callHost('storageSetItem', { key, value }),
      getItem: (key) => callHost('storageGetItem', { key }),
      removeItem: (key) => callHost('storageRemoveItem', { key }),
      getAllKeys: () => callHost('storageGetAllKeys'),
      // Maybe add clear() later if needed
    },

    callMiniapp: (targetId, functionName, args) =>
      callHost('callMiniapp', { targetId, functionName, args }),
    invokeTauri: (command, args) => callHost('invokeTauri', { command, args }),

    // Functionality for receiving calls from other Miniapps (via host)
    registerFunction: (functionName, handler) => {
      if (typeof functionName === 'string' && typeof handler === 'function') {
        console.log(
          `Miniapp: Registering function '${functionName}' for inter-app calls.`,
        );
        registeredFunctions.set(functionName, handler);
      } else {
        console.error(
          'Miniapp: Invalid arguments for registerFunction. Requires string and function.',
        );
      }
    },
    unregisterFunction: (functionName) => {
      if (registeredFunctions.has(functionName)) {
        console.log(`Miniapp: Unregistering function '${functionName}'.`);
        registeredFunctions.delete(functionName);
      }
    },
    reportError: (error) => {
      if (error instanceof Error) {
        callHost('reportError', { message: error.message, stack: error.stack });
      } else {
        // Handle cases where something other than an Error object is passed
        callHost('reportError', { message: String(error) });
      }
    },
  };
})();
// --- End of hostApi script ---
