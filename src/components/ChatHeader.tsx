import {
  isChatSettingsModalOpenAtom,
  isLeftSidebarOpenAtom,
  isRightSidebarOpenAtom,
} from '@/store/atoms.ts';
import type { Chat } from '@/types.ts';
import { useAtom, useSetAtom } from 'jotai';
import React from 'react';
import {
  LuMessageSquare,
  LuPanelLeft,
  LuPanelLeftClose,
  LuPanelRight,
  LuPanelRightClose,
  LuSettings2,
} from 'react-icons/lu';
import { Button } from './ui/Button.tsx';
import { Switch } from './ui/Switch.tsx';

interface ChatHeaderProps {
  chat: Chat | null;
}
export const ChatHeader: React.FC<ChatHeaderProps> = ({ chat }) => {
  const setIsChatSettingsModalOpen = useSetAtom(isChatSettingsModalOpenAtom);
  const [isLeftOpen, setIsLeftOpen] = useAtom(isLeftSidebarOpenAtom);
  const [isRightOpen, setIsRightOpen] = useAtom(isRightSidebarOpenAtom);

  return (
    <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 dark:border-neutral-700 dark:bg-neutral-950">
      {/* Left Sidebar Toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsLeftOpen(!isLeftOpen)}
        className="flex-shrink-0"
        aria-label={isLeftOpen ? 'Close left sidebar' : 'Open left sidebar'}
      >
        {isLeftOpen ? (
          <LuPanelLeftClose className="h-5 w-5" />
        ) : (
          <LuPanelLeft className="h-5 w-5" />
        )}
      </Button>

      {/* Chat Title/Info - Takes remaining space */}
      <div className="flex flex-1 items-center space-x-2 overflow-hidden sm:space-x-3">
        {chat ? (
          <>
            <span className="flex-shrink-0 text-xl">
              {chat.icon || <LuMessageSquare className="text-neutral-500" />}
            </span>
            <h1 className="truncate text-base font-semibold text-neutral-950 sm:text-lg dark:text-neutral-100">
              {chat.name}
            </h1>
            <small className="text-neutral-500 dark:text-neutral-400">
              {chat.model}
            </small>
          </>
        ) : (
          <div className="flex h-full flex-1 items-center justify-center">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Select or create a chat
            </p>
          </div>
        )}
      </div>

      {/* Right Controls (Settings + Right Sidebar Toggle) */}
      <div className="flex flex-shrink-0 items-center space-x-1">
        {chat && ( // Only show settings button if a chat is active
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsChatSettingsModalOpen(true)}
            aria-label="Chat Settings"
          >
            <LuSettings2 className="h-5 w-5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsRightOpen(!isRightOpen)}
          aria-label={
            isRightOpen ? 'Close right sidebar' : 'Open right sidebar'
          }
        >
          {isRightOpen ? (
            <LuPanelRightClose className="h-5 w-5" />
          ) : (
            <LuPanelRight className="h-5 w-5" />
          )}
        </Button>
      </div>
    </div>
  );
};
