import React from 'react';
import { LuArchiveRestore, LuPlus } from 'react-icons/lu';
import { Button } from './ui/Button';

interface SidebarActionsProps {
  onNewChatClick: () => void;
  onClearUnpinnedClick: () => void;
}

export const SidebarActions: React.FC<SidebarActionsProps> = ({
  onNewChatClick,
  onClearUnpinnedClick,
}) => {
  return (
    <div className="flex flex-col gap-2 p-3 sm:flex-row">
      <Button className="flex-1" onClick={onNewChatClick}>
        <LuPlus className="mr-2 h-4 w-4" /> New Chat
      </Button>
      <Button
        aria-label="Clear Unpinned Chats"
        onClick={onClearUnpinnedClick}
        size="icon"
        title="Clear Unpinned Chats"
        variant="outline"
      >
        <LuArchiveRestore className="h-4 w-4" />
      </Button>
    </div>
  );
};
