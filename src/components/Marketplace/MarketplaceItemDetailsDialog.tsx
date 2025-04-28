import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { ScrollArea } from '@/components/ui/ScrollArea';
import {
  MarketplaceItem,
  ParsedMarketplaceItem,
} from '@/lib/MarketplaceService';
import DOMPurify from 'dompurify';
import React from 'react';
import { LuDownload, LuGithub, LuInfo, LuLoader } from 'react-icons/lu';

interface MarketplaceItemDetailsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  item: MarketplaceItem | null; // Basic item for fallback display while loading details
  itemDetails: ParsedMarketplaceItem | null;
  isLoading: boolean;
  onInstall: (details: ParsedMarketplaceItem) => void;
}

export const MarketplaceItemDetailsDialog: React.FC<
  MarketplaceItemDetailsDialogProps
> = ({ isOpen, onOpenChange, item, itemDetails, isLoading, onInstall }) => {
  const handleInstallClick = () => {
    if (itemDetails) {
      onInstall(itemDetails);
    }
  };

  const title = itemDetails?.metadata?.name || item?.title || 'Loading...';
  const icon = itemDetails?.metadata?.icon || item?.metadata?.icon || '🧩';
  const shortDescription =
    itemDetails?.metadata?.description || 'Loading description...';
  const githubUrl = item?.url; // URL comes from the basic item typically

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <span className="mr-3 text-2xl">{icon}</span>
            {title}
          </DialogTitle>
          <DialogDescription>{shortDescription}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-grow pr-6">
          {' '}
          {/* Added padding right for scrollbar */}
          {isLoading && (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <LuLoader className="mr-2 h-5 w-5 animate-spin" /> Loading
              details...
            </div>
          )}
          {!isLoading && !itemDetails && (
            <div className="flex h-40 items-center justify-center text-destructive">
              <LuInfo className="mr-2 h-5 w-5" /> Failed to load details.
            </div>
          )}
          {itemDetails && (
            <div className="prose prose-sm dark:prose-invert max-w-none py-4">
              {' '}
              {/* Basic prose styling */}
              <p className="text-xs text-muted-foreground">
                By:{' '}
                {itemDetails.metadata?.author ||
                  itemDetails.githubUser?.login ||
                  'Unknown'}{' '}
                | Version: {itemDetails.metadata?.version || 'N/A'} | License:{' '}
                {itemDetails.metadata?.license || 'N/A'}
              </p>
              {itemDetails.longDescriptionHtml ? (
                <div
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(itemDetails.longDescriptionHtml),
                  }}
                />
              ) : (
                <p>
                  <em>No detailed description provided.</em>
                </p>
              )}
              {/* Optionally show definition preview */}
              {/* <details> <summary>View Definition JSON</summary> <pre><code>{JSON.stringify(itemDetails.definition, null, 2)}</code></pre> </details> */}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="mt-4 flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {githubUrl && (
            <Button variant="secondary" asChild>
              <a href={githubUrl} target="_blank" rel="noopener noreferrer">
                <LuGithub className="mr-2 h-4 w-4" /> View on GitHub
              </a>
            </Button>
          )}
          <Button
            onClick={handleInstallClick}
            disabled={isLoading || !itemDetails?.definition}
          >
            <LuDownload className="mr-2 h-4 w-4" /> Install
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
