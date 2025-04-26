// src/components/MiniappSearchDialog.tsx
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { ScrollArea } from '@/components/ui/ScrollArea';
import {
  activeMiniappsDefinitionAtom, // Use the atom that filters for *enabled* definitions
  isMiniappSearchOpenAtom,
  launchMiniappAtom,
} from '@/store/miniapp';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import React, { useMemo, useState } from 'react';
import { LuPackage, LuSearch, LuX } from 'react-icons/lu'; // LuPackage as default icon

import { useDebounce } from 'use-debounce'; // pnpm add use-debounce

// Optional: Highlighting component (can reuse from ConversationSearchDialog if extracted)
const HighlightedText: React.FC<{ text: string; query: string }> = React.memo(
  ({ text, query }) => {
    if (!query || !text) {
      return <>{text}</>;
    }
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <strong key={i} className="bg-yellow-200 dark:bg-yellow-600">
              {part}
            </strong>
          ) : (
            part
          ),
        )}
      </>
    );
  },
);

export const MiniappSearchDialog: React.FC = () => {
  const [isOpen, setIsOpen] = useAtom(isMiniappSearchOpenAtom);
  const launchMiniapp = useSetAtom(launchMiniappAtom);
  const availableDefinitions = useAtomValue(activeMiniappsDefinitionAtom); // Get enabled definitions

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm] = useDebounce(searchTerm, 300);

  const inputRef = React.useRef<HTMLInputElement>(null);

  const filteredMiniapps = useMemo(() => {
    const lowerCaseTerm = debouncedSearchTerm.toLowerCase().trim();
    if (!lowerCaseTerm) {
      // Return all available if no search term
      return availableDefinitions;
    }
    return availableDefinitions.filter(
      (def) =>
        def.name.toLowerCase().includes(lowerCaseTerm) ||
        def.description?.toLowerCase().includes(lowerCaseTerm),
    );
  }, [debouncedSearchTerm, availableDefinitions]);

  // Focus input when dialog opens
  React.useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setSearchTerm(''); // Reset search on close
    }
  }, [isOpen]);

  const handleSelectMiniapp = (definitionId: string) => {
    launchMiniapp(definitionId);
    setIsOpen(false); // Close dialog after launching
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="flex max-h-[70vh] flex-col sm:max-w-lg">
        {/* Adjusted size */}
        <DialogHeader>
          <DialogTitle>Launch MiniApp</DialogTitle>
          <DialogDescription>
            Select a MiniApp to start an instance.
          </DialogDescription>
        </DialogHeader>
        <div className="relative flex-shrink-0">
          <LuSearch className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search by name or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-10 pl-10"
          />
          {searchTerm && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2"
              onClick={() => setSearchTerm('')}
              aria-label="Clear search"
            >
              <LuX className="h-4 w-4" />
            </Button>
          )}
        </div>
        <ScrollArea className="mt-4 flex-1">
          {/* Wrap results in ScrollArea */}
          <div className="space-y-1 pr-3">
            {/* Add padding for scrollbar */}
            {filteredMiniapps.length > 0 ? (
              filteredMiniapps.map((def) => (
                <div
                  key={def.id}
                  className="hover:bg-accent dark:hover:bg-accent/50 flex cursor-pointer items-center space-x-3 rounded-md p-3"
                  onClick={() => handleSelectMiniapp(def.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ')
                      handleSelectMiniapp(def.id);
                  }}
                >
                  <span className="text-muted-foreground text-lg">
                    {/* Basic icon handling - use def.icon or default */}
                    {def.icon ? (
                      <span className="text-xl">{def.icon}</span> // Assume emoji or similar text icon
                    ) : (
                      <LuPackage className="h-5 w-5" />
                    )}
                  </span>
                  <div className="flex-1 overflow-hidden">
                    <div className="truncate text-sm font-medium">
                      <HighlightedText
                        text={def.name}
                        query={debouncedSearchTerm}
                      />
                    </div>
                    {def.description && (
                      <div className="text-muted-foreground mt-1 truncate text-xs">
                        <HighlightedText
                          text={def.description}
                          query={debouncedSearchTerm}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground py-4 text-center text-sm">
                {debouncedSearchTerm
                  ? `No MiniApps found matching "${debouncedSearchTerm}".`
                  : 'No enabled MiniApps found.'}
              </p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
