// src/miniapps/store/miniappBridge.ts
import { SendMessageFunc } from '@/types'; // Assuming this type definition exists
import { atom, useAtomValue, useSetAtom } from 'jotai';

// Define the core atom to hold the map of active senders
export const activeSendersAtom = atom<Map<string, SendMessageFunc>>(new Map());

// Create derived atoms for each operation
export const bridgeFunctionsAtom = atom(
  (get) => {
    const activeSenders = get(activeSendersAtom);

    return {
      // Getter for retrieving send message functions
      getSendMessage: (id: string): SendMessageFunc | undefined => {
        return activeSenders.get(id);
      },

      // Broadcast function
      broadcastToMiniapps: (eventType: string, payload: any) => {
        const count = activeSenders.size;
        console.log(
          `JotaiBridge: Broadcasting event '${eventType}' to ${count} active Miniapps`,
          payload,
        );
        if (count === 0) {
          return;
        }
        activeSenders.forEach((sendMessage, miniappId) => {
          try {
            // Use 'hostEvent' type for broadcasts from the host
            sendMessage('hostEvent', { eventType, payload });
          } catch (error) {
            console.error(
              `JotaiBridge: Failed to send event '${eventType}' to Miniapp ${miniappId}:`,
              error,
            );
          }
        });
      },
    };
  },
  (
    get,
    set,
    action: {
      type: 'register' | 'unregister';
      id: string;
      func?: SendMessageFunc;
    },
  ) => {
    // 修改 atom 的 actions
    if (action.type === 'register' && action.func) {
      let fn = action.func;
      console.log(`JotaiBridge: Registering sender for ${action.id}`);
      set(activeSendersAtom, (prevMap) => {
        const newMap = new Map(prevMap);
        newMap.set(action.id, fn);
        return newMap;
      });
    } else if (action.type === 'unregister') {
      console.log(`JotaiBridge: Unregistering sender for ${action.id}`);
      set(activeSendersAtom, (prevMap) => {
        const newMap = new Map(prevMap);
        if (newMap.delete(action.id)) {
          return newMap;
        }
        return prevMap; // Return previous map if key didn't exist to avoid unnecessary update
      });
    } else {
      console.error(
        `JotaiBridge: Invalid action type ${action.type} or missing function`,
      );
    }
  },
);

export const registerSendMessageAtom = atom(
  null,
  (get, set, payload: { id: string; func: SendMessageFunc }) => {
    set(bridgeFunctionsAtom, {
      type: 'register',
      id: payload.id,
      func: payload.func,
    });
  },
);

export const unregisterSendMessageAtom = atom(null, (get, set, id: string) => {
  set(bridgeFunctionsAtom, { type: 'unregister', id });
});

export const useMiniappBridgeRegistry = () => {
  const { getSendMessage, broadcastToMiniapps } =
    useAtomValue(bridgeFunctionsAtom);
  const registerSendMessage = useSetAtom(registerSendMessageAtom);
  const unregisterSendMessage = useSetAtom(unregisterSendMessageAtom);

  return {
    registerSendMessage,
    unregisterSendMessage,
    getSendMessage,
    broadcastToMiniapps,
  };
};

export const miniAppRegistryAtom = atom(null, (get, set) => {
  const { getSendMessage, broadcastToMiniapps } = get(bridgeFunctionsAtom);

  const registerSendMessage = (id: string, func: SendMessageFunc) =>
    set(registerSendMessageAtom, { id, func });

  const unregisterSendMessage = (id: string) =>
    set(unregisterSendMessageAtom, id);

  return {
    getSendMessage,
    broadcastToMiniapps,
    registerSendMessage,
    unregisterSendMessage,
  };
});
