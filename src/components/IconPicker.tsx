import { commonEmojis } from '@/types';
import React, { useCallback } from 'react';
import { Input } from './ui/Input';
import { Label } from './ui/Label';

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
  label?: string;
  id?: string;
}

const IconPicker: React.FC<IconPickerProps> = React.memo(
  ({ value, onChange, label = 'Icon (Emoji)', id = 'chat-icon-settings' }) => {
    const handleEmojiSelect = useCallback(
      (selectedEmoji: string) => {
        onChange(selectedEmoji);
      },
      [onChange],
    );

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.value);
      },
      [onChange],
    );

    return (
      <div>
        <Label className="mb-1 text-sm font-medium" htmlFor={id}>
          {label}
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id={id}
            className="w-20 p-1 text-center text-xl"
            maxLength={2}
            value={value}
            onChange={handleInputChange}
            type="text"
            aria-label="Chat icon input"
          />
          <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto rounded border p-1">
            {commonEmojis.map((emoji) => (
              <button
                aria-label={`Select emoji ${emoji}`}
                className="flex h-8 w-8 items-center justify-center rounded p-1 text-xl transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700"
                key={emoji}
                onClick={() => handleEmojiSelect(emoji)}
                title={`Select ${emoji}`}
                type="button"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  },
);

IconPicker.displayName = 'IconPicker';

export { IconPicker };
