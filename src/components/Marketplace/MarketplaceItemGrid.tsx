import { ScrollArea } from '@/components/ui/ScrollArea';
import { MarketplaceItem } from '@/lib/MarketplaceService';
import React from 'react';
import { LuLoader } from 'react-icons/lu';
import { MarketplaceItemCard } from './MarketplaceItemCard'; // Assuming this exists

interface MarketplaceItemGridProps {
  items: MarketplaceItem[];
  isLoading: boolean;
  installingId: number | null;
  onViewDetails: (item: MarketplaceItem) => void;
  onInstall: (item: MarketplaceItem) => void;
}

export const MarketplaceItemGrid: React.FC<MarketplaceItemGridProps> = ({
  items,
  isLoading,
  installingId,
  onViewDetails,
  onInstall,
}) => {
  return (
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
            installingId={installingId}
            onViewDetails={() => onViewDetails(item)}
            onInstall={() => onInstall(item)} // Pass basic install handler
          />
        ))}
      </div>
    </ScrollArea>
  );
};
