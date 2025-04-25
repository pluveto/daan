import { CustomCharacter } from '@/types';
import React from 'react';
import { LuEllipsis, LuPlus } from 'react-icons/lu';
import { Button } from './ui/Button';

interface CharacterSectionProps {
  characters: CustomCharacter[];
  onAddCharacterClick: () => void;
  onInstantiateCharacterClick: (character: CustomCharacter) => void;
}

export const CharacterSection: React.FC<CharacterSectionProps> = ({
  characters,
  onAddCharacterClick,
  onInstantiateCharacterClick,
}) => {
  return (
    <>
      <div className="flex items-center px-3 pt-2 pb-1 text-xs text-neutral-500 dark:text-neutral-400">
        <div className="flex-1 font-medium tracking-wider uppercase">
          Characters
        </div>
        <Button
          variant="ghost"
          size="xs"
          onClick={onAddCharacterClick}
          aria-label="Open Character Editor"
        >
          <LuEllipsis className="h-4 w-4" />
        </Button>
      </div>
      <div className="mb-2 flex max-h-24 flex-wrap gap-1 overflow-y-auto rounded border-b p-2 dark:border-neutral-700">
        <Button
          aria-label="Create New Character"
          className="flex h-8 w-8 items-center justify-center rounded border border-dashed bg-neutral-100 p-1 text-neutral-600 hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-800/30 dark:text-neutral-400 dark:hover:bg-neutral-800/50"
          key="add-character"
          onClick={onAddCharacterClick}
          title="Create New Character"
          size="icon"
          variant="ghost"
        >
          <LuPlus className="h-4 w-4" />
        </Button>
        {characters.map((item) => (
          <Button
            aria-label={`Select ${item.name}`}
            className="flex h-8 w-8 items-center justify-center rounded bg-neutral-200 p-1 text-xl text-neutral-800 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            key={item.id}
            onClick={() => onInstantiateCharacterClick(item)}
            title={`Instantiate ${item.name}`}
            size="icon"
            variant="ghost"
          >
            {item.icon}
          </Button>
        ))}
      </div>
    </>
  );
};
