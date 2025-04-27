// src/miniapps/hooks/useMiniappBridge.ts
import {
  cleanupLlmCall,
  handleLlmAbort,
  handleLlmCall,
  handleLlmGetDefaults,
  handleLlmGetModels,
  registerLlmCall,
  StreamCallbacks,
} from '@/lib/miniappLlmService';
import { routeMessageToMiniMcpAtom } from '@/lib/MiniappTransport';
import {
  getAllMiniappDataKeys, // NEW
  getMiniappDataItem, // NEW
  removeMiniappDataItem, // NEW
  saveMiniappConfig,
  setMiniappDataItem, // NEW
} from '@/miniapps/persistence';
import {
  activeMiniappInstancesAtom,
  miniappsConfigAtom,
  miniappsDefinitionAtom,
} from '@/store/miniapp';
import type { MiniappInstance, MiniappPermissions } from '@/types/miniapp'; // Ensure types are imported
import { LlmCallParams } from '@/types/miniapp-dto';
import { JSONRPCMessage } from '@moinfra/mcp-client-sdk/types.js';
import { invoke } from '@tauri-apps/api/core'; // If using Tauri
import Ajv from 'ajv';
import { useAtomValue, useSetAtom } from 'jotai'; // Use useAtomValue for reading atoms in hooks
import { useAtomCallback } from 'jotai/utils';
import { useCallback, useEffect, useRef } from 'react';
import { useMiniappBridgeRegistry } from './useMiniappBridgeRegistry';

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

// Helper function to get definitionId from instanceId (you might already have this)
function getDefinitionIdFromInstanceId(
  instanceId: string,
  instances: MiniappInstance[],
): string | null {
  const instance = instances.find((inst) => inst.instanceId === instanceId);
  return instance?.definitionId ?? null;
}

export function useMiniappBridge(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  instanceId: string,
  // definitionId: string, // We can derive definitionId from instanceId now
) {
  const { registerSendMessage, unregisterSendMessage, getSendMessage } =
    useMiniappBridgeRegistry();

  // Get atoms needed (read-only access here is fine)
  const allDefinitions = useAtomValue(miniappsDefinitionAtom);
  const activeInstances = useAtomValue(activeMiniappInstancesAtom);
  const allConfigs = useAtomValue(miniappsConfigAtom);
  // Note: We'll use useAtomCallback to get other atom values inside processApiRequest

  // Derive the specific definition and config for *this* instance
  // Memoize these lookups for performance if needed, but direct lookup might be fine
  const definitionId = getDefinitionIdFromInstanceId(
    instanceId,
    activeInstances,
  );
  const miniappDefinition = allDefinitions.find(
    (def) => def.id === definitionId,
  );

  // Note: Own config lookup is done within the API handler where needed

  const pendingInterAppRequests = useRef<Map<string, PendingInterAppRequest>>(
    new Map(),
  );

  // Function to send messages TO this specific iframe
  const sendMessageToMiniapp = useCallback(
    (type: string, payload: any, requestId?: string, error?: string) => {
      // Check if iframe and contentWindow still exist before sending
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          { type, payload, requestId, error },
          '*', // Still '*' for srcDoc/blob, ensure origin check in listener
        );
      } else {
        console.warn(
          `Cannot send message to Miniapp Instance ${instanceId} (Def: ${definitionId}). Iframe or contentWindow no longer available.`,
        );
      }
    },
    [iframeRef, instanceId, definitionId], // Include definitionId for logging context
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
        case 'llmGetModels':
        case 'llmGetDefaults':
        case 'llmCall':
        case 'llmAbort': {
          if (!checkPermission('llmAccess', permissions)) {
            // Assuming 'llmAccess' permission
            throw new Error(
              `Permission denied: Miniapp does not have LLM access.`,
            );
          }
          return;
        }
        default:
          console.warn(
            `Host Bridge (${instanceId}): No specific permission check implemented for API: ${apiName}. Denying by default.`,
          );
          throw new Error(
            `Permission denied or check not implemented for API: ${apiName}`,
          );
      }
    },
    [miniappDefinition, instanceId], // Depend on definition and instanceId
  );

  // Helper function to check permissions
  const checkPermission = useCallback(
    (
      permissionType: keyof MiniappPermissions,
      permissions: MiniappPermissions | undefined,
      target?: string, // Optional target (e.g., target miniappId or Tauri command)
    ): boolean => {
      if (!permissions) {
        // Default deny if no permissions object defined for the Miniapp
        console.warn(
          `Permission check failed for '${String(permissionType)}': No permissions defined for Miniapp Definition ${definitionId}`,
        );
        return false;
      }

      const permissionValue = permissions[permissionType];

      if (permissionValue === undefined || permissionValue === null) {
        // If specific permission isn't set, decide on a default
        // Explicitly allow storage by default unless set to false. Deny others by default.
        if (permissionType === 'useStorage') {
          // Check if explicitly set to false, otherwise default allow
          return permissionValue !== false;
        }
        // Default deny for other unset permissions
        return false;
      }

      if (typeof permissionValue === 'boolean') {
        return permissionValue; // true allows all, false denies all
      }

      if (Array.isArray(permissionValue) && target) {
        // Check if the target is in the allowed list
        return permissionValue.includes(target);
      }

      // If format doesn't match expected (e.g., boolean or string[]), deny.
      console.warn(
        `Permission check failed for '${String(permissionType)}': Unexpected format in permissions object for Miniapp Definition ${definitionId}`,
        permissionValue,
      );
      return false;
    },
    [definitionId], // Depend on definitionId for logging
  );

  // API Request Processor Function
  const processApiRequest = useAtomCallback(
    useCallback(
      async (
        get, // Getter provided by useAtomCallback
        set, // Setter provided by useAtomCallback (if needed, e.g., for setting state)
        [apiName, args, requestId]: [string, any, string | undefined], // Args passed as array
      ): Promise<any> => {
        console.log(
          `Host Bridge (${instanceId}): Processing API request '${apiName}' (Miniapp Req ID: ${requestId})`,
          args,
        );
        if (!definitionId)
          throw new Error(
            `Cannot process: Could not determine definition ID for instance ${instanceId}.`,
          );
        // Re-fetch definition inside callback if it could change, or rely on hook's value if stable
        const currentDefinition = get(miniappsDefinitionAtom).find(
          (d) => d.id === definitionId,
        );
        if (!currentDefinition)
          throw new Error(
            `Cannot process: Miniapp definition ${definitionId} not found.`,
          );

        // Permission check (use checkPermission defined within useMiniappBridge or pass permissions)
        checkApiCallPermission(apiName, args); // Assumes checkApiCallPermission is accessible or redefined here

        // --- Process based on API name ---
        switch (apiName) {
          // --- Storage APIs --- (Use definitionId for storage partitioning)
          case 'storageSetItem': {
            const key = args?.key;
            const value = args?.value;
            // Basic validation (persistence layer does more)
            if (typeof key !== 'string' || key.length === 0)
              throw new Error("Invalid 'key' for storageSetItem");
            await setMiniappDataItem(definitionId, key, value);
            return { success: true };
          }
          case 'storageGetItem': {
            const key = args?.key;
            if (typeof key !== 'string' || key.length === 0)
              throw new Error("Invalid 'key' for storageGetItem");
            return await getMiniappDataItem(definitionId, key); // Returns value or undefined
          }
          case 'storageRemoveItem': {
            const key = args?.key;
            if (typeof key !== 'string' || key.length === 0)
              throw new Error("Invalid 'key' for storageRemoveItem");
            await removeMiniappDataItem(definitionId, key);
            return { success: true };
          }
          case 'storageGetAllKeys': {
            return await getAllMiniappDataKeys(definitionId); // Returns string[]
          }

          // --- Config APIs ---
          case 'getOwnConfig': {
            const savedConfig = allConfigs[definitionId] || {};
            const defaults = miniappDefinition?.defaultConfig || {};
            return { ...defaults, ...savedConfig };
          }
          case 'setOwnConfig': {
            const newConfig = args?.config;
            if (typeof newConfig !== 'object' || newConfig === null)
              throw new Error("Invalid 'config' for setOwnConfig");

            // Validate against schema if it exists
            if (
              miniappDefinition?.configSchema &&
              Object.keys(miniappDefinition.configSchema).length > 0
            ) {
              try {
                const validate = ajv.compile(miniappDefinition.configSchema);
                if (!validate(newConfig)) {
                  throw new Error(
                    `Config validation failed: ${ajv.errorsText(validate.errors)}`,
                  );
                }
              } catch (schemaError: any) {
                console.error(
                  `Host Bridge (${instanceId}): Error compiling config schema for validation:`,
                  schemaError,
                );
                throw new Error(
                  `Invalid config schema configured for this Miniapp: ${schemaError.message}`,
                );
              }
            }
            // Save config via persistence function
            await saveMiniappConfig(definitionId, newConfig);
            // NOTE: This does NOT automatically update the `allConfigs` atom value used by this hook instance.
            // The change will be visible on next app load or if the atom is manually updated elsewhere.
            // Consider using `set(miniappsConfigAtom, ...)` here if immediate reflection is needed,
            // but be careful about potential race conditions or performance impacts.
            return { success: true };
          }
          case 'getOwnSchema': {
            return miniappDefinition?.configSchema || {};
          }

          // --- Other APIs ---
          case 'log': {
            console.log(
              `[Miniapp: ${instanceId} | ${miniappDefinition?.name || definitionId}]`,
              ...(Array.isArray(args) ? args : [args]),
            );
            return { success: true }; // Acknowledge log
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
              const targetDefExists = allDefinitions.some(
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
            console.error(
              `[Miniapp Error: ${instanceId} | ${miniappDefinition?.name || definitionId}]`,
              {
                message: message || 'N/A',
                stack: stack || 'N/A',
              },
            );
            return { success: true }; // Acknowledge report
          }
          case 'llmGetModels': {
            // Use the getter passed by useAtomCallback
            return handleLlmGetModels(get);
          }
          case 'llmGetDefaults': {
            return handleLlmGetDefaults(get);
          }
          case 'llmCall': {
            const options: LlmCallParams = args;
            const miniappRequestId = options.requestId;
            if (!miniappRequestId)
              throw new Error("llmCall requires 'requestId'");

            // 1. Register the call and get controller
            const controller = registerLlmCall(miniappRequestId);

            // 2. Define callbacks that use sendMessageToMiniapp
            const callbacks: StreamCallbacks = {
              onChunk: (chunkData) => {
                if (iframeRef.current) {
                  // Check if iframe still exists
                  sendMessageToMiniapp(
                    'llmCallResponseChunk',
                    chunkData,
                    miniappRequestId,
                  );
                } else {
                  controller.abort('Iframe closed during chunk');
                } // Abort if target disappears
              },
              onComplete: (finalResultData) => {
                if (iframeRef.current) {
                  sendMessageToMiniapp(
                    'llmCallResponseFinal',
                    finalResultData,
                    miniappRequestId,
                  );
                }
                cleanupLlmCall(miniappRequestId); // Cleanup on completion
              },
              onError: (error) => {
                if (iframeRef.current) {
                  sendMessageToMiniapp(
                    'llmCallError',
                    error?.message || 'Unknown LLM Error',
                    miniappRequestId,
                  );
                }
                cleanupLlmCall(miniappRequestId); // Cleanup on error
              },
            };

            // 3. Start the call via the service (async, don't await here)
            handleLlmCall(get, options, callbacks, controller.signal).catch(
              (serviceError) => {
                // Catch errors from the service initiation itself (rare)
                console.error(
                  `Miniapp LLM Service initiation failed for ${miniappRequestId}:`,
                  serviceError,
                );
                if (iframeRef.current) {
                  sendMessageToMiniapp(
                    'llmCallError',
                    serviceError?.message || 'LLM Service Error',
                    miniappRequestId,
                  );
                }
                cleanupLlmCall(miniappRequestId); // Ensure cleanup even if start fails
              },
            );

            // 4. Acknowledge the call was initiated (as hostApi.llm.call expects)
            return { success: true, detail: 'LLM call initiated.' };
          }
          case 'llmAbort': {
            const { requestId: miniappRequestIdToAbort } = args;
            if (!miniappRequestIdToAbort)
              throw new Error("llmAbort requires 'requestId'");
            handleLlmAbort(miniappRequestIdToAbort); // Service handles cleanup
            return { success: true, detail: 'Abort request sent.' };
          }
          default: {
            console.error(
              `Host Bridge (${instanceId}): Received unknown API request type: ${apiName}`,
            );
            throw new Error(`Unknown Host API method: ${apiName}`);
          }
        }
      },
      [
        instanceId,
        definitionId,
        // Include checkApiCallPermission if defined outside,
        // or list its own dependencies if defined inside.
        iframeRef, // Needed for callbacks
        sendMessageToMiniapp, // Needed for callbacks
        // No need to list atoms accessed via `get`
      ],
    ),
  );

  // Effect to register/unregister the sendMessage function for *this* instance
  useEffect(() => {
    // Ensure we have an instanceId before registering
    if (instanceId) {
      console.log(
        `useMiniappBridge: Registering sendMessage for ${instanceId} (Def: ${definitionId})`,
      );
      registerSendMessage({ id: instanceId, func: sendMessageToMiniapp });
    } else {
      console.warn(
        'useMiniappBridge: Cannot register sender, instanceId is missing.',
      );
    }

    return () => {
      if (instanceId) {
        console.log(
          `useMiniappBridge: Unregistering sendMessage for ${instanceId} (Def: ${definitionId})`,
        );
        unregisterSendMessage(instanceId);
        // Clean up pending inter-app requests initiated *by this instance*
        // (Keep existing cleanup logic for pendingInterAppRequests)
      }
    };
    // Ensure dependencies are stable
  }, [
    instanceId,
    definitionId,
    registerSendMessage,
    unregisterSendMessage,
    sendMessageToMiniapp,
  ]);

  const routeMessageToMiniMcp = useSetAtom(routeMessageToMiniMcpAtom);
  // Effect to listen for messages FROM this iframe
  useEffect(() => {
    const handleMiniappMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const { type, payload, requestId, error } = event.data;
      let wasRouted = false;
      if (
        type === 'mcpIncomingMessage' &&
        payload &&
        typeof payload.id !== 'undefined'
      ) {
        console.debug(
          `Host Bridge (${instanceId}): Received mcpIncomingMessage for ID ${payload.id}`,
        );
        // Route using the helper, passing the getter
        wasRouted = routeMessageToMiniMcp(
          instanceId,
          payload as JSONRPCMessage,
        );
      }
      if (!wasRouted) {
        if (type === 'apiRequest' && payload?.apiName && requestId) {
          // Trigger the processApiRequest callback
          processApiRequest([payload.apiName, payload.args, requestId])
            .then((result) => {
              if (iframeRef.current) {
                // Check iframe still exists
                sendMessageToMiniapp('apiResponse', result, requestId);
              }
            })
            .catch((err) => {
              console.error(
                `Host Bridge (${instanceId}): Error processing API request '${payload.apiName}' (Req ID: ${requestId}):`,
                err,
              );
              if (iframeRef.current) {
                // Check iframe still exists
                sendMessageToMiniapp(
                  'apiResponse',
                  null,
                  requestId,
                  err?.message || 'Unknown processing error',
                );
              }
            });
        }
        // --- Response from another Miniapp (for inter-app call initiated elsewhere) ---
        else if (
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
        }
        // --- Handle other message types if needed ---
        else if (type) {
          // Ignore known types handled elsewhere (like responses to host calls)
          const knownResponseTypes = [
            'apiResponse',
            'functionResponse',
            'llmCallResponseChunk',
            'llmCallResponseFinal',
            'llmCallError',
            'mcpResponse',
          ];
          if (!knownResponseTypes.includes(type)) {
            console.warn(
              `Host Bridge (${instanceId}): Received unhandled message type from Miniapp: '${type}'`,
              event.data,
            );
          }
        } else {
          console.warn(
            `Host Bridge (${instanceId}): Received malformed message from Miniapp:`,
            event.data,
          );
        }
      }
    };

    window.addEventListener('message', handleMiniappMessage);
    console.log(`Host Bridge (${instanceId}): Message listener added.`);
    return () => {
      window.removeEventListener('message', handleMiniappMessage);
      console.log(`Host Bridge (${instanceId}): Message listener removed.`);
      // Cleanup pending inter-app requests is handled in the registration effect
    };
    // Ensure dependencies are stable
  }, [iframeRef, instanceId, processApiRequest, sendMessageToMiniapp]);

  // This hook primarily sets up the bridge; doesn't need to return anything usually.
}
