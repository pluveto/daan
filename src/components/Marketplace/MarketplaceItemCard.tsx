// src/components/Marketplace/MarketplaceItemCard.tsx
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar'; // Assuming Avatar exists
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import type { MarketplaceItem } from '@/lib/MarketplaceService';
import { formatDateLabel } from '@/utils/dateUtils';
import React from 'react';
import { LuCalendar, LuDownload, LuEye, LuTag, LuUser } from 'react-icons/lu';

interface MarketplaceItemCardProps {
  item: MarketplaceItem;
  onViewDetails: (item: MarketplaceItem) => void;
  onInstall: (item: MarketplaceItem) => void; // Simplified install trigger
}

export const MarketplaceItemCard: React.FC<MarketplaceItemCardProps> = ({
  item,
  onViewDetails,
  onInstall,
}) => {
  const { metadata, title, githubUser, updatedAt, labels } = item;
  const displayIcon =
    metadata?.icon || (labels.includes(MINIAPP_LABEL) ? '📦' : '👤');
  const displayName = metadata?.name || title;
  const displayDesc = metadata?.description || 'No description provided.';
  const displayAuthor = metadata?.author || githubUser?.login || 'Unknown';
  const displayTags = metadata?.tags || [];

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">
              <span className="mr-2 text-xl">{displayIcon}</span>
              {displayName}
            </CardTitle>
            <CardDescription className="mt-1 flex items-center text-xs text-muted-foreground">
              <LuUser className="mr-1 h-3 w-3" /> By {displayAuthor}
              <span className="mx-2">|</span>
              <LuCalendar className="mr-1 h-3 w-3" /> Updated{' '}
              {formatDateLabel(updatedAt)}
            </CardDescription>
          </div>
          {githubUser?.avatarUrl && (
            <Avatar className="h-8 w-8">
              <AvatarImage src={githubUser.avatarUrl} alt={displayAuthor} />
              <AvatarFallback>{displayAuthor.substring(0, 1)}</AvatarFallback>
            </Avatar>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-grow">
        <p className="text-sm text-muted-foreground">{displayDesc}</p>
        {displayTags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            <LuTag className="mr-1 h-4 w-4 text-muted-foreground" />
            {displayTags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between gap-2 pt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onViewDetails(item)}
          title="View Details"
        >
          <LuEye className="mr-1 h-4 w-4" /> Details
        </Button>
        {/* Simplified Install Button */}
        <Button size="sm" onClick={() => onInstall(item)} title="Install">
          <LuDownload className="mr-1 h-4 w-4" /> Install
        </Button>
        {/* Optional: Link to GitHub Issue */}
        {/* <Button variant="outline" size="icon" asChild> <a href={item.url} target="_blank" rel="noopener noreferrer"><LuGithub /></a> </Button> */}
      </CardFooter>
    </Card>
  );
};

// Define these constants if not imported
const MINIAPP_LABEL = 'market-miniapp';
// const CHARACTER_LABEL = 'market-character';
