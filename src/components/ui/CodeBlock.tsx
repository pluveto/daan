// src/components/CodeBlock.tsx
import { nightModeAtom } from '@/store/index.ts';
import copy from 'copy-to-clipboard';
import { useAtomValue } from 'jotai';
import React, { useState } from 'react';
import { LuCheck, LuCopy } from 'react-icons/lu';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  oneDark,
  oneLight,
} from 'react-syntax-highlighter/dist/esm/styles/prism';

// Choose themes

interface CodeBlockProps {
  children?: React.ReactNode;
  className?: string;
  // From react-markdown
  inline?: boolean;
  node?: any;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  children,
  className,
  inline,
  ...props
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const isNightMode = useAtomValue(nightModeAtom);
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : 'text'; // Default to 'text' if no language detected
  const codeString = String(children).replace(/\n$/, ''); // Clean up trailing newline

  const handleCopy = () => {
    copy(codeString);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 1500); // Reset icon after 1.5s
  };

  // For inline code, render differently
  if (inline || !className) {
    return (
      <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-sm dark:bg-neutral-700">
        {children}
      </code>
    );
  }

  // For block code
  return (
    <div className="code-block group relative my-2 text-sm">
      <div className="flex items-center justify-between rounded-t-md border-b border-neutral-300 bg-neutral-200 px-3 py-1 dark:border-neutral-600 dark:bg-neutral-800">
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {lang}
        </span>
        <button
          aria-label={isCopied ? 'Copied!' : 'Copy code'}
          className="rounded p-1 text-neutral-500 opacity-50 transition-opacity group-hover:opacity-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          onClick={handleCopy}
        >
          {isCopied ? (
            <LuCheck className="h-4 w-4 text-green-500" />
          ) : (
            <LuCopy className="h-4 w-4" />
          )}
        </button>
      </div>
      <SyntaxHighlighter
        {...props}
        PreTag="div"
        className="dark:!bg-code !m-0 overflow-x-auto rounded-b-md !bg-neutral-50 !p-3"
        language={lang}
        style={isNightMode ? oneDark : oneLight}
        wrapLongLines={true} // Or false, depending on preference
        customStyle={{
          borderRadius: '0 0 0.5rem 0.5rem',
        }}
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  );
};
