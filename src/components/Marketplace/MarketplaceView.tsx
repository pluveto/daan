// src/components/Marketplace/MarketplaceView.tsx

// *** Existing Imports ***
import {
  MarketplaceItem,
  MarketplaceService,
  ParsedMarketplaceItem,
} from '@/lib/MarketplaceService';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { CustomCharacter } from '@/types'; // Keep Character type for structure
// Import the service interface DTO for Miniapps
import type { CreateMiniappDefinitionDto } from '@/services/MiniappDataService';

type CreateCharacterDto = Omit<
  CustomCharacter,
  'id' | 'createdAt' | 'updatedAt' | 'sort' // Fields managed by the service
>;

import { chatDataServiceAtom, miniappDataServiceAtom } from '@/store';
import { useAtomValue } from 'jotai';
import { MarketplaceItemDetailsDialog } from './MarketplaceItemDetailsDialog';
import { MarketplaceItemGrid } from './MarketplaceItemGrid';
import { MarketplaceSearchBar } from './MarketplaceSearchBar';
// Assuming MarketplaceSearchBar, MarketplaceItemGrid, MarketplaceItemDetailsDialog exist as previously refactored

interface MarketplaceViewProps {
  type: 'miniapp' | 'character';
}

export const MarketplaceView: React.FC<MarketplaceViewProps> = ({ type }) => {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false); // Loading search results
  const [isDetailsLoading, setIsDetailsLoading] = useState(false); // Loading item details
  const [isInstalling, setIsInstalling] = useState(false); // Loading state during install
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(
    null,
  );
  const [selectedItemDetails, setSelectedItemDetails] =
    useState<ParsedMarketplaceItem | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const chatDataService = useAtomValue(chatDataServiceAtom);
  const miniappDataService = useAtomValue(miniappDataServiceAtom);

  const fetchItems = useCallback(
    async (query?: string) => {
      setIsLoading(true);
      setItems([]);
      try {
        const results =
          type === 'miniapp'
            ? await MarketplaceService.searchMiniapps(query)
            : await MarketplaceService.searchCharacters(query);
        setItems(results);
      } catch (error) {
        // Error handled by service toast
      } finally {
        setIsLoading(false);
      }
    },
    [type],
  );

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]); // Refetch when type changes

  const handleSearch = () => {
    fetchItems(searchTerm);
  };

  const handleViewDetails = async (item: MarketplaceItem) => {
    setSelectedItem(item);
    setSelectedItemDetails(null);
    setIsDetailsOpen(true);
    setIsDetailsLoading(true);
    try {
      const details =
        type === 'miniapp'
          ? await MarketplaceService.getMiniappDetails(item.id)
          : await MarketplaceService.getCharacterDetails(item.id);

      if (details) {
        setSelectedItemDetails(details);
      } else {
        toast.error('Could not load item details.');
        setIsDetailsOpen(false); // Close dialog on detail load failure
      }
    } catch (error) {
      console.error('Error fetching details:', error);
      toast.error('Failed to load item details.');
      setIsDetailsOpen(false);
    } finally {
      setIsDetailsLoading(false);
    }
  };

  const handleInstall = async (
    itemOrDetails: MarketplaceItem | ParsedMarketplaceItem | null,
  ) => {
    if (!itemOrDetails || isInstalling) return;

    setIsInstalling(true);
    let details: ParsedMarketplaceItem | null = null;
    const originalItemId = itemOrDetails.id; // Keep track of the marketplace ID

    try {
      // --- 1. Ensure we have full details ---
      if ('definition' in itemOrDetails && itemOrDetails.definition) {
        details = itemOrDetails;
      } else {
        toast.info(`Workspaceing details for ${itemOrDetails.title}...`);
        setIsDetailsLoading(true); // Use details loading state visually
        details =
          type === 'miniapp'
            ? await MarketplaceService.getMiniappDetails(originalItemId)
            : await MarketplaceService.getCharacterDetails(originalItemId);
        setIsDetailsLoading(false);
      }

      // --- 2. Validate details ---
      if (!details?.definition) {
        throw new Error('Definition data is missing or incomplete.');
      }

      const definitionFromMarketplace = details.definition;
      const installName =
        definitionFromMarketplace.name ||
        details.metadata?.name ||
        details.title;

      // --- 3. Persist using the appropriate service ---
      if (type === 'miniapp') {
        // Prepare DTO for the service
        const createDto: CreateMiniappDefinitionDto = {
          // Map fields from marketplace definition to our DTO
          // Exclude id, createdAt, updatedAt (service handles these)
          name: installName,
          icon:
            definitionFromMarketplace.icon || details.metadata?.icon || '📦',
          description:
            definitionFromMarketplace.description ||
            details.metadata?.description ||
            '',
          htmlContent:
            definitionFromMarketplace.htmlContent ||
            '<div>Error: HTML Content Missing</div>', // Ensure validation
          configSchema: definitionFromMarketplace.configSchema || {},
          defaultConfig: definitionFromMarketplace.defaultConfig || {},
          defaultWindowSize: definitionFromMarketplace.defaultWindowSize || {
            width: 800,
            height: 600,
          },
          dependencies: definitionFromMarketplace.dependencies || [],
          permissions: definitionFromMarketplace.permissions || {
            useStorage: true,
          },
          mcpDefinition: definitionFromMarketplace.mcpDefinition,
          // Optionally pass the marketplace ID if the service needs it for linking/updates
          // marketplaceId: originalItemId
        };

        // Basic validation before calling service
        if (
          !createDto.htmlContent ||
          createDto.htmlContent === '<div>Error: HTML Content Missing</div>'
        ) {
          throw new Error('HTML content is missing.');
        }

        // Call the service to create the definition
        const savedDefinition =
          await miniappDataService.createDefinition(createDto);

        // Also save the default config
        await miniappDataService.upsertConfig({
          definitionId: savedDefinition.id,
          config: savedDefinition.defaultConfig || {},
        });

        // TODO: Update UI - ideally refetch or use a more sophisticated state management
        // Simple approach: Manually update atom (if still used)
        // setMiniappDefs((prev) => [...prev, savedDefinition]);

        toast.success(`Miniapp "${installName}" installed successfully!`);
      } else {
        // Character
        // Prepare DTO for the character service
        const createDto: CreateCharacterDto = {
          // Map fields, excluding id, createdAt, updatedAt, sort
          name: installName,
          icon:
            definitionFromMarketplace.icon || details.metadata?.icon || '👤',
          description:
            definitionFromMarketplace.description ||
            details.metadata?.description ||
            '',
          prompt: definitionFromMarketplace.prompt || '',
          model: definitionFromMarketplace.model || 'openai::gpt-4o', // Fallback model?
          maxHistory: definitionFromMarketplace.maxHistory ?? 20, // Default max history
          // Add any other fields expected by CustomCharacter/CreateCharacterDto
        };

        // Basic validation
        if (!createDto.prompt) {
          throw new Error('Character prompt is missing.');
        }

        // Call the character service
        await chatDataService.createCharacter(createDto);

        // TODO: Update UI
        // Simple approach: Manually update atom (if still used)
        // setCharacterDefs((prev) => [...prev, savedCharacter]);

        toast.success(`Character "${installName}" installed successfully!`);
      }

      // --- 4. Post-Install Actions ---
      setIsDetailsOpen(false); // Close details dialog if open
    } catch (error: any) {
      console.error('Installation error:', error);
      const installName = itemOrDetails.metadata?.name || itemOrDetails.title;
      toast.error(
        `Failed to install ${installName || 'item'}: ${error.message}`,
      );
      // Ensure loading states are reset on error
      setIsDetailsLoading(false);
    } finally {
      setIsInstalling(false); // Reset installing state
    }
  };

  // Handles installation request specifically from the Details Dialog
  const handleInstallFromDialog = (details: ParsedMarketplaceItem | null) => {
    handleInstall(details);
  };

  // Handles installation request specifically from an Item Card
  const handleInstallFromCard = (item: MarketplaceItem) => {
    handleInstall(item);
  };

  // --- Render Logic ---
  // Use the previously refactored components:
  // MarketplaceSearchBar, MarketplaceItemGrid, MarketplaceItemDetailsDialog

  return (
    <div className="flex h-full flex-col p-4">
      <MarketplaceSearchBar
        type={type}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        onSearch={handleSearch}
        isLoading={isLoading || isInstalling} // Disable search while loading list or installing
      />

      <MarketplaceItemGrid
        items={items}
        isLoading={isLoading} // Loading state for the grid itself
        onViewDetails={handleViewDetails}
        onInstall={handleInstallFromCard}
      />

      <MarketplaceItemDetailsDialog
        isOpen={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
        item={selectedItem}
        itemDetails={selectedItemDetails}
        isLoading={isDetailsLoading || isInstalling} // Show loading in dialog if details loading OR installing
        onInstall={handleInstallFromDialog}
      />
    </div>
  );
};
