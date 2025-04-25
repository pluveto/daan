// src/components/RightSidebar.tsx
import { ScrollArea } from '@/components/ui/ScrollArea'; // Use ScrollArea if content might overflow

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/TabsSlide';
// --- Import the Miniapp Runtime Panel ---
import { MiniappRuntimePanel } from '@/miniapps/components/MiniappRuntimePanel'; // Adjust path
import { activeChatAtom, activeMiniappIdsAtom } from '@/store';
import { useAtomValue } from 'jotai';
import React from 'react'; // Ensure React is imported

import { ActiveChatSettings } from './ActiveChatSettings';

export function RightSidebar() {
  const activeMiniappIds = useAtomValue(activeMiniappIdsAtom);
  const activeMiniappCount = activeMiniappIds.size;

  // If no chat is active, maybe don't show the sidebar content? Or show defaults?
  // if (!activeChat) return null; // Or adjust logic

  return (
    // Use ScrollArea for the entire sidebar if needed, or for individual tab content
    <div className="flex h-full flex-col border-l border-neutral-200">
      <Tabs defaultValue="params" className="flex min-h-0 flex-grow flex-col">
        <TabsList className="grid w-full flex-shrink-0 grid-cols-2">
          <TabsTrigger value="params">Parameters</TabsTrigger>
          <TabsTrigger value="miniapps">
            Miniapps {activeMiniappCount > 0 && `(${activeMiniappCount})`}
          </TabsTrigger>
        </TabsList>

        {/* Content for Parameters Tab */}
        <TabsContent
          value="params"
          className="ring-offset-background focus-visible:ring-ring mt-2 flex-grow focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none data-[state=inactive]:hidden"
        >
          {/* Wrap parameters in ScrollArea if they might overflow */}
          <ScrollArea className="h-full">
            <ActiveChatSettings />
          </ScrollArea>
        </TabsContent>

        {/* Content for Miniapps Tab */}
        <TabsContent
          value="miniapps"
          className="ring-offset-background focus-visible:ring-ring mt-0 flex-grow focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none data-[state=inactive]:hidden"
        >
          {/* MiniappRuntimePanel already handles its internal layout and scrolling */}
          <MiniappRuntimePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
