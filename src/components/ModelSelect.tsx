import { GroupedModels, NamespacedModelId } from '@/types'; // Adjust path if needed
import React from 'react';
import { Label } from './ui/Label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './ui/Select'; // Adjust path if needed

interface ModelSelectProps {
  value: NamespacedModelId | '';
  onChange: (value: NamespacedModelId | '') => void;
  groupedModels: GroupedModels; // Use the actual type for groupedModels
  isModelInAvailableList: boolean;
  // disabled?: boolean;
}

// Use React.memo to prevent re-renders if props haven't changed shallowly
export const ModelSelect: React.FC<ModelSelectProps> = React.memo(
  ({ value, onChange, groupedModels, isModelInAvailableList }) => {
    return (
      <div>
        <Label
          className="mb-1 text-sm font-medium"
          htmlFor="chat-model-settings"
        >
          Model Override
        </Label>
        <Select
          onValueChange={onChange}
          value={value}
          // disabled={disabled} // Uncomment if you add the disabled prop
        >
          <SelectTrigger className="w-full" id="chat-model-settings">
            <SelectValue placeholder="Select model for this chat" />
          </SelectTrigger>
          <SelectContent>
            {groupedModels.map((group) => (
              <SelectGroup key={group.providerName}>
                <SelectLabel>{group.providerName}</SelectLabel>
                {group.models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
            {/* Logic for showing unavailable/no models remains */}
            {value && !isModelInAvailableList && (
              <SelectGroup>
                <SelectLabel className="text-destructive">
                  Current (Unavailable)
                </SelectLabel>
                <SelectItem
                  key={value}
                  value={value}
                  className="text-destructive"
                  // Prevent user from re-selecting the invalid one easily
                  // disabled
                >
                  {value.split('::')[1] || value}
                </SelectItem>
              </SelectGroup>
            )}
            {groupedModels.length === 0 && !value && (
              <SelectItem value="none" disabled>
                No models configured
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        {value && !isModelInAvailableList && (
          <p className="mt-1 text-xs text-destructive">
            Warning: The currently selected model is not available or enabled.
            Chatting may fail.
          </p>
        )}
        {!value && ( // Add feedback if model is somehow cleared
          <p className="mt-1 text-xs text-destructive">
            Warning: Model cannot be empty. Please select a model.
          </p>
        )}
      </div>
    );
  },
);

// Optional: Define displayName for better debugging in React DevTools
ModelSelect.displayName = 'ModelSelect';
