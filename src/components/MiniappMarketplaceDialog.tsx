// src/components/MiniappMarketplaceDialog.tsx
import { Button } from '@/components/ui/Button'; // Import Button for pagination
import {
  Dialog,
  DialogContent,
  DialogFooter, // Import DialogFooter for pagination controls
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { MarketplaceItem, MarketplaceService } from '@/lib/MarketplaceService';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { ArrowLeft, ArrowRight } from 'lucide-react'; // Icons for buttons
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  isMiniappMarketplaceOpenAtom,
  miniappDataServiceAtom,
  miniappsDefinitionAtom,
} from '@/store';
import { MarketplaceItemDetailsDialog } from './Marketplace/MarketplaceItemDetailsDialog';
import { MarketplaceItemGrid } from './Marketplace/MarketplaceItemGrid';
import { MarketplaceSearchBar } from './Marketplace/MarketplaceSearchBar';
import { useViewDetail } from './Marketplace/useViewDetail';

// Define items per page constant for easy modification
const ITEMS_PER_PAGE = 12; // Adjust as needed

export const MiniappMarketplaceDialog: React.FC = () => {
  const setDefinitions = useSetAtom(miniappsDefinitionAtom);
  const [isOpen, onOpenChange] = useAtom(isMiniappMarketplaceOpenAtom);
  const miniappDataService = useAtomValue(miniappDataServiceAtom);

  // State for items, search, loading, and installation
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [installingId, setInstallingId] = useState<number | null>(null);

  // State for pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Calculate total pages based on totalCount and ITEMS_PER_PAGE
  const totalPages = useMemo(
    () => Math.ceil(totalCount / ITEMS_PER_PAGE),
    [totalCount],
  );

  // Fetch items function, now includes pagination parameters
  const fetchItems = useCallback(
    async (query?: string, page: number = 1) => {
      setIsLoading(true);
      // Don't clear items immediately, clear only if it's page 1 or a new search
      if (page === 1) {
        setItems([]);
      }
      try {
        const { items: fetchedItems, totalCount: fetchedTotalCount } =
          await MarketplaceService.searchMiniapps(query, page, ITEMS_PER_PAGE);

        // Filter and map items (as before)
        const results = (fetchedItems || []) // Ensure fetchedItems is an array
          .filter((item) => item.title.startsWith('[Miniapp]'))
          .map((item) => ({
            ...item,
            title: item.title.replace('[Miniapp]', '').trim(),
          }));

        setItems(results);
        setTotalCount(fetchedTotalCount || 0); // Update total count
        setCurrentPage(page); // Set current page
      } catch (error) {
        console.error('Failed to load miniapps:', error);
        toast.error('Failed to load miniapps');
        setItems([]); // Clear items on error
        setTotalCount(0); // Reset total count on error
      } finally {
        setIsLoading(false);
      }
    },
    [], // No dependencies needed here as it reads state via arguments
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, fetchItems]); // Note: fetchItems is stable due to useCallback([])

  // Handler for initiating a search
  const handleSearch = () => {
    // Reset to page 1 when performing a new search
    fetchItems(searchTerm, 1);
  };

  // Handler for going to the next page
  const handleNextPage = () => {
    if (currentPage < totalPages && !isLoading) {
      fetchItems(searchTerm, currentPage + 1);
    }
  };

  // Handler for going to the previous page
  const handlePreviousPage = () => {
    if (currentPage > 1 && !isLoading) {
      fetchItems(searchTerm, currentPage - 1);
    }
  };

  // Handler for installing a miniapp (remains the same)
  const handleInstall = async (item: MarketplaceItem) => {
    if (installingId) return;

    setInstallingId(item.id);
    try {
      const details = await MarketplaceService.getMiniappDetails(item.id);
      if (!details?.definition) {
        throw new Error('Miniapp definition is missing');
      }

      const createDto = {
        name:
          details.definition.name || details.metadata?.name || details.title,
        icon: details.definition.icon || details.metadata?.icon || '📦',
        description:
          details.definition.description || details.metadata?.description || '',
        htmlContent:
          details.definition.htmlContent ||
          '<div>Error: HTML Content Missing</div>',
        configSchema: details.definition.configSchema || {},
        defaultConfig: details.definition.defaultConfig || {},
        defaultWindowSize: details.definition.defaultWindowSize || {
          width: 800,
          height: 600,
        },
        dependencies: details.definition.dependencies || [],
        permissions: details.definition.permissions || { useStorage: true },
        mcpDefinition: details.definition.mcpDefinition,
      };

      const savedDefinition =
        await miniappDataService.createDefinition(createDto);
      await miniappDataService.upsertConfig({
        definitionId: savedDefinition.id,
        config: savedDefinition.defaultConfig || {},
      });
      setDefinitions((prev) => [...prev, savedDefinition]);
      toast.success(
        `Miniapp "${createDto.name}" installed successfully. Enable it in the Miniapps Settings tab!`,
        { duration: 5000 },
      );
      onOpenChange(false); // Close dialog after successful install
    } catch (error: any) {
      console.error('Failed to install miniapp:', error);
      toast.error(`Failed to install miniapp: ${error.message}`);
    } finally {
      setInstallingId(null);
    }
  };

  const detail = useViewDetail({ type: 'miniapp' });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {/*
        Use flex flex-col and max-h to contain the dialog height.
        min-w ensures a reasonable minimum width.
      */}
      <DialogContent className="flex max-h-[80vh] min-w-[70vh] flex-col sm:max-w-[80vw]">
        <DialogHeader>
          <DialogTitle>Miniapp Marketplace</DialogTitle>
        </DialogHeader>

        {/* Search bar remains fixed at the top */}
        <MarketplaceSearchBar
          type="miniapp"
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          onSearch={handleSearch}
          isLoading={isLoading || !!installingId} // Disable search during loading/installing
        />

        <MarketplaceItemDetailsDialog
          isOpen={detail.isDetailsOpen}
          onOpenChange={detail.setIsDetailsOpen}
          item={detail.selectedItem}
          itemDetails={detail.selectedItemDetails}
          isLoading={detail.isDetailsLoading} // Show loading in dialog if details loading OR installing
          installingId={installingId}
          onInstall={handleInstall}
        />

        {/*
          This div contains the item grid and will scroll if content overflows.
          'flex-grow' makes it take available vertical space.
          'overflow-y-auto' enables vertical scrolling.
          'min-h-0' prevents flex item from overflowing its container in some cases.
        */}
        <div className="min-h-0 flex-grow overflow-y-auto pr-2 pt-4">
          <MarketplaceItemGrid
            items={items}
            isLoading={isLoading && items.length === 0} // Show loading state primarily on initial load
            onViewDetails={(item) => {
              detail.handleViewDetails(item);
            }}
            onInstall={handleInstall}
            installingId={installingId} // Pass installing state to potentially disable install buttons
          />
        </div>

        {/* Pagination controls in the footer, fixed at the bottom */}
        {totalCount > 0 && ( // Only show pagination if there are items
          <DialogFooter className="flex-shrink-0 border-t pt-4">
            <div className="flex w-full items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviousPage}
                disabled={currentPage <= 1 || isLoading || !!installingId}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages} ({totalCount} items)
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={
                  currentPage >= totalPages || isLoading || !!installingId
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
