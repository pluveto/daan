// src/miniapps/hooks/useMiniappBridge.ts
import {
  getAllMiniappDataKeys,
  getMiniappDataItem,
  removeMiniappDataItem,
  saveMiniappConfig,
  setMiniappDataItem,
} from '@/miniapps/persistence';
import { miniappsConfigAtom, miniappsDefinitionAtom } from '@/store/miniapp';
import { MiniappPermissions } from '@/types';
import { invoke } from '@tauri-apps/api/core';
import Ajv from 'ajv';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useRef } from 'react';

// Type for pending requests from Miniapp to Host
interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}

// Type for pending requests from one Miniapp to another (via Host)
interface PendingInterAppRequest extends PendingRequest {
  sourceMiniappId: string;
  originalRequestId: string | undefined; // The ID from the source Miniapp's request
}

// --- Whitelist for Tauri Commands ---
const ALLOWED_TAURI_COMMANDS_FOR_MINIAPPS: Set<string> = new Set([
  'get_system_info',
]);

// --- AJV Initialization ---
const ajv = new Ajv();

export function useMiniappBridge(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  miniappId: string,
  // Functions to interact with the central registry of active sendMessage functions
  registerSendMessage: (
    id: string,
    sendMessage: (type: string, payload: any, requestId?: string) => void,
  ) => void,
  unregisterSendMessage: (id: string) => void,
  getSendMessage: (
    id: string,
  ) => ((type: string, payload: any, requestId?: string) => void) | undefined,
) {
  const [configs, setConfigs] = useAtom(miniappsConfigAtom);
  const [definitions] = useAtom(miniappsDefinitionAtom); // Get definitions for permissions/schema/defaults

  // Store promises waiting for responses from *this* Miniapp (for inter-app calls)
  const pendingInterAppRequests = useRef<Map<string, PendingInterAppRequest>>(
    new Map(),
  );
  // Store promises waiting for responses from the *Host* API (initiated by this Miniapp)
  // This map actually lives inside the Miniapp's hostApi script.

  // Function to send messages TO this specific iframe
  const sendMessageToMiniapp = useCallback(
    (type: string, payload: any, requestId?: string, error?: string) => {
      if (iframeRef.current?.contentWindow) {
        // IMPORTANT: Replace '*' with the specific origin if possible, although tricky with srcdoc/blob URLs.
        // For srcdoc, the origin is often the host's origin. For blobs, it's unique. '*' is common but less secure.
        // Consider checking the origin in the iframe's message listener as well.
        iframeRef.current.contentWindow.postMessage(
          { type, payload, requestId, error },
          '*',
        );
      } else {
        console.warn(
          `Cannot send message to Miniapp ${miniappId}, contentWindow not available.`,
        );
      }
    },
    [iframeRef, miniappId],
  );

  const checkApiCallPermission = useCallback(
    (apiName: string, args: any, sourceMiniappId: string) => {
      const sourceDefinition = definitions.find(
        (def) => def.id === sourceMiniappId,
      );
      const permissions = sourceDefinition?.permissions;

      // API calls that generally don't need specific permissions (can be called by any active miniapp)
      const noCheckNeeded = [
        'getOwnConfig',
        'setOwnConfig',
        'getOwnSchema',
        'log',
        'reportError',
      ];
      if (noCheckNeeded.includes(apiName)) {
        return; // Permission granted implicitly
      }

      // API calls requiring storage permission
      const storageApis = [
        'storageSetItem',
        'storageGetItem',
        'storageRemoveItem',
        'storageGetAllKeys',
      ];
      if (storageApis.includes(apiName)) {
        if (!checkPermission('useStorage', permissions)) {
          throw new Error(
            'Permission denied: Miniapp does not have storage access.',
          );
        }
        return;
      }

      // API calls requiring specific target permissions
      switch (apiName) {
        case 'getConfig': {
          const targetId = args?.miniappId;
          if (!targetId || typeof targetId !== 'string')
            throw new Error('Invalid arguments for getConfig');
          if (!checkPermission('readConfig', permissions, targetId)) {
            throw new Error(
              `Permission denied: Cannot read config of Miniapp '${targetId}'.`,
            );
          }
          return;
        }
        case 'callMiniapp': {
          const targetId = args?.targetId;
          if (!targetId || typeof targetId !== 'string')
            throw new Error('Invalid arguments for callMiniapp');
          if (!checkPermission('callMiniapp', permissions, targetId)) {
            throw new Error(
              `Permission denied: Cannot call Miniapp '${targetId}'.`,
            );
          }
          return;
        }
        case 'invokeTauri': {
          const command = args?.command;
          if (!command || typeof command !== 'string')
            throw new Error('Invalid arguments for invokeTauri');
          if (!checkPermission('allowedTauriCommands', permissions, command)) {
            throw new Error(
              `Permission denied: Tauri command '${command}' is not allowed.`,
            );
          }
          // Also check against the global hardcoded allow list for extra safety
          if (!ALLOWED_TAURI_COMMANDS_FOR_MINIAPPS.has(command)) {
            console.warn(
              `Host Bridge (${sourceMiniappId}): Blocked disallowed Tauri command '${command}' (Global List Check)`,
            );
            throw new Error(`Tauri command '${command}' is not allowed.`);
          }
          return;
        }
        default:
          // If we reach here, it's an unknown API or one missed in the checks
          throw new Error(
            `Permission check not implemented or failed for unknown API: ${apiName}`,
          );
      }
    },
    [definitions],
  ); // Depends on definitions
  // API Request Processor Function (called when message received FROM iframe)

  const processApiRequest = useCallback(
    async (
      apiName: string,
      args: any,
      requestId: string | undefined,
      sourceMiniappId: string,
    ): Promise<any> => {
      console.log(
        `Host Bridge (<span class="math-inline">\{sourceMiniappId\}\)\: Processing API request '</span>{apiName}'`,
        args,
      );
      const sourceDefinition = definitions.find(
        (def) => def.id === sourceMiniappId,
      );
      checkApiCallPermission(apiName, args, sourceMiniappId);

      switch (apiName) {
        // --- NEW Storage APIs ---
        case 'storageSetItem': {
          const key = args?.key;
          const value = args?.value; // Value can be anything structured-clonable
          if (typeof key !== 'string' || key.length === 0) {
            throw new Error(
              "Invalid 'key' argument for storageSetItem. Must be a non-empty string.",
            );
          }
          // Value validation could be added here if needed (e.g., size limits)
          await setMiniappDataItem(sourceMiniappId, key, value);
          return { success: true };
        }
        case 'storageGetItem': {
          const key = args?.key;
          if (typeof key !== 'string' || key.length === 0) {
            throw new Error(
              "Invalid 'key' argument for storageGetItem. Must be a non-empty string.",
            );
          }
          const value = await getMiniappDataItem(sourceMiniappId, key);
          return value; // Returns the value or undefined
        }
        case 'storageRemoveItem': {
          const key = args?.key;
          if (typeof key !== 'string' || key.length === 0) {
            throw new Error(
              "Invalid 'key' argument for storageRemoveItem. Must be a non-empty string.",
            );
          }
          await removeMiniappDataItem(sourceMiniappId, key);
          return { success: true };
        }
        case 'storageGetAllKeys': {
          const keys = await getAllMiniappDataKeys(sourceMiniappId);
          return keys;
        }
        // --- End Storage APIs ---
        case 'getOwnConfig': {
          const savedConfig = configs[sourceMiniappId] || {};
          const defaults = sourceDefinition?.defaultConfig || {};
          return { ...defaults, ...savedConfig };
        }
        case 'getConfig': {
          const targetId = args?.miniappId;
          if (!targetId || typeof targetId !== 'string') {
            throw new Error(
              "Missing or invalid 'miniappId' argument for getConfig",
            );
          }
          // SECURITY CHECK (Example): Only allow accessing dependencies' config? Or global read?
          // const sourceDef = definitions.find(d => d.id === sourceMiniappId); // Need definitions atom access
          // if (!sourceDef?.dependencies?.includes(targetId)) {
          //   throw new Error(`Miniapp ${sourceMiniappId} cannot access config of ${targetId}`);
          // }
          console.log(
            `Host Bridge (${sourceMiniappId}): Reading config for ${targetId}`,
          );
          return configs[targetId] || {}; // Return target config or default
        }
        case 'setOwnConfig': {
          const newConfig = args?.config;
          if (typeof newConfig !== 'object' || newConfig === null)
            throw new Error("Invalid 'config'");
          if (sourceDefinition?.configSchema) {
            try {
              const validate = ajv.compile(sourceDefinition.configSchema);
              if (!validate(newConfig))
                throw new Error(
                  `Config validation failed: ${ajv.errorsText(validate.errors)}`,
                );
            } catch (schemaError: any) {
              throw new Error(`Invalid config schema: ${schemaError.message}`);
            }
          }
          setConfigs((prev) => ({ ...prev, [sourceMiniappId]: newConfig }));
          saveMiniappConfig(sourceMiniappId, newConfig); // Fire and forget persistence
          return { success: true };
        }
        case 'getOwnSchema': {
          return sourceDefinition?.configSchema || {};
        }
        case 'log': {
          // Use console.log in the host for debugging Miniapp messages
          console.log(
            `[Miniapp: ${sourceMiniappId}]`,
            ...(Array.isArray(args) ? args : [args]),
          );
          return true; // Acknowledge
        }
        case 'callMiniapp': {
          const { targetId, functionName, args: callArgs } = args;

          if (
            !targetId ||
            typeof targetId !== 'string' ||
            !functionName ||
            typeof functionName !== 'string'
          ) {
            throw new Error(
              'Invalid arguments for callMiniapp. Requires targetId, functionName.',
            );
          }

          // Find the sendMessage function for the target Miniapp
          const targetSendMessage = getSendMessage(targetId);

          if (!targetSendMessage) {
            // Check if the target Miniapp is defined but just not active
            // const allDefinitions = get(miniappsDefinitionAtom); // Need access if checking definitions
            // if (allDefinitions.some(def => def.id === targetId)) {
            //    throw new Error(`Target Miniapp '${targetId}' is defined but not currently active.`);
            // } else {
            throw new Error(
              `Target Miniapp '${targetId}' not found or not active.`,
            );
            // }
          }

          // Generate a unique ID for this inter-app request
          const interAppRequestId = `interApp_${sourceMiniappId.substring(0, 4)}-><span class="math-inline">\{targetId\.substring\(0,4\)\}\_</span>{Date.now()}`;
          console.log(
            `Host Bridge (<span class="math-inline">\{sourceMiniappId\}\)\: Relaying call '</span>{functionName}' to ${targetId} (ReqID: ${interAppRequestId})`,
          );

          // Return a promise that will be resolved/rejected when the target responds
          return new Promise((resolve, reject) => {
            // Store the resolve/reject functions along with original request info
            pendingInterAppRequests.current.set(interAppRequestId, {
              resolve,
              reject,
              sourceMiniappId: sourceMiniappId,
              originalRequestId: requestId, // The ID from the initial callHost in the source miniapp
            });

            // Send the 'executeFunction' request to the target Miniapp
            targetSendMessage(
              'executeFunction',
              { functionName, args: callArgs },
              interAppRequestId,
            );

            // Set a timeout for the inter-app call
            setTimeout(() => {
              if (pendingInterAppRequests.current.has(interAppRequestId)) {
                console.warn(
                  `Host Bridge: Inter-app call ${interAppRequestId} timed out.`,
                );
                pendingInterAppRequests.current
                  .get(interAppRequestId)
                  ?.reject(
                    new Error(`Call to Miniapp '${targetId}' timed out.`),
                  );
                pendingInterAppRequests.current.delete(interAppRequestId);
              }
            }, 15000); // 15 second timeout
          });
        }
        case 'invokeTauri': {
          // 1. Check if running in Tauri environment
          // Use optional chaining for safety, though __TAURI__ is usually defined globally or not at all
          if (!window?.__TAURI__) {
            throw new Error('Tauri API is not available in this environment.');
          }

          const { command, args: commandArgs } = args || {}; // Extract command and its arguments

          // 2. Validate command argument
          if (!command || typeof command !== 'string') {
            throw new Error(
              "Invalid or missing 'command' argument for invokeTauri.",
            );
          }

          // 3. SECURITY CHECK: Allow-list
          if (!ALLOWED_TAURI_COMMANDS_FOR_MINIAPPS.has(command)) {
            console.warn(
              `Host Bridge (<span class="math-inline">\{sourceMiniappId\}\)\: Blocked disallowed Tauri command '</span>{command}'`,
            );
            throw new Error(
              `Tauri command '${command}' is not allowed for Miniapps.`,
            );
          }

          console.log(
            `Host Bridge (<span class="math-inline">\{sourceMiniappId\}\)\: Invoking Tauri command '</span>{command}' with args:`,
            commandArgs,
          );
          try {
            // 4. Invoke the Tauri command
            // Pass arguments object. If commandArgs is null/undefined, pass empty object or handle as needed by command.
            const result = await invoke(command, commandArgs || {});
            console.log(
              `Host Bridge (<span class="math-inline">\{sourceMiniappId\}\)\: Tauri command '</span>{command}' result:`,
              result,
            );
            // 5. Return the result
            return result;
          } catch (error: any) {
            // 6. Handle errors during invocation
            console.error(
              `Host Bridge (<span class="math-inline">\{sourceMiniappId\}\)\: Error invoking Tauri command '</span>{command}':`,
              error,
            );
            // Try to return a meaningful error message
            let errorMessage = `Tauri command '${command}' failed.`;
            if (error instanceof Error) {
              errorMessage += ` Error: ${error.message}`;
            } else if (typeof error === 'string') {
              errorMessage += ` Error: ${error}`;
            }
            throw new Error(errorMessage);
          }
        }
        // --- Error Reporting API ---
        case 'reportError': {
          const { message, stack } = args || {};
          console.error(`[Miniapp Error: ${sourceMiniappId}]`, {
            message: message || 'No message provided',
            stack: stack || 'No stack trace provided',
          });
          // Optional: Send to a logging service or display in a Host debug panel
          return { success: true }; // Acknowledge receipt
        }
        // End invokeTauri case
        default: {
          console.error(
            `Host Bridge (${sourceMiniappId}): Unknown API method requested: ${apiName}`,
          );
          throw new Error(`Unknown Host API method: ${apiName}`);
        }
      }
    },
    [configs, setConfigs, definitions, getSendMessage, checkApiCallPermission],
  );

  // Effect to listen for messages FROM this iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // SECURITY: Basic check - is the message source our iframe's contentWindow?
      if (event.source !== iframeRef.current?.contentWindow) {
        // console.warn("Host Bridge: Ignoring message from unexpected source", event.source, iframeRef.current?.contentWindow);
        return;
      }
      // SECURITY: Origin check - uncomment and adapt if using blob URLs or known origins
      // if (event.origin !== 'expected-origin-for-iframes') {
      //   console.warn(`Host Bridge (${miniappId}): Ignored message from unexpected origin: ${event.origin}`);
      //   return;
      // }

      const { type, payload, requestId, error } = event.data;

      // Message from Miniapp requesting a Host API call
      if (type === 'apiRequest' && payload?.apiName) {
        processApiRequest(payload.apiName, payload.args, requestId, miniappId)
          .then((result) => {
            // Send success response back to Miniapp
            sendMessageToMiniapp('apiResponse', result, requestId);
          })
          .catch((err) => {
            // Send error response back to Miniapp
            console.error(
              `Host Bridge (<span class="math-inline">\{miniappId\}\)\: Error processing API request '</span>{payload.apiName}':`,
              err,
            );
            sendMessageToMiniapp(
              'apiResponse',
              null,
              requestId,
              err.message || 'An unknown error occurred',
            );
          });
      }
      // Message from Miniapp responding to an 'executeFunction' call (inter-app comms)
      else if (
        type === 'functionResponse' &&
        requestId &&
        pendingInterAppRequests.current.has(requestId)
      ) {
        const promiseFuncs = pendingInterAppRequests.current.get(requestId);
        if (promiseFuncs) {
          console.log(
            `Host Bridge: Received response for inter-app call ${requestId}`,
            payload,
            error,
          );
          if (error) {
            promiseFuncs.reject(new Error(error));
          } else {
            promiseFuncs.resolve(payload);
          }
          pendingInterAppRequests.current.delete(requestId); // Clean up
        }
      }
      // Handle other message types if needed
      else {
        console.warn(
          `Host Bridge (${miniappId}): Received unknown message type or format:`,
          event.data,
        );
      }
    };

    window.addEventListener('message', handleMessage);
    console.log(`Host Bridge (${miniappId}): Message listener added.`);

    // Cleanup listener on unmount
    return () => {
      window.removeEventListener('message', handleMessage);
      console.log(`Host Bridge (${miniappId}): Message listener removed.`);
      // Clean up any pending requests for this disappearing miniapp
      pendingInterAppRequests.current.forEach((req, reqId) => {
        req.reject(new Error(`Miniapp ${miniappId} unloaded.`));
        pendingInterAppRequests.current.delete(reqId);
      });
    };
  }, [iframeRef, miniappId, processApiRequest, sendMessageToMiniapp]); // Dependencies

  // Return the function needed by the Runner component
  return { sendMessageToMiniapp };
}

// Helper function to check permissions
function checkPermission(
  permissionType: keyof MiniappPermissions,
  permissions: MiniappPermissions | undefined,
  target?: string, // Optional target (e.g., target miniappId or Tauri command)
): boolean {
  if (!permissions) return false; // Default deny if no permissions object

  const permissionValue = permissions[permissionType];

  if (permissionValue === undefined || permissionValue === null) {
    // If specific permission isn't set, decide on a default (e.g., deny)
    // Exception: maybe default 'useStorage' to true?
    if (permissionType === 'useStorage') return true; // Example: Allow storage by default
    return false; // Default deny for others
  }

  if (typeof permissionValue === 'boolean') {
    return permissionValue; // true allows all, false denies all
  }

  if (Array.isArray(permissionValue) && target) {
    // Check if the target is in the allowed list
    return permissionValue.includes(target);
  }

  // If format doesn't match expected (e.g., boolean or string[]), deny.
  return false;
}
