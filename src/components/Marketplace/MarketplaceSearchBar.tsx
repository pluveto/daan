import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import React from 'react';
import { LuLoader, LuSearch } from 'react-icons/lu';

interface MarketplaceSearchBarProps {
  type: 'miniapp' | 'character';
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onSearch: () => void;
  isLoading: boolean;
}

export const MarketplaceSearchBar: React.FC<MarketplaceSearchBarProps> = ({
  type,
  searchTerm,
  onSearchTermChange,
  onSearch,
  isLoading,
}) => {
  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      onSearch();
    }
  };

  return (
    <div className="mb-4 flex gap-2">
      <Input
        type="search"
        placeholder={`Search ${type === 'miniapp' ? 'Miniapps' : 'Characters'}... (by name, tag, author)`}
        value={searchTerm}
        onChange={(e) => onSearchTermChange(e.target.value)}
        onKeyPress={handleKeyPress}
        disabled={isLoading}
        className="flex-grow"
      />
      <Button onClick={onSearch} disabled={isLoading}>
        {isLoading ? (
          <LuLoader className="h-4 w-4 animate-spin" />
        ) : (
          <LuSearch className="h-4 w-4" />
        )}
        <span className="ml-2 hidden sm:inline">Search</span>
      </Button>
    </div>
  );
};
