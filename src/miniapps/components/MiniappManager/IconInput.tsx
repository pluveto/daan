// src/miniapps/components/MiniappManager/IconInput.tsx
import { Input } from '@/components/ui/Input';
import React from 'react';

interface IconInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}

// Basic input expecting an emoji or short text
export function IconInput({ id, value, onChange }: IconInputProps) {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Allow only 1 or 2 characters, suitable for most emojis
    onChange(event.target.value.slice(0, 2));
  };

  return (
    <Input
      id={id}
      type="text"
      value={value}
      onChange={handleChange}
      maxLength={2}
      className="w-16 text-center text-xl" // Style for icon visibility
      placeholder="🚀"
    />
  );
}
