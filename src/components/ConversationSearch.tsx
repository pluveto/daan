import React from 'react';
import { LuSearch } from 'react-icons/lu';
import { Button } from './ui/Button';

interface ConversationSearchProps {
  onSearchClick: () => void;
}

export const ConversationSearch: React.FC<ConversationSearchProps> = ({
  onSearchClick,
}) => {
  return (
    <div className="px-2 py-1">
      <Button
        variant="outline"
        className="text-muted-foreground hover:text-foreground h-8 w-full cursor-pointer justify-start px-3 text-sm font-normal"
        onClick={onSearchClick}
      >
        <LuSearch className="mr-2 h-4 w-4 flex-shrink-0" />
        Search in conversations...
      </Button>
    </div>
  );
};
