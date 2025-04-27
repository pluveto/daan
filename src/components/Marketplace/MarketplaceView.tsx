// src/components/Marketplace/MarketplaceView.tsx
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { ScrollArea } from '@/components/ui/ScrollArea';
import {
  MarketplaceItem,
  MarketplaceService,
  ParsedMarketplaceItem,
} from '@/lib/MarketplaceService';
import { customCharactersAtom } from '@/store/characterData'; // Import atoms for installation
import { miniappsDefinitionAtom } from '@/store/miniapp'; // Import atoms for installation
import type { CustomCharacter, MiniappDefinition } from '@/types';
import DOMPurify from 'dompurify'; // pnpm add dompurify @types/dompurify - for safely rendering HTML description
import { useSetAtom } from 'jotai';
import React, { useCallback, useEffect, useState } from 'react';
import {
  LuDownload,
  LuGithub,
  LuInfo,
  LuLoader,
  LuSearch,
} from 'react-icons/lu';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { MarketplaceItemCard } from './MarketplaceItemCard';

interface MarketplaceViewProps {
  type: 'miniapp' | 'character';
}

export const MarketplaceView: React.FC<MarketplaceViewProps> = ({ type }) => {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(
    null,
  );
  const [selectedItemDetails, setSelectedItemDetails] =
    useState<ParsedMarketplaceItem | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const setMiniappDefs = useSetAtom(miniappsDefinitionAtom);
  const setCharacterDefs = useSetAtom(customCharactersAtom);

  const fetchItems = useCallback(
    async (query?: string) => {
      setIsLoading(true);
      setItems([]); // Clear previous items
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

  // Initial fetch on mount
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSearch = () => {
    fetchItems(searchTerm);
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  };

  const handleViewDetails = async (item: MarketplaceItem) => {
    setSelectedItem(item);
    setIsDetailsOpen(true);
    setIsDetailsLoading(true);
    setSelectedItemDetails(null); // Clear previous details
    try {
      const details =
        type === 'miniapp'
          ? await MarketplaceService.getMiniappDetails(item.id)
          : await MarketplaceService.getCharacterDetails(item.id);

      if (details) {
        setSelectedItemDetails(details);
      } else {
        // Error handled by service, close dialog?
        toast.error('Could not load item details.');
        setIsDetailsOpen(false);
      }
    } finally {
      setIsDetailsLoading(false);
    }
  };

  const handleInstall = async (
    itemOrDetails: MarketplaceItem | ParsedMarketplaceItem | null,
  ) => {
    if (!itemOrDetails) return;
    console.log(
      'Install requested for:',
      itemOrDetails.metadata?.name || itemOrDetails.title,
    );

    let details = itemOrDetails as ParsedMarketplaceItem;

    // Fetch details if only basic item is available
    if (!details.definition) {
      setIsDetailsLoading(true); // Show loading indicator if needed
      toast.info(
        `Workspaceing details for ${details.metadata?.name || details.title}...`,
      );
      const fetchedDetails =
        type === 'miniapp'
          ? await MarketplaceService.getMiniappDetails(details.id)
          : await MarketplaceService.getCharacterDetails(details.id);
      setIsDetailsLoading(false);
      if (!fetchedDetails?.definition) {
        toast.error(`Failed to fetch details for installation.`);
        return;
      }
      details = fetchedDetails;
    }

    if (!details.definition) {
      toast.error('Cannot install: Definition data is missing.');
      return;
    }

    const definitionToInstall = details.definition;
    const installName =
      definitionToInstall.name || details.metadata?.name || details.title;

    // Generate new unique ID on install
    const newId = uuidv4();

    try {
      if (type === 'miniapp') {
        const newMiniappDef: MiniappDefinition = {
          // --- Map fields carefully, ensure required ones exist ---
          id: newId,
          name: installName,
          icon: definitionToInstall.icon || details.metadata?.icon || '📦',
          description:
            definitionToInstall.description ||
            details.metadata?.description ||
            '',
          htmlContent:
            definitionToInstall.htmlContent ||
            '<div>Error: HTML Content Missing</div>',
          configSchema: definitionToInstall.configSchema || {},
          defaultConfig: definitionToInstall.defaultConfig || {},
          defaultWindowSize: definitionToInstall.defaultWindowSize || {
            width: 800,
            height: 600,
          },
          enabled: false, // Install disabled by default
          dependencies: definitionToInstall.dependencies || [],
          permissions: definitionToInstall.permissions || { useStorage: true }, // Sensible default perms
          mcpDefinition: definitionToInstall.mcpDefinition, // Include if present
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        // Basic validation before adding
        if (!newMiniappDef.htmlContent)
          throw new Error('HTML content is missing.');

        setMiniappDefs((prev) => [...prev, newMiniappDef]);
        toast.success(`Miniapp "${installName}" installed successfully!`);
      } else {
        // Character
        const newCharacterDef: CustomCharacter = {
          // --- Map fields carefully ---
          id: newId,
          name: installName,
          icon: definitionToInstall.icon || details.metadata?.icon || '👤',
          description:
            definitionToInstall.description ||
            details.metadata?.description ||
            '',
          prompt: definitionToInstall.prompt || '',
          model: definitionToInstall.model || 'openai::gpt-4o', // Fallback model?
          maxHistory: definitionToInstall.maxHistory ?? 20, // Default max history
          createdAt: Date.now(),
          updatedAt: Date.now(),
          sort: Date.now(), // Use timestamp for initial sort order
        };
        // Basic validation
        if (!newCharacterDef.prompt)
          throw new Error('Character prompt is missing.');

        setCharacterDefs((prev) => [...prev, newCharacterDef]);
        toast.success(`Character "${installName}" installed successfully!`);
      }
      // Close details dialog if open after install
      setIsDetailsOpen(false);
    } catch (error: any) {
      console.error('Installation error:', error);
      toast.error(`Failed to install ${installName}: ${error.message}`);
    }
  };

  return (
    <div className="flex h-full flex-col p-4">
      {/* Search Bar */}
      <div className="mb-4 flex gap-2">
        <Input
          type="search"
          placeholder={`Search ${type === 'miniapp' ? 'Miniapps' : 'Characters'}... (by name, tag, author)`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={isLoading}
          className="flex-grow"
        />
        <Button onClick={handleSearch} disabled={isLoading}>
          {isLoading ? (
            <LuLoader className="h-4 w-4 animate-spin" />
          ) : (
            <LuSearch className="h-4 w-4" />
          )}
          <span className="ml-2 hidden sm:inline">Search</span>
        </Button>
      </div>

      {/* Item Grid / List */}
      <ScrollArea className="flex-grow">
        {isLoading && items.length === 0 && (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            <LuLoader className="mr-2 h-5 w-5 animate-spin" /> Loading items...
          </div>
        )}
        {!isLoading && items.length === 0 && (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            No items found matching your criteria. Check the labels/format on
            GitHub issues.
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <MarketplaceItemCard
              key={item.id}
              item={item}
              onViewDetails={() => handleViewDetails(item)}
              onInstall={() => handleInstall(item)}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <span className="mr-3 text-2xl">
                {selectedItemDetails?.metadata?.icon ||
                  selectedItem?.metadata?.icon ||
                  '🧩'}
              </span>
              {selectedItemDetails?.metadata?.name ||
                selectedItem?.title ||
                'Loading...'}
            </DialogTitle>
            <DialogDescription>
              {selectedItemDetails?.metadata?.description ||
                'Loading description...'}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-grow pr-6">
            {' '}
            {/* Added padding right for scrollbar */}
            {isDetailsLoading && (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                <LuLoader className="mr-2 h-5 w-5 animate-spin" /> Loading
                details...
              </div>
            )}
            {!isDetailsLoading && !selectedItemDetails && (
              <div className="flex h-40 items-center justify-center text-destructive">
                <LuInfo className="mr-2 h-5 w-5" /> Failed to load details.
              </div>
            )}
            {selectedItemDetails && (
              <div className="prose prose-sm dark:prose-invert max-w-none py-4">
                {' '}
                {/* Basic prose styling */}
                {/* Render Author, Version, License etc. */}
                <p className="text-xs text-muted-foreground">
                  By:{' '}
                  {selectedItemDetails.metadata?.author ||
                    selectedItemDetails.githubUser?.login ||
                    'Unknown'}{' '}
                  | Version: {selectedItemDetails.metadata?.version || 'N/A'} |
                  License: {selectedItemDetails.metadata?.license || 'N/A'}
                </p>
                {/* Render sanitized HTML description */}
                {selectedItemDetails.longDescriptionHtml ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(
                        selectedItemDetails.longDescriptionHtml,
                      ),
                    }}
                  />
                ) : (
                  <p>
                    <em>No detailed description provided.</em>
                  </p>
                )}
                {/* Optionally show definition preview (carefully) */}
                {/* <details> <summary>View Definition JSON</summary> <pre><code>{JSON.stringify(selectedItemDetails.definition, null, 2)}</code></pre> </details> */}
              </div>
            )}
          </ScrollArea>

          <DialogFooter className="mt-4 flex-shrink-0">
            <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
              Close
            </Button>
            <Button variant="secondary" asChild>
              <a
                href={selectedItem?.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <LuGithub className="mr-2 h-4 w-4" /> View on GitHub
              </a>
            </Button>
            <Button
              onClick={() => handleInstall(selectedItemDetails)}
              disabled={isDetailsLoading || !selectedItemDetails?.definition}
            >
              <LuDownload className="mr-2 h-4 w-4" /> Install
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
