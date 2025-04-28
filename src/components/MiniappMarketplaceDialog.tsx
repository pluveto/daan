// src/components/MiniappMarketplaceDialog.tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { MarketplaceItem, MarketplaceService } from '@/lib/MarketplaceService';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  isMiniappMarketplaceOpenAtom,
  miniappDataServiceAtom,
  miniappsDefinitionAtom,
} from '@/store';
import { MarketplaceItemGrid } from './Marketplace/MarketplaceItemGrid';
import { MarketplaceSearchBar } from './Marketplace/MarketplaceSearchBar';

interface MiniappMarketplaceDialogProps {
  // isOpen: boolean;
  // onOpenChange: (open: boolean) => void;
}

export const MiniappMarketplaceDialog: React.FC<
  MiniappMarketplaceDialogProps
> = (
  {
    // isOpen,
    // onOpenChange
  },
) => {
  const setDefinitions = useSetAtom(miniappsDefinitionAtom);

  const [isOpen, onOpenChange] = useAtom(isMiniappMarketplaceOpenAtom);
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const miniappDataService = useAtomValue(miniappDataServiceAtom);

  const fetchItems = useCallback(async (query?: string) => {
    setIsLoading(true);
    setItems([]);
    try {
      const results = (await MarketplaceService.searchMiniapps(query))
        .filter((item) => item.title.startsWith('[Miniapp]'))
        .map((item) => ({
          ...item,
          title: item.title.replace('[Miniapp]', '').trim(),
        }));
      setItems(results);
    } catch (error) {
      toast.error('Failed to load miniapps');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchItems();
    }
  }, [isOpen, fetchItems]);

  const handleSearch = () => {
    fetchItems(searchTerm);
  };

  const handleInstall = async (item: MarketplaceItem) => {
    if (isInstalling) return;

    setIsInstalling(true);
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
      onOpenChange(false);
    } catch (error: any) {
      toast.error(`Failed to install miniapp: ${error.message}`);
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] min-w-[70vh] flex-col">
        <DialogHeader>
          <DialogTitle>Miniapp Marketplace</DialogTitle>
        </DialogHeader>

        <MarketplaceSearchBar
          type="miniapp"
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          onSearch={handleSearch}
          isLoading={isLoading || isInstalling}
        />

        <MarketplaceItemGrid
          items={items}
          isLoading={isLoading}
          onViewDetails={() => {}}
          onInstall={handleInstall}
        />
      </DialogContent>
    </Dialog>
  );
};
