import { activeChatAtom } from '@/store/index.ts';
import { useAtomValue } from 'jotai';
import React from 'react';
import { ChatHeader } from './ChatHeader.tsx';
import { ChatHistory } from './ChatHistory.tsx';
import { MessageInput } from './MessageInput.tsx';

export const ChatInterface: React.FC = () => {
  const activeChat = useAtomValue(activeChatAtom);

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      <ChatHeader chat={activeChat} />
      {activeChat ? (
        <>
          <ChatHistory className="bg-white dark:bg-neutral-950" />
          <MessageInput />
        </>
      ) : (
        <div className="relative flex h-full flex-col items-center justify-center">
          <p className="z-10 text-center text-neutral-500 dark:text-neutral-400">
            Select a chat to start messaging
          </p>
        </div>
      )}
    </div>
  );
};
