// src/components/ChatInterface.tsx (Updated - Phase 5)
import { cn } from '@/lib/utils';
import {
  activeChatAtom, // Still useful for checking if *any* chat is active
  isLoadingActiveChatAtom, // Use loading state
} from '@/store';
import { useAtomValue } from 'jotai';
import React from 'react';
import { LuLoader } from 'react-icons/lu'; // For loading spinner
import { ChatHeader } from './ChatHeader';
import { ChatHistory } from './ChatHistory';
import { MessageInput } from './MessageInput';

export const ChatInterface: React.FC = () => {
  const activeChat = useAtomValue(activeChatAtom); // Read the derived active chat data atom
  const isLoading = useAtomValue(isLoadingActiveChatAtom); // Read loading state

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Pass active chat (or null) to Header */}
      <ChatHeader />

      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Loading Overlay */}
        {isLoading &&
          activeChat === null && ( // Show overlay only when loading starts (activeChat becomes null)
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 dark:bg-neutral-950/50">
              <LuLoader className="h-8 w-8 animate-spin text-neutral-600 dark:text-neutral-400" />
            </div>
          )}

        {/* Chat History */}
        <ChatHistory
          className={cn(
            'flex-1',
            isLoading && 'opacity-50', // Optionally dim history while loading new chat
          )}
        />

        {/* Message Input (conditionally enabled based on active chat) */}
        {activeChat && <MessageInput />}
      </div>
    </div>
  );
};
