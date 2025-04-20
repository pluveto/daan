import { CharacterEditor } from '@/components/CharacterEditor.tsx';
import { ChatInterface } from '@/components/ChatInterface.tsx';
import { ChatSettingsModal } from '@/components/ChatSettingsModal.tsx';
import { ConversationSearchDialog } from '@/components/ConversationSearchDialog.tsx';
import { LeftSidebar } from '@/components/LeftSidebar.tsx';
import { RightSidebar } from '@/components/RightSidebar.tsx';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/Drawer.tsx';
import { useMediaQuery } from '@/hooks/use-media-query.ts';
import { cn } from '@/lib/utils.ts';
import {
  activeChatAtom,
  isLeftSidebarOpenAtom,
  isRightSidebarOpenAtom,
  nightModeAtom,
  resetStreamingStatesAtom,
} from '@/store/index.ts';
import { useAtom, useAtomValue } from 'jotai';
import { VisuallyHidden } from 'radix-ui';
import { useEffect } from 'react';
import FastImport from './components/FastImport.tsx';
import { Toaster } from './components/ui/Toaster.tsx';

const appName = import.meta.env.VITE_APP_NAME || 'Daan';
const defaultTitle = `${appName}`;

function App() {
  const [isLeftOpen, setIsLeftOpen] = useAtom(isLeftSidebarOpenAtom);
  const [isRightOpen, setIsRightOpen] = useAtom(isRightSidebarOpenAtom);
  const [isNightMode] = useAtom(nightModeAtom);
  const activeChat = useAtomValue(activeChatAtom);
  const [, resetStreamingStates] = useAtom(resetStreamingStatesAtom);

  // Hook to check screen size (example: true if screen is less than 1024px)
  const isMobile = useMediaQuery('(max-width: 1023px)'); // lg breakpoint is 1024px
  const isDesktop = !isMobile;

  useEffect(() => {
    resetStreamingStates();
    document.documentElement.classList.toggle('dark', isNightMode);
  }, [isNightMode, resetStreamingStates]);

  useEffect(() => {
    document.title = activeChat
      ? `${activeChat.name} - ${appName}`
      : defaultTitle;
  }, [activeChat]);

  // Close sidebars when switching between mobile/desktop view
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
      <ChatSettingsModal />
      <ConversationSearchDialog />
      <CharacterEditor />
      <Toaster />
      <FastImport />

      {/* Left Sidebar - Conditional rendering based on screen size */}
      {isDesktop ? (
        // Desktop: Inline Sidebar (conditionally shown by state)
        <div
          className={cn(
            'h-full flex-shrink-0 transition-all duration-300 ease-in-out',
            // Use Tailwind prefix for default desktop state
            isLeftOpen ? 'w-72' : 'w-0', // Toggle width based on state
          )}
        >
          {/* Render only when open to potentially save resources, or always render and use w-0/hidden */}
          {isLeftOpen && <LeftSidebar />}
        </div>
      ) : (
        // Mobile: Drawer
        <Drawer direction="left" open={isLeftOpen} onOpenChange={setIsLeftOpen}>
          {/* DrawerTrigger is typically placed in the header, see ChatHeader adjustments */}
          <DrawerContent className="mt-0 h-full w-4/5 max-w-sm rounded-none">
            {' '}
            {/* Adjust width/styling as needed */}
            <VisuallyHidden.Root>
              <DrawerHeader>
                <DrawerTitle>Left Sidebar</DrawerTitle>
                <DrawerDescription>This is the left sidebar.</DrawerDescription>
              </DrawerHeader>
            </VisuallyHidden.Root>
            <LeftSidebar />
            {/* Add a close button inside if needed */}
          </DrawerContent>
        </Drawer>
      )}

      {/* Main Content Area */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <ChatInterface />
      </div>

      {/* Right Sidebar - Conditional rendering based on screen size */}
      {isDesktop ? (
        // Desktop: Inline Sidebar
        <div
          className={cn(
            'h-full flex-shrink-0 transition-all duration-300 ease-in-out',
            isRightOpen ? 'w-72' : 'w-0',
          )}
        >
          {isRightOpen && <RightSidebar />}
        </div>
      ) : (
        // Mobile: Drawer
        <Drawer
          direction="right"
          open={isRightOpen}
          onOpenChange={setIsRightOpen}
        >
          {/* DrawerTrigger is typically placed in the header */}
          <DrawerContent className="mt-0 h-full w-4/5 max-w-sm rounded-none">
            <VisuallyHidden.Root>
              <DrawerHeader>
                <DrawerTitle>Right Sidebar</DrawerTitle>
                <DrawerDescription>
                  This is the right sidebar.
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
