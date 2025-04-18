import { cn } from '@/lib/utils.ts';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as React from 'react';

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        'text-neutral-900 dark:text-neutral-100',
        className,
      )}
      data-slot="label"
      {...props}
    />
  );
}

export { Label };
