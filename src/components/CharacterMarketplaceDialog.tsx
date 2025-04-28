// src/components/CharacterMarketplaceDialog.tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { MarketplaceItem, MarketplaceService } from '@/lib/MarketplaceService';
import { useAtom, useSetAtom } from 'jotai';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { CreateCharacterDto } from '@/services/ChatDataService';
import { installCharacterAtom, isCharacterMarketplaceOpenAtom } from '@/store';
import { MarketplaceItemGrid } from './Marketplace/MarketplaceItemGrid';
import { MarketplaceSearchBar } from './Marketplace/MarketplaceSearchBar';

interface CharacterMarketplaceDialogProps {
  // isOpen: boolean;
  // onOpenChange: (open: boolean) => void;
}

export const CharacterMarketplaceDialog: React.FC<
  CharacterMarketplaceDialogProps
> = (
  {
    // isOpen,
    // onOpenChange
  },
) => {
  const [isOpen, onOpenChange] = useAtom(isCharacterMarketplaceOpenAtom);

  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  const fetchItems = useCallback(async (query?: string) => {
    setIsLoading(true);
    setItems([]);
    try {
      const results = (await MarketplaceService.searchCharacters(query))
        .filter((item) => item.title.startsWith('[Character]'))
        .map((item) => ({
          ...item,
          title: item.title.replace('[Character]', '').trim(),
        }));

      setItems(results);
    } catch (error) {
      toast.error('Failed to load characters');
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

  const installCharacterAction = useSetAtom(installCharacterAtom);

  const handleInstall = async (item: MarketplaceItem) => {
    if (isInstalling) return;

    setIsInstalling(true);
    try {
      const details = await MarketplaceService.getCharacterDetails(item.id);
      if (!details?.definition) {
        throw new Error('Character definition is missing');
      }

      const createDto: CreateCharacterDto = {
        id: details.definition.id ?? undefined,
        name:
          details.definition.name || details.metadata?.name || details.title,
        icon: details.definition.icon || details.metadata?.icon || '👤',
        description:
          details.definition.description || details.metadata?.description || '',
        prompt: details.definition.prompt || '',
        model: details.definition.model || 'openai::gpt-4o',
        maxHistory: details.definition.maxHistory ?? 20,
      };

      await installCharacterAction(createDto);
      toast.success(`Character "${createDto.name}" installed successfully!`);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(`Failed to install character: ${error.message}`);
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] min-w-[70vh] flex-col">
        <DialogHeader>
          <DialogTitle>Character Marketplace</DialogTitle>
        </DialogHeader>

        <MarketplaceSearchBar
          type="character"
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
