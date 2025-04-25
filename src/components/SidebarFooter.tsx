import React from 'react';
import { LuGithub } from 'react-icons/lu';

interface SidebarFooterProps {
  version: string;
  commitInfo: string;
}

export const SidebarFooter: React.FC<SidebarFooterProps> = ({
  version,
  commitInfo,
}) => {
  return (
    <div className="flex items-center justify-center gap-2 border-t border-neutral-200 p-3 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
      <a
        href="https://github.com/pluveto/daan"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 hover:text-neutral-700 dark:hover:text-neutral-300"
      >
        <LuGithub className="h-4 w-4" />
        <div>
          Daan {version}
          {commitInfo !== 'N/A' ? `(${commitInfo.slice(0, 7)})` : ''}
        </div>
      </a>
    </div>
  );
};
