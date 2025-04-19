import { ChatInterface } from '@/components/ChatInterface.tsx';
import { ChatSettingsModal } from '@/components/ChatSettingsModal.tsx';
import { LeftSidebar } from '@/components/LeftSidebar.tsx';
import { RightSidebar } from '@/components/RightSidebar.tsx';
import { cn } from '@/lib/utils.ts';
import {
  activeChatAtom, // Import activeChatAtom
  isLeftSidebarOpenAtom,
  isRightSidebarOpenAtom,
  nightModeAtom,
  resetStreamingStatesAtom,
} from '@/store/atoms.ts';
import { useAtom, useAtomValue } from 'jotai';
import { useEffect } from 'react';

// Removed DialogDemo import if not needed

// Get App Name and Slogan from environment variables or use defaults
const appName = import.meta.env.VITE_APP_NAME || 'Daan';
const defaultTitle = `${appName}`; // Default title when no chat is selected

function App() {
  const [isLeftOpen] = useAtom(isLeftSidebarOpenAtom);
  const [isRightOpen] = useAtom(isRightSidebarOpenAtom);
  const [isNightMode] = useAtom(nightModeAtom);
  const activeChat = useAtomValue(activeChatAtom);
  const [, resetStreamingStates] = useAtom(resetStreamingStatesAtom);

  useEffect(() => {
    resetStreamingStates();
  }, []);

  // Apply dark class initially based on stored preference
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isNightMode);
  }, [isNightMode]);

  // Update window title based on active chat
  useEffect(() => {
    document.title = activeChat
      ? `${activeChat.name} - ${appName}`
      : defaultTitle;
    // Cleanup function to reset title if component unmounts (optional)
    // return () => { document.title = defaultTitle; };
  }, [activeChat]); // Re-run effect when activeChat changes

  return (
    <div
      className={cn(
        'flex h-screen w-screen overflow-hidden bg-neutral-50 font-sans text-neutral-950 dark:bg-gray-950 dark:text-neutral-100',
        isNightMode ? 'dark' : '',
      )}
    >
      {/* Modals */}
      <ChatSettingsModal />

      {/* Left Sidebar */}
      <div
        className={cn(
          'h-full flex-shrink-0 transition-all duration-300 ease-in-out',
          isLeftOpen ? 'w-64' : 'w-0',
        )}
      >
        {isLeftOpen && <LeftSidebar />}
      </div>

      {/* Main Content Area */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Chat Interface */}
        <div className="flex-1 overflow-hidden">
          <ChatInterface />
        </div>
      </div>

      {/* Right Sidebar */}
      <div
        className={cn(
          'h-full flex-shrink-0 transition-all duration-300 ease-in-out',
          isRightOpen ? 'w-72' : 'w-0',
        )}
      >
        {isRightOpen && <RightSidebar />}
      </div>
    </div>
  );
}

export default App;
