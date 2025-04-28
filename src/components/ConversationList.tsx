// src/components/ConversationList.tsx (Updated - Phase 5)
import type { ChatMetadata } from '@/services/ChatDataService'; // Import ChatMetadata
import React from 'react';
import { ConversationActionsMenu } from './ConversationActionsMenu';
import { ConversationItem } from './ConversationItem';

// Grouping logic might move to LeftSidebar or a derived atom later
export interface GroupedChatsMetadata {
  label: string;
  chats: ChatMetadata[]; // Use metadata type
}

interface ConversationListProps {
  groupedChats: GroupedChatsMetadata[]; // Expect grouped metadata
  activeChatId: string | null;
  isLoading: boolean; // Add loading prop
  onChatSelect: (chatId: string) => void;
  onPinToggle: (e: React.MouseEvent, chatId: string) => void;
  onDeleteChat: (e: React.MouseEvent, chatId: string) => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  groupedChats,
  activeChatId,
  isLoading,
  onChatSelect,
  onPinToggle,
  onDeleteChat,
}) => {
  return (
    <>
      {/* Conversations Header */}
      <div className="flex items-center px-3 pt-2 pb-1 text-xs text-neutral-500 dark:text-neutral-400">
        <div className="flex-1 font-medium tracking-wider uppercase">
          Conversations
        </div>
        <div>
          <ConversationActionsMenu />
        </div>
      </div>

      {/* Conversations List Area */}
      <div className="relative flex-1 overflow-y-auto px-2 pb-2">
        {/* Loading State */}
        {/* {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-100/50 dark:bg-neutral-900/50 z-20">
            <LuLoader className="h-6 w-6 animate-spin text-neutral-600 dark:text-neutral-400" />
          </div>
        )} */}

        {/* Empty State (only show if not loading) */}
        {!isLoading && groupedChats.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No chats yet. Start a new one!
          </p>
        )}

        {/* Chat Groups (only show if not loading) */}
        {groupedChats.map((group, groupIndex) => (
          <div key={group.label} className={groupIndex > 0 ? 'mt-3' : ''}>
            {/* Sticky header for date group */}
            <div className="sticky top-0 z-10 bg-neutral-100/90 px-3 py-1 text-xs font-semibold text-neutral-600 backdrop-blur-sm dark:bg-neutral-900/90 dark:text-neutral-400">
              {group.label}
            </div>
            <div className="mt-1 space-y-1">
              {group.chats.map((chat) => (
                <ConversationItem
                  key={chat.id}
                  chat={chat} // Pass ChatMetadata object
                  isActive={activeChatId === chat.id}
                  onSelect={onChatSelect}
                  onPinToggle={onPinToggle}
                  onDelete={onDeleteChat} // Keep original prop name
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
};
