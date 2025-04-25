// src/SystemSettingsDialog.tsx
// Implemented Tab structure using shadcn UI components
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { isSystemSettingsDialogOpenAtom } from '@/store/uiState';
import { useAtom } from 'jotai';
import React, { useState } from 'react';
import {
  LuBlocks,
  LuCog,
  LuFlaskConical,
  LuOrbit,
  LuPalette,
} from 'react-icons/lu';
// Import Tab components
import { ApiSettingsTab } from './settings/ApiSettingsTab';
import { FunctionSettingsTab } from './settings/FunctionSettingsTab';
import { McpSettingsTab } from './settings/McpSettingsTab';
import { MiniappSettingsTab } from './settings/MiniappSettingsTab';
import { UiSettingsTab } from './settings/UiSettingsTab';

export const SystemSettingsDialog: React.FC = () => {
  const [isOpen, setIsOpen] = useAtom(isSystemSettingsDialogOpenAtom);
  const [activeTab, setActiveTab] = useState('api'); // Default tab

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="flex h-[80vh] max-h-[900px] w-full max-w-3xl flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="flex-shrink-0 border-b p-4">
          <DialogTitle>System Settings</DialogTitle>
          {/* Removed description - title is enough */}
        </DialogHeader>

        <Tabs
          className="flex flex-1 flex-col overflow-hidden" // Ensure tabs take remaining space
          onValueChange={setActiveTab}
          value={activeTab}
        >
          {/* Tab Headers */}
          <TabsList className="flex w-full flex-shrink-0 justify-start rounded-none border-b bg-neutral-100 dark:bg-neutral-900/50">
            <TabsTrigger
              className="flex-1 py-3 data-[state=active]:shadow-none"
              value="api"
            >
              <LuOrbit className="mr-2 h-4 w-4" /> API
            </TabsTrigger>
            <TabsTrigger
              className="flex-1 py-3 data-[state=active]:shadow-none"
              value="mcp"
            >
              <LuFlaskConical className="mr-2 h-4 w-4" /> MCP
            </TabsTrigger>

            <TabsTrigger
              className="flex-1 py-3 data-[state=active]:shadow-none"
              value="miniapp"
            >
              <LuBlocks className="mr-2 h-4 w-4" /> Miniapp
            </TabsTrigger>
            <TabsTrigger
              className="flex-1 py-3 data-[state=active]:shadow-none"
              value="ui"
            >
              <LuPalette className="mr-2 h-4 w-4" /> UI
            </TabsTrigger>
            <TabsTrigger
              className="flex-1 py-3 data-[state=active]:shadow-none"
              value="function"
            >
              <LuCog className="mr-2 h-4 w-4" /> Function
            </TabsTrigger>
          </TabsList>

          {/* Tab Content - Make this area scrollable */}
          <div className="flex-1 overflow-y-auto">
            <TabsContent
              className="mt-0 h-full focus-visible:ring-0 focus-visible:ring-offset-0"
              value="api"
            >
              <ApiSettingsTab />
            </TabsContent>
            <TabsContent
              className="mt-0 h-full focus-visible:ring-0 focus-visible:ring-offset-0"
              value="mcp"
            >
              <McpSettingsTab />
            </TabsContent>
            <TabsContent
              className="mt-0 h-full focus-visible:ring-0 focus-visible:ring-offset-0"
              value="miniapp"
            >
              <MiniappSettingsTab />
            </TabsContent>
            <TabsContent
              className="mt-0 h-full focus-visible:ring-0 focus-visible:ring-offset-0"
              value="ui"
            >
              <UiSettingsTab />
            </TabsContent>
            <TabsContent
              className="mt-0 h-full focus-visible:ring-0 focus-visible:ring-offset-0"
              value="function"
            >
              <FunctionSettingsTab />
            </TabsContent>
          </div>
        </Tabs>

        {/* No explicit Save/Reset buttons needed; changes apply via Jotai atoms */}
      </DialogContent>
    </Dialog>
  );
};
