// src/miniapps/components/MiniappRuntimePanel.tsx
import { Button } from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs'; // Keep TabsList for navigation UI
import { MiniappRunner } from '@/miniapps/components/MiniappRunner'; // Adjust path
import {
  activeMiniappInstancesAtom,
  miniappsDefinitionAtom,
} from '@/store/miniapp';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

type SendMessageFunc = (
  type: string,
  payload: any,
  requestId?: string,
  error?: string,
) => void;

export function MiniappRuntimePanel() {
  const [activeInstances] = useAtom(activeMiniappInstancesAtom);
  const [definitions] = useAtom(miniappsDefinitionAtom);
  const [selectedTab, setSelectedTab] = useState<string | undefined>(undefined);

  // Central registry for active Miniapp sendMessage functions
  const activeSenders = useRef<Map<string, SendMessageFunc>>(new Map());

  const registerSendMessage = useCallback(
    (id: string, func: SendMessageFunc) => {
      console.log(`RuntimePanel: Registering sender for ${id}`);
      activeSenders.current.set(id, func);
    },
    [],
  );

  const unregisterSendMessage = useCallback((id: string) => {
    console.log(`RuntimePanel: Unregistering sender for ${id}`);
    activeSenders.current.delete(id);
  }, []);

  const getSendMessage = useCallback(
    (id: string): SendMessageFunc | undefined => {
      return activeSenders.current.get(id);
    },
    [],
  );

  // --- Event Bus Function ---
  const broadcastToMiniapps = useCallback((eventType: string, payload: any) => {
    console.log(
      `RuntimePanel: Broadcasting event '${eventType}' to ${activeSenders.current.size} active Miniapps`,
      payload,
    );
    if (activeSenders.current.size === 0) {
      toast.info('Broadcast skipped: No active Miniapps.');
      return;
    }
    activeSenders.current.forEach((sendMessage, miniappId) => {
      try {
        sendMessage('hostEvent', { eventType, payload });
      } catch (error) {
        console.error(
          `RuntimePanel: Failed to send event '${eventType}' to Miniapp ${miniappId}:`,
          error,
        );
      }
    });
    toast.info(
      `Event '${eventType}' broadcasted to ${activeSenders.current.size} Miniapp(s).`,
    );
  }, []);

  // Filter active definitions (unchanged)
  const activeDefinitions = definitions.filter((def) => activeIds.has(def.id));

  // Update selected tab logic (unchanged)
  useEffect(() => {
    if (activeDefinitions.length === 0) {
      setSelectedTab(undefined);
      return;
    }
    const selectedAppIsActive =
      selectedTab && activeDefinitions.some((def) => def.id === selectedTab);
    if (!selectedAppIsActive && activeDefinitions.length > 0) {
      // Ensure there's at least one active def
      setSelectedTab(activeDefinitions[0]?.id);
    }
  }, [activeIds, activeDefinitions, selectedTab]); // Rerun when active apps change or definitions load

  // Debugging broadcast setup (unchanged)
  useEffect(() => {
    (window as any).miniappBroadcast = broadcastToMiniapps;
    return () => {
      delete (window as any).miniappBroadcast;
    };
  }, [broadcastToMiniapps]);

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-2 flex flex-shrink-0 items-center justify-between">
        <h2 className="text-lg font-semibold">Active Miniapps</h2>
      </div>

      {activeDefinitions.length === 0 ? (
        <div className="text-muted-foreground flex flex-grow items-center justify-center">
          <p>No Miniapps are currently active.</p>
        </div>
      ) : (
        // Use Tabs component *only* for the tab triggers (navigation UI)
        <Tabs
          value={selectedTab}
          onValueChange={setSelectedTab}
          className="flex min-h-0 flex-grow flex-col"
        >
          <TabsList className="bg-muted mb-2 h-auto flex-shrink-0 rounded-md border-b px-2 py-1.5">
            {activeDefinitions.map((def) => (
              <TabsTrigger
                key={def.id}
                value={def.id}
                className="data-[state=active]:bg-background h-auto px-2 py-1 text-xs data-[state=active]:shadow-sm"
              >
                {def.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Container for ALL active runners - use relative positioning */}
          <div className="relative min-h-0 flex-grow">
            {/* Render ALL active MiniappRunners */}
            {/* Use CSS to show only the one matching selectedTab */}
            {activeDefinitions.map((def) => (
              <div
                key={def.id}
                className={`absolute inset-0 h-full w-full overflow-hidden ${
                  // Position absolutely to stack them
                  selectedTab === def.id
                    ? 'z-10 opacity-100'
                    : 'pointer-events-none z-0 opacity-0' // Control visibility/interaction
                }`}
                // Alternatively use display: none - might have slightly different background behavior
                // style={{ display: selectedTab === def.id ? 'block' : 'none' }}
              >
                <MiniappRunner
                  miniappDefinition={def}
                  registerSendMessage={registerSendMessage}
                  unregisterSendMessage={unregisterSendMessage}
                  getSendMessage={getSendMessage}
                />
              </div>
            ))}
          </div>
        </Tabs>
      )}

      {/* Example button to test broadcast */}
      <div className="mt-4 flex-shrink-0">
        <Button
          onClick={() =>
            broadcastToMiniapps('testEvent', {
              time: Date.now(),
              message: 'Hello from Host!',
            })
          }
          size="sm"
          variant="outline"
        >
          Broadcast Test Event
        </Button>
      </div>
    </div>
  );
}
