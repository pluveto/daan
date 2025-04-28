// src/SystemSettingsDialog.tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import {
  isSystemSettingsDialogOpenAtom,
  systemSettingsDialogActiveTabAtom,
} from '@/store/uiState';
import { useAtom, useAtomValue } from 'jotai';
import React from 'react';
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
import { enableMiniappFeatureAtom } from './store';

interface TabConfig {
  id: string;
  label: string;
  icon: React.ReactNode;
  component: React.ReactNode;
  enable: boolean;
}

interface SystemSettingsDialogProps {}

export const SystemSettingsDialog: React.FC<
  SystemSettingsDialogProps
> = ({}) => {
  const [isOpen, setIsOpen] = useAtom(isSystemSettingsDialogOpenAtom);
  const [activeTab, setActiveTab] = useAtom(systemSettingsDialogActiveTabAtom);
  const enableMiniappFeature = useAtomValue(enableMiniappFeatureAtom);

  const tabConfigs: TabConfig[] = [
    {
      id: 'api',
      label: 'API',
      icon: <LuOrbit className="mr-2 h-4 w-4" />,
      component: <ApiSettingsTab />,
      enable: true,
    },
    {
      id: 'mcp',
      label: 'MCP',
      icon: <LuFlaskConical className="mr-2 h-4 w-4" />,
      component: <McpSettingsTab />,
      enable: true,
    },
    {
      id: 'miniapp',
      label: 'Miniapp',
      icon: <LuBlocks className="mr-2 h-4 w-4" />,
      component: <MiniappSettingsTab />,
      enable: enableMiniappFeature,
    },
    {
      id: 'ui',
      label: 'UI',
      icon: <LuPalette className="mr-2 h-4 w-4" />,
      component: <UiSettingsTab />,
      enable: true,
    },
    {
      id: 'function',
      label: 'Function',
      icon: <LuCog className="mr-2 h-4 w-4" />,
      component: <FunctionSettingsTab />,
      enable: true,
    },
  ];

  const visibleTabs = tabConfigs.filter((tab) => tab.enable);

  React.useEffect(() => {
    if (
      visibleTabs.length > 0 &&
      !visibleTabs.some((tab) => tab.id === activeTab)
    ) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [activeTab, visibleTabs, setActiveTab]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="flex h-[80vh] max-h-[900px] w-full max-w-3xl flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="flex-shrink-0 border-b p-4">
          <DialogTitle>System Settings</DialogTitle>
        </DialogHeader>

        <Tabs
          className="flex flex-1 flex-col overflow-hidden"
          onValueChange={setActiveTab}
          value={activeTab}
        >
          <TabsList className="flex w-full flex-shrink-0 justify-start rounded-none border-b bg-neutral-100 dark:bg-neutral-900/50">
            {visibleTabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                className="flex-1 py-3 data-[state=active]:shadow-none"
                value={tab.id}
              >
                {tab.icon} {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 overflow-y-auto">
            {visibleTabs.map((tab) => (
              <TabsContent
                key={tab.id}
                className="mt-0 h-full focus-visible:ring-0 focus-visible:ring-offset-0"
                value={tab.id}
              >
                {tab.component}
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
