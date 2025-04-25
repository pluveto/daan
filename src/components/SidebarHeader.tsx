// src/components/SidebarHeader.tsx
import React from 'react';
import { LuSettings } from 'react-icons/lu';
import { Button } from './ui/Button';

interface SidebarHeaderProps {
  appName: string;
  slogan: string;
  logoUrl: string;
  onSettingsClick: () => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  appName,
  slogan,
  logoUrl,
  onSettingsClick,
}) => {
  return (
    <div className="border-b border-neutral-200 p-4 dark:border-neutral-700">
      <div className="flex items-center gap-3 leading-none">
        <img
          alt={`${appName} Logo`}
          className="h-10 w-10 flex-shrink-0 rounded-md object-contain"
          src={logoUrl}
        />
        <div className="flex flex-col items-start justify-center overflow-hidden">
          <h1 className="truncate text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {appName}
          </h1>
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
            {slogan}
          </p>
        </div>
        <Button
          aria-label="System Settings"
          className="ml-auto flex-shrink-0 hover:bg-neutral-200 dark:hover:bg-neutral-800"
          onClick={onSettingsClick}
          size="icon"
          variant="ghost"
        >
          <LuSettings className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};
