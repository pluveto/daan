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
  isLeftSidebarOpenAtom,
  isRightSidebarOpenAtom,
  nightModeAtom,
  resetStreamingStatesAtom,
} from '@/store/index';
import { useAtom, useAtomValue } from 'jotai';
import { VisuallyHidden } from 'radix-ui';
import { useEffect } from 'react';
import FastImport from './components/FastImport';
import { Toaster } from './components/ui/Toaster';
import { useMiniappPersistence } from './miniapps/persistence';
import { SystemSettingsDialog } from './SystemSettingsDialog'; // Import the new Dialog

const appName = import.meta.env.VITE_APP_NAME || 'Daan';
const defaultTitle = `${appName}`;

function App() {
  const [isLeftOpen, setIsLeftOpen] = useAtom(isLeftSidebarOpenAtom);
  const [isRightOpen, setIsRightOpen] = useAtom(isRightSidebarOpenAtom);
  const [isNightMode] = useAtom(nightModeAtom);
  const activeChat = useAtomValue(activeChatAtom);
  const [, resetStreamingStates] = useAtom(resetStreamingStatesAtom);

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
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <ChatInterface />
      </div>

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
    </div>
  );
}

export default App;
