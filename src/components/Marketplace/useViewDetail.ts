import {
  MarketplaceItem,
  MarketplaceService,
  ParsedMarketplaceItem,
} from '@/lib/MarketplaceService';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

export function useViewDetail(props: { type: 'character' | 'miniapp' }) {
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(
    null,
  );
  const [selectedItemDetails, setSelectedItemDetails] =
    useState<ParsedMarketplaceItem | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);

  const handleViewDetails = useCallback(
    async (item: MarketplaceItem) => {
      setSelectedItem(item);
      setSelectedItemDetails(null);
      setIsDetailsOpen(true);
      setIsDetailsLoading(true);
      try {
        const details =
          props.type === 'miniapp'
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
    },
    [props.type],
  );

  return {
    isDetailsOpen,
    setIsDetailsOpen,
    selectedItem,
    selectedItemDetails,
    isDetailsLoading,
    handleViewDetails,
  };
}
