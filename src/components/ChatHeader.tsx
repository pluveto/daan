import {
  activeChatAtom,
  isLeftSidebarOpenAtom,
  isRightSidebarOpenAtom,
} from '@/store/index';
import { useAtom, useAtomValue } from 'jotai';
import React from 'react';
import {
  LuMessageSquare,
  LuPanelLeft,
  LuPanelLeftClose,
  LuPanelRight,
  LuPanelRightClose,
} from 'react-icons/lu';
import { Button } from './ui/Button';

interface ChatHeaderProps {}
export const ChatHeader: React.FC<ChatHeaderProps> = ({}) => {
  const chat = useAtomValue(activeChatAtom);
  const [isLeftOpen, setIsLeftOpen] = useAtom(isLeftSidebarOpenAtom);
  const [isRightOpen, setIsRightOpen] = useAtom(isRightSidebarOpenAtom);

  return (
    <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 dark:border-neutral-700 dark:bg-neutral-950">
      {/* Left Sidebar Toggle */}
      <Button
        aria-label={isLeftOpen ? 'Close left sidebar' : 'Open left sidebar'}
        className="flex-shrink-0"
        onClick={() => setIsLeftOpen(!isLeftOpen)}
        size="icon"
        variant="ghost"
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
            <div className="flex flex-col">
              <h1 className="truncate font-semibold text-neutral-950 sm:text-lg dark:text-neutral-100">
                {chat.name}
              </h1>
              <small className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                {chat.model}
              </small>
            </div>
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
        <Button
          aria-label={
            isRightOpen ? 'Close right sidebar' : 'Open right sidebar'
          }
          onClick={() => setIsRightOpen(!isRightOpen)}
          size="icon"
          variant="ghost"
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
