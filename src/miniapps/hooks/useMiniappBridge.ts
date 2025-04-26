// src/miniapps/hooks/useMiniappBridge.ts
import {
  getAllMiniappDataKeys,
  getMiniappDataItem,
  removeMiniappDataItem,
  saveMiniappConfig,
  setMiniappDataItem,
} from '@/miniapps/persistence';
import {
  activeMiniappInstancesAtom,
  miniappsConfigAtom,
  miniappsDefinitionAtom,
} from '@/store/miniapp';
import { MiniappPermissions } from '@/types';
import { invoke } from '@tauri-apps/api/core';
import Ajv from 'ajv';
import { useAtomValue } from 'jotai';
import { useCallback, useEffect, useRef } from 'react';
import { useMiniappBridgeContext } from '../components/MiniappBridgeContext';

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
  instanceId: string, // Use the unique instance ID
  definitionId: string, // Keep definition ID for config/schema lookup
) {
  const {
    registerSendMessage,
    unregisterSendMessage,
    getSendMessage,
    // broadcastToMiniapps, // Not directly used by the bridge logic itself
  } = useMiniappBridgeContext(); // Get functions from context

  // Note: We don't use setConfigs here anymore, config saving happens via persistence
  const configs = useAtomValue(miniappsConfigAtom);
  const definitions = useAtomValue(miniappsDefinitionAtom);

  // Store promises waiting for responses from *this* Miniapp (for inter-app calls)
  const pendingInterAppRequests = useRef<Map<string, PendingInterAppRequest>>(
    new Map(),
  );

  // Get the specific definition for this instance
  const miniappDefinition = definitions.find((def) => def.id === definitionId);
  const activeInstances = useAtomValue(activeMiniappInstancesAtom); // Need jotai get() if inside atom write, or useAtomValue otherwise

  // Function to send messages TO this specific iframe
  const sendMessageToMiniapp = useCallback(
    (type: string, payload: any, requestId?: string, error?: string) => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          { type, payload, requestId, error },
          '*', // Still '*' for srcDoc/blob, ensure origin check in listener
        );
      } else {
        console.warn(
          `Cannot send message to Miniapp Instance ${instanceId}, contentWindow not available.`,
        );
      }
    },
    [iframeRef, instanceId], // Depend on instanceId for logging
  );

  // Permission Checking Logic (remains largely the same, uses miniappDefinition)
  const checkApiCallPermission = useCallback(
    (apiName: string, args: any) => {
      // Removed sourceMiniappId, it's always 'this' miniapp
      const permissions = miniappDefinition?.permissions;

      const noCheckNeeded = [
        'getOwnConfig',
        'setOwnConfig',
        'getOwnSchema',
        'log',
        'reportError',
      ];
      if (noCheckNeeded.includes(apiName)) return;

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

      switch (apiName) {
        case 'getConfig': {
          const targetId = args?.miniappId; // target definition ID
          if (!targetId || typeof targetId !== 'string')
            throw new Error('Invalid arguments for getConfig');
          if (!checkPermission('readConfig', permissions, targetId)) {
            throw new Error(
              `Permission denied: Cannot read config of Miniapp Definition '${targetId}'.`,
            );
          }
          return;
        }
        case 'callMiniapp': {
          const targetId = args?.targetId; // target definition ID
          if (!targetId || typeof targetId !== 'string')
            throw new Error('Invalid arguments for callMiniapp');
          if (!checkPermission('callMiniapp', permissions, targetId)) {
            throw new Error(
              `Permission denied: Cannot call Miniapp Definition '${targetId}'.`,
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
          if (!ALLOWED_TAURI_COMMANDS_FOR_MINIAPPS.has(command)) {
            console.warn(
              `Host Bridge (${instanceId}): Blocked disallowed Tauri command '${command}' (Global List Check)`,
            );
            throw new Error(`Tauri command '${command}' is not allowed.`);
          }
          return;
        }
        default:
          throw new Error(
            `Permission check not implemented or failed for API: ${apiName}`,
          );
      }
    },
    [miniappDefinition, instanceId], // Depend on definition and instanceId
  );

  // API Request Processor Function
  const processApiRequest = useCallback(
    async (
      apiName: string,
      args: any,
      requestId: string | undefined,
      // sourceMiniappId: string, // No longer needed, it's always 'this' instance
    ): Promise<any> => {
      console.log(
        `Host Bridge (${instanceId}): Processing API request '${apiName}'`,
        args,
      );
      // Use the definition associated with this hook instance
      const sourceDefinition = miniappDefinition;

      // Check permissions for *this* miniapp instance
      checkApiCallPermission(apiName, args);

      switch (apiName) {
        // --- Storage APIs --- (Use definitionId for storage partitioning)
        case 'storageSetItem': {
          const key = args?.key;
          const value = args?.value;
          if (typeof key !== 'string' || key.length === 0)
            throw new Error("Invalid 'key'");
          await setMiniappDataItem(definitionId, key, value); // Use definitionId
          return { success: true };
        }
        case 'storageGetItem': {
          const key = args?.key;
          if (typeof key !== 'string' || key.length === 0)
            throw new Error("Invalid 'key'");
          return await getMiniappDataItem(definitionId, key); // Use definitionId
        }
        case 'storageRemoveItem': {
          const key = args?.key;
          if (typeof key !== 'string' || key.length === 0)
            throw new Error("Invalid 'key'");
          await removeMiniappDataItem(definitionId, key); // Use definitionId
          return { success: true };
        }
        case 'storageGetAllKeys': {
          return await getAllMiniappDataKeys(definitionId); // Use definitionId
        }
        // --- Config APIs --- (Use definitionId for config lookup/saving)
        case 'getOwnConfig': {
          const savedConfig = configs[definitionId] || {};
          const defaults = sourceDefinition?.defaultConfig || {};
          return { ...defaults, ...savedConfig };
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
          // Save config via persistence function (don't update atom directly)
          await saveMiniappConfig(definitionId, newConfig); // Fire and forget persistence
          // TODO: Consider if the configsAtom *should* be updated here for immediate reflection in other parts of the UI that might read it.
          // setConfigs(prev => ({ ...prev, [definitionId]: newConfig })); // Optionally update atom
          return { success: true };
        }
        case 'getOwnSchema': {
          return sourceDefinition?.configSchema || {};
        }
        // --- Other APIs ---
        case 'getConfig': {
          // Get config of *another* miniapp definition
          const targetDefinitionId = args?.miniappId;
          if (!targetDefinitionId || typeof targetDefinitionId !== 'string')
            throw new Error("Missing 'miniappId'");
          console.log(
            `Host Bridge (${instanceId}): Reading config for definition ${targetDefinitionId}`,
          );
          const targetDefinition = definitions.find(
            (d) => d.id === targetDefinitionId,
          );
          const savedConfig = configs[targetDefinitionId] || {};
          const defaults = targetDefinition?.defaultConfig || {};
          return { ...defaults, ...savedConfig }; // Return target config merged with defaults
        }
        case 'log': {
          console.log(
            `[Miniapp: ${instanceId}]`,
            ...(Array.isArray(args) ? args : [args]),
          );
          return true;
        }
        case 'callMiniapp': {
          const {
            targetId: targetDefinitionId,
            functionName,
            args: callArgs,
          } = args;

          if (
            !targetDefinitionId ||
            typeof targetDefinitionId !== 'string' ||
            !functionName ||
            typeof functionName !== 'string'
          ) {
            throw new Error('Invalid args for callMiniapp.');
          }

          // Find *any* running instance of the target definition
          const targetInstance = activeInstances.find(
            (inst) => inst.definitionId === targetDefinitionId,
          );

          if (!targetInstance) {
            // Check if definition exists but no instance is running
            const targetDefExists = definitions.some(
              (def) => def.id === targetDefinitionId,
            );
            if (targetDefExists) {
              throw new Error(
                `Target Miniapp Definition '${targetDefinitionId}' exists but has no active instance.`,
              );
            } else {
              throw new Error(
                `Target Miniapp Definition '${targetDefinitionId}' not found.`,
              );
            }
          }

          const targetSendMessage = getSendMessage(targetInstance.instanceId); // Use the INSTANCE ID to get the sender

          if (!targetSendMessage) {
            throw new Error(
              `Could not find sendMessage function for active instance '${targetInstance.instanceId}' of definition '${targetDefinitionId}'. Bridge registry issue?`,
            );
          }

          const interAppRequestId = `interApp_${instanceId.substring(17, 21)}->${targetInstance.instanceId.substring(17, 21)}_${Date.now()}`; // Use instance IDs
          console.log(
            `Host Bridge (${instanceId}): Relaying call '${functionName}' to Instance ${targetInstance.instanceId} (Def: ${targetDefinitionId}, ReqID: ${interAppRequestId})`,
          );

          return new Promise((resolve, reject) => {
            pendingInterAppRequests.current.set(interAppRequestId, {
              resolve,
              reject,
              sourceMiniappId: instanceId, // Source is this instance
              originalRequestId: requestId,
            });

            targetSendMessage(
              'executeFunction',
              { functionName, args: callArgs },
              interAppRequestId,
            );

            setTimeout(() => {
              if (pendingInterAppRequests.current.has(interAppRequestId)) {
                const reqInfo =
                  pendingInterAppRequests.current.get(interAppRequestId);
                reqInfo?.reject(
                  new Error(
                    `Call to Instance '${targetInstance.instanceId}' (Def: '${targetDefinitionId}') timed out.`,
                  ),
                );
                pendingInterAppRequests.current.delete(interAppRequestId);
              }
            }, 15000); // Timeout
          });
        }
        case 'invokeTauri': {
          if (!window?.__TAURI__) throw new Error('Tauri API not available.');
          const { command, args: commandArgs } = args || {};
          if (!command || typeof command !== 'string')
            throw new Error("Invalid 'command'");

          // Permission check already done by checkApiCallPermission

          console.log(
            `Host Bridge (${instanceId}): Invoking Tauri command '${command}'`,
            commandArgs,
          );
          try {
            const result = await invoke(command, commandArgs || {});
            console.log(
              `Host Bridge (${instanceId}): Tauri command '${command}' result:`,
              result,
            );
            return result;
          } catch (error: any) {
            console.error(
              `Host Bridge (${instanceId}): Error invoking Tauri command '${command}':`,
              error,
            );
            throw new Error(
              `Tauri command '${command}' failed: ${error.message || error}`,
            );
          }
        }
        case 'reportError': {
          const { message, stack } = args || {};
          console.error(`[Miniapp Error: ${instanceId}]`, {
            message: message || 'N/A',
            stack: stack || 'N/A',
          });
          return { success: true };
        }
        default: {
          throw new Error(`Unknown Host API method: ${apiName}`);
        }
      }
    },
    [
      configs,
      definitions,
      miniappDefinition,
      instanceId,
      definitionId, // Needed for storage/config keys
      checkApiCallPermission, // Uses definition
      getSendMessage, // From context
      iframeRef, // For sendMessageToMiniapp
      // getAtomValue // Required if used inside useCallback
    ],
  );

  // Effect to register/unregister the sendMessage function for *this* instance
  useEffect(() => {
    console.log(`useMiniappBridge: Registering sendMessage for ${instanceId}`);
    registerSendMessage(instanceId, sendMessageToMiniapp);

    return () => {
      console.log(
        `useMiniappBridge: Unregistering sendMessage for ${instanceId}`,
      );
      unregisterSendMessage(instanceId);
      // Clean up pending inter-app requests initiated *by this instance*
      pendingInterAppRequests.current.forEach((req, reqId) => {
        if (req.sourceMiniappId === instanceId) {
          req.reject(new Error(`Source Miniapp ${instanceId} unloaded.`));
          pendingInterAppRequests.current.delete(reqId);
        }
      });
    };
  }, [
    instanceId,
    registerSendMessage,
    unregisterSendMessage,
    sendMessageToMiniapp,
  ]);

  // Effect to listen for messages FROM this iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      // Optional: Origin check
      // if (event.origin !== 'expected-origin') return;

      const { type, payload, requestId, error } = event.data;

      if (type === 'apiRequest' && payload?.apiName) {
        // Process API request FROM this miniapp
        processApiRequest(payload.apiName, payload.args, requestId)
          .then((result) => {
            sendMessageToMiniapp('apiResponse', result, requestId);
          })
          .catch((err) => {
            console.error(
              `Host Bridge (${instanceId}): Error processing API request '${payload.apiName}':`,
              err,
            );
            sendMessageToMiniapp(
              'apiResponse',
              null,
              requestId,
              err.message || 'Unknown error',
            );
          });
      } else if (
        type === 'functionResponse' &&
        requestId &&
        pendingInterAppRequests.current.has(requestId)
      ) {
        // Process a response TO an inter-app call *initiated by another miniapp* targeting this one
        const promiseFuncs = pendingInterAppRequests.current.get(requestId);
        if (promiseFuncs) {
          console.log(
            `Host Bridge (${instanceId}): Received response for inter-app call ${requestId}`,
            payload,
            error,
          );
          if (error) {
            promiseFuncs.reject(new Error(error));
          } else {
            promiseFuncs.resolve(payload);
          }
          pendingInterAppRequests.current.delete(requestId);
        }
      } else {
        console.warn(
          `Host Bridge (${instanceId}): Received unknown message type or format:`,
          event.data,
        );
      }
    };

    window.addEventListener('message', handleMessage);
    console.log(`Host Bridge (${instanceId}): Message listener added.`);
    return () => {
      window.removeEventListener('message', handleMessage);
      console.log(`Host Bridge (${instanceId}): Message listener removed.`);
      // No need to clean up pendingInterAppRequests here, done in registration cleanup
    };
  }, [iframeRef, instanceId, processApiRequest, sendMessageToMiniapp]);

  // Return the function to send messages *to* this miniapp (might not be needed externally)
  // The primary purpose of this hook is now setting up the listener and registering the sender.
  // return { sendMessageToMiniapp }; // Can be removed if not used by the caller component
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
