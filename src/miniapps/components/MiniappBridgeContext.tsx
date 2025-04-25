// src/miniapps/components/MiniappBridgeContext.tsx
import { MiniappBridgeRegistry, SendMessageFunc } from '@/types';
import React, { createContext, useCallback, useContext, useRef } from 'react';

const MiniappBridgeContext = createContext<MiniappBridgeRegistry | null>(null);

export const useMiniappBridgeContext = () => {
  const context = useContext(MiniappBridgeContext);
  if (!context) {
    throw new Error(
      'useMiniappBridgeContext must be used within a MiniappBridgeProvider',
    );
  }
  return context;
};

interface MiniappBridgeProviderProps {
  children: React.ReactNode;
}

export const MiniappBridgeProvider: React.FC<MiniappBridgeProviderProps> = ({
  children,
}) => {
  // Central registry for active Miniapp sendMessage functions
  const activeSenders = useRef<Map<string, SendMessageFunc>>(new Map());

  const registerSendMessage = useCallback(
    (id: string, func: SendMessageFunc) => {
      console.log(`BridgeContext: Registering sender for ${id}`);
      activeSenders.current.set(id, func);
    },
    [],
  );

  const unregisterSendMessage = useCallback((id: string) => {
    console.log(`BridgeContext: Unregistering sender for ${id}`);
    activeSenders.current.delete(id);
  }, []);

  const getSendMessage = useCallback(
    (id: string): SendMessageFunc | undefined => {
      return activeSenders.current.get(id);
    },
    [],
  );

  const broadcastToMiniapps = useCallback((eventType: string, payload: any) => {
    const count = activeSenders.current.size;
    console.log(
      `BridgeContext: Broadcasting event '${eventType}' to ${count} active Miniapps`,
      payload,
    );
    if (count === 0) {
      // Optional: toast.info('Broadcast skipped: No active Miniapps.');
      return;
    }
    activeSenders.current.forEach((sendMessage, miniappId) => {
      try {
        // Use 'hostEvent' type for broadcasts from the host
        sendMessage('hostEvent', { eventType, payload });
      } catch (error) {
        console.error(
          `BridgeContext: Failed to send event '${eventType}' to Miniapp ${miniappId}:`,
          error,
        );
      }
    });
    // Optional: toast.info(`Event '${eventType}' broadcasted to ${count} Miniapp(s).`);
  }, []);

  // Example: Set up global broadcast for debugging in console
  React.useEffect(() => {
    (window as any).miniappBroadcast = broadcastToMiniapps;
    console.log(
      "Miniapp Broadcast function available as 'miniappBroadcast' in console.",
    );
    return () => {
      delete (window as any).miniappBroadcast;
    };
  }, [broadcastToMiniapps]);

  const value = {
    registerSendMessage,
    unregisterSendMessage,
    getSendMessage,
    broadcastToMiniapps,
  };

  return (
    <MiniappBridgeContext.Provider value={value}>
      {children}
    </MiniappBridgeContext.Provider>
  );
};
