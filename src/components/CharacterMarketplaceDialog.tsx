// src/components/CharacterMarketplaceDialog.tsx
import { Button } from '@/components/ui/Button'; // Import Button
import {
  Dialog,
  DialogContent,
  DialogFooter, // Import DialogFooter
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { MarketplaceItem, MarketplaceService } from '@/lib/MarketplaceService';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { ArrowLeft, ArrowRight } from 'lucide-react'; // Icons for buttons
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { CreateCharacterDto } from '@/services/ChatDataService';
import {
  defaultPromptAtom,
  installCharacterAtom,
  isCharacterMarketplaceOpenAtom,
} from '@/store';
import { MarketplaceItemGrid } from './Marketplace/MarketplaceItemGrid';
import { MarketplaceSearchBar } from './Marketplace/MarketplaceSearchBar';

// Define items per page constant
const ITEMS_PER_PAGE = 12; // Adjust as needed

export const CharacterMarketplaceDialog: React.FC = () => {
  const [isOpen, onOpenChange] = useAtom(isCharacterMarketplaceOpenAtom);
  const installCharacterAction = useSetAtom(installCharacterAtom);
  const defaultPrompt = useAtomValue(defaultPromptAtom);

  // State for items, search, loading
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // State for tracking which item is currently being installed
  const [installingId, setInstallingId] = useState<number | null>(null);

  // State for pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Calculate total pages
  const totalPages = useMemo(
    () => Math.ceil(totalCount / ITEMS_PER_PAGE),
    [totalCount],
  );

  // Fetch items function, now includes pagination parameters
  const fetchItems = useCallback(
    async (query?: string, page: number = 1) => {
      setIsLoading(true);
      // Clear items only if it's page 1 or a new search
      if (page === 1) {
        setItems([]);
      }
      try {
        // Use searchCharacters API endpoint
        const { items: fetchedItems, totalCount: fetchedTotalCount } =
          await MarketplaceService.searchCharacters(
            query,
            page,
            ITEMS_PER_PAGE,
          );

        // Filter and map items for Characters
        const results = (fetchedItems || []) // Ensure fetchedItems is an array
          .filter((item) => item.title.startsWith('[Character]'))
          .map((item) => ({
            ...item,
            title: item.title.replace('[Character]', '').trim(),
          }));

        setItems(results);
        setTotalCount(fetchedTotalCount || 0); // Update total count
        setCurrentPage(page); // Set current page
      } catch (error) {
        console.error('Failed to load characters:', error);
        toast.error('Failed to load characters');
        setItems([]); // Clear items on error
        setTotalCount(0); // Reset total count on error
      } finally {
        setIsLoading(false);
      }
    },
    [], // No dependencies needed here
  );

  // Effect to fetch items when the dialog opens or the fetch function changes
  useEffect(() => {
    if (isOpen) {
      // Fetch the first page when the dialog opens
      fetchItems(searchTerm, 1);
    } else {
      // Reset state when dialog closes
      setSearchTerm('');
      setItems([]);
      setCurrentPage(1);
      setTotalCount(0);
      setInstallingId(null); // Also reset installingId
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, fetchItems]); // fetchItems is stable

  // Handler for initiating a search
  const handleSearch = () => {
    // Reset to page 1 when performing a new search
    fetchItems(searchTerm, 1);
  };

  // Handler for going to the next page
  const handleNextPage = () => {
    if (currentPage < totalPages && !isLoading && !installingId) {
      fetchItems(searchTerm, currentPage + 1);
    }
  };

  // Handler for going to the previous page
  const handlePreviousPage = () => {
    if (currentPage > 1 && !isLoading && !installingId) {
      fetchItems(searchTerm, currentPage - 1);
    }
  };

  // Handler for installing a character
  const handleInstall = async (item: MarketplaceItem) => {
    // Prevent multiple installs at the same time
    if (installingId) return;

    setInstallingId(item.id); // Set the ID of the item being installed
    try {
      const details = await MarketplaceService.getCharacterDetails(item.id);
      if (!details?.definition) {
        throw new Error('Character definition is missing');
      }

      // Construct the DTO for character creation
      const createDto: CreateCharacterDto = {
        // id: details.definition.id ?? undefined, // Let backend generate ID usually
        name: details.definition.name || details.metadata?.name || item.title, // Use item.title as fallback
        icon: details.definition.icon || details.metadata?.icon || '👤',
        description:
          details.definition.description || details.metadata?.description || '',
        prompt: details.definition.prompt || '',
        // Ensure reasonable defaults if not provided
        model: details.definition.model || defaultPrompt, // Example default
        maxHistory: details.definition.maxHistory ?? 20,
        // Add other fields from CharacterDefinition if necessary
        // temperature: details.definition.temperature,
        // topP: details.definition.topP,
        // n: details.definition.n,
        // maxTokens: details.definition.maxTokens,
        // presencePenalty: details.definition.presencePenalty,
        // frequencyPenalty: details.definition.frequencyPenalty,
        // logitBias: details.definition.logitBias,
        // stop: details.definition.stop,
        // Add systemPrompt etc. if they are part of your definition
      };

      await installCharacterAction(createDto); // Use the Jotai atom action
      toast.success(`Character "${createDto.name}" installed successfully!`);
      onOpenChange(false); // Close dialog after successful install
    } catch (error: any) {
      console.error('Failed to install character:', error);
      toast.error(`Failed to install character: ${error.message}`);
    } finally {
      setInstallingId(null); // Clear the installing ID regardless of success/failure
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {/* Dialog container with flex column layout and max height */}
      <DialogContent className="flex max-h-[80vh] min-w-[70vh] flex-col sm:max-w-[80vw]">
        <DialogHeader>
          <DialogTitle>Character Marketplace</DialogTitle>
        </DialogHeader>

        {/* Search bar - disable while loading or installing *any* item */}
        <MarketplaceSearchBar
          type="character"
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          onSearch={handleSearch}
          isLoading={isLoading || !!installingId} // Disable if loading or installingId is set
        />

        {/* Scrollable area for the item grid */}
        <div className="min-h-0 flex-grow overflow-y-auto pr-2 pt-4">
          <MarketplaceItemGrid
            items={items}
            isLoading={isLoading && items.length === 0} // Show loading spinner mainly on initial load
            onViewDetails={() => {
              /* Implement view details if needed */
            }}
            onInstall={handleInstall}
            installingId={installingId} // Pass the installingId to the grid
          />
        </div>

        {/* Pagination controls - only show if there are items */}
        {totalCount > 0 && (
          <DialogFooter className="flex-shrink-0 border-t pt-4">
            <div className="flex w-full items-center justify-between">
              {/* Previous Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviousPage}
                disabled={currentPage <= 1 || isLoading || !!installingId} // Disable if on page 1, loading, or installing
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>
              {/* Page Indicator */}
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages} ({totalCount} items)
              </span>
              {/* Next Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={
                  currentPage >= totalPages || isLoading || !!installingId // Disable if on last page, loading, or installing
                }
              >
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
