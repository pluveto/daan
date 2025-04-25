import { Chat } from '@/types';
import React from 'react';
import { ConversationActionsMenu } from './ConversationActionsMenu';
import { ConversationItem } from './ConversationItem';

export interface GroupedChats {
  label: string;
  chats: Chat[];
}

interface ConversationListProps {
  groupedChats: GroupedChats[];
  activeChatId: string | null;
  onChatSelect: (chatId: string) => void;
  onPinToggle: (e: React.MouseEvent, chatId: string) => void;
  onDeleteChat: (e: React.MouseEvent, chatId: string) => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  groupedChats,
  activeChatId,
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
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {groupedChats.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No chats yet. Start a new one!
          </p>
        )}
        {groupedChats.map((group, groupIndex) => (
          <div key={group.label} className={groupIndex > 0 ? 'mt-3' : ''}>
            <div className="sticky top-0 z-10 bg-neutral-100/90 px-3 py-1 text-xs font-semibold text-neutral-600 backdrop-blur-sm dark:bg-neutral-900/90 dark:text-neutral-400">
              {group.label}
            </div>
            <div className="mt-1 space-y-1">
              {group.chats.map((chat) => (
                <ConversationItem
                  key={chat.id}
                  chat={chat}
                  isActive={activeChatId === chat.id}
                  onSelect={onChatSelect}
                  onPinToggle={onPinToggle}
                  onDelete={onDeleteChat}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
};
