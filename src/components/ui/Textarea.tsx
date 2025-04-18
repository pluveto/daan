import { cn } from '@/lib/utils.ts';
import * as React from 'react';

type TextareaVariant = 'default' | 'flat';

interface TextareaProps extends React.ComponentProps<'textarea'> {
  variant?: TextareaVariant;
}

function Textarea({ className, variant = 'default', ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        'placeholder:text-muted-foreground focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 flex field-sizing-content min-h-16 w-full rounded-md px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        variant === 'default' &&
          'border-input dark:bg-input/30 border bg-transparent',
        variant === 'flat' && 'border-0 bg-transparent',
        className,
      )}
      data-slot="textarea"
      {...props}
    />
  );
}

export { Textarea };
