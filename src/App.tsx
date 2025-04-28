// src/App.tsx
// Ensured SystemSettingsDialog is rendered

import { CharacterEditor } from '@/components/CharacterEditor/index';
import { ChatInterface } from '@/components/ChatInterface';
import { ConversationSearchDialog } from '@/components/ConversationSearchDialog';
import { LeftSidebar } from '@/components/LeftSidebar';
import { RightSidebar } from '@/components/RightSidebar';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/Drawer';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import {
  activeChatAtom,
  chatServiceErrorAtom,
  initializeChatServiceAtom,
  isChatServiceReadyAtom,
  isLeftSidebarOpenAtom,
  isRightSidebarOpenAtom,
  nightModeAtom,
  resetGlobalStreamingStateAtom,
} from '@/store/index';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { VisuallyHidden } from 'radix-ui';
import { useEffect } from 'react';
import { CharacterMarketplaceDialog } from './components/CharacterMarketplaceDialog';
import FastImport from './components/FastImport';
import { MiniappMarketplaceDialog } from './components/MiniappMarketplaceDialog';
import { MiniappSearchDialog } from './components/MiniappSearchDialog';
import { MiniappWindowManager } from './components/MiniappWindowManager';
import { Toaster } from './components/ui/Toaster';
import { useMiniappPersistence } from './miniapps/hooks/useMiniappPersistence';
import { SystemSettingsDialog } from './SystemSettingsDialog'; // Import the new Dialog

const appName = import.meta.env.VITE_APP_NAME || 'Daan';
const defaultTitle = `${appName}`;

function App() {
  const [isLeftOpen, setIsLeftOpen] = useAtom(isLeftSidebarOpenAtom);
  const [isRightOpen, setIsRightOpen] = useAtom(isRightSidebarOpenAtom);
  const [isNightMode] = useAtom(nightModeAtom);
  const activeChat = useAtomValue(activeChatAtom);
  const resetStreamingStates = useSetAtom(resetGlobalStreamingStateAtom);

  const isMobile = useMediaQuery('(max-width: 1023px)');
  const isDesktop = !isMobile;

  // --- Activate Miniapp Persistence ---
  // Call the hook to load data and set up saving effects.
  // We might use isLoaded later if needed for global loading state.
  const { isLoaded: miniappsLoaded } = useMiniappPersistence();
  useEffect(() => {
    if (miniappsLoaded) {
      console.log('App: Miniapp persistence initialized.');
    }
  }, [miniappsLoaded]);

  useEffect(() => {
    resetStreamingStates();
    document.documentElement.classList.toggle('dark', isNightMode);
  }, [isNightMode, resetStreamingStates]);

  useEffect(() => {
    document.title = activeChat
      ? `${activeChat.name} - ${appName}`
      : defaultTitle;
  }, [activeChat]);

  useEffect(() => {
    if (isMobile && (isLeftOpen || isRightOpen)) {
      setIsLeftOpen(false);
      setIsRightOpen(false);
    }
  }, [isMobile, setIsLeftOpen, setIsRightOpen]);

  const initializeService = useSetAtom(initializeChatServiceAtom);
  const isServiceReady = useAtomValue(isChatServiceReadyAtom);
  const serviceError = useAtomValue(chatServiceErrorAtom);

  // Initialize service on component mount
  useEffect(() => {
    initializeService();
  }, [initializeService]); // Dependency array ensures it runs once

  // Show loading or error state while service is initializing
  if (serviceError) {
    return (
      <div className="flex h-screen items-center justify-center bg-red-100 text-red-800">
        <p>
          Error initializing application data: {serviceError.message}. Please
          try refreshing or clearing site data.
        </p>
      </div>
    );
  }

  if (!isServiceReady) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p>Loading application...</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-screen w-screen overflow-hidden bg-neutral-50 font-sans text-neutral-950 dark:bg-gray-950 dark:text-neutral-100',
        isNightMode ? 'dark' : '',
      )}
    >
      <ConversationSearchDialog />
      <CharacterEditor />
      <Toaster richColors />
      <FastImport />
      <SystemSettingsDialog />
      <MiniappSearchDialog />
      <MiniappMarketplaceDialog />
      <CharacterMarketplaceDialog />

      {/* Left Sidebar */}
      {isDesktop ? (
        <div
          className={cn(
            'h-full flex-shrink-0 transition-all duration-300 ease-in-out',
            isLeftOpen ? 'w-72' : 'w-0',
          )}
        >
          {isLeftOpen && <LeftSidebar />}
        </div>
      ) : (
        <Drawer direction="left" open={isLeftOpen} onOpenChange={setIsLeftOpen}>
          <DrawerContent className="mt-0 h-full w-4/5 max-w-sm rounded-none">
            <VisuallyHidden.Root>
              <DrawerHeader>
                <DrawerTitle>Left Sidebar</DrawerTitle>
                <DrawerDescription>Navigation and actions</DrawerDescription>
              </DrawerHeader>
            </VisuallyHidden.Root>
            <LeftSidebar />
          </DrawerContent>
        </Drawer>
      )}

      {/* Main Content */}
      <main className="relative flex flex-1 flex-col overflow-hidden">
        <ChatInterface />
      </main>

      {/* Right Sidebar */}
      {isDesktop ? (
        <div
          className={cn(
            'h-full flex-shrink-0 transition-all duration-300 ease-in-out',
            isRightOpen ? 'w-72' : 'w-0', // Width controlled by state
          )}
        >
          {isRightOpen && <RightSidebar />} {/* Render based on state */}
        </div>
      ) : (
        <Drawer
          direction="right"
          open={isRightOpen}
          onOpenChange={setIsRightOpen}
        >
          <DrawerContent className="mt-0 h-full w-4/5 max-w-sm rounded-none">
            <VisuallyHidden.Root>
              <DrawerHeader>
                <DrawerTitle>Character Settings</DrawerTitle>
                <DrawerDescription>
                  Character related settings
                </DrawerDescription>
              </DrawerHeader>
            </VisuallyHidden.Root>
            <RightSidebar />
          </DrawerContent>
        </Drawer>
      )}
      <MiniappWindowManager />
    </div>
  );
}

export default App;
