// src/settings/ModelEditor.tsx
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Label } from '@/components/ui/Label';
import { ValidatedInput } from '@/components/ui/ValidatedInput'; // Import the new component
import { ApiModelConfig, NamespacedModelId } from '@/types';
import { memo, useCallback } from 'react';
import { LuFile, LuImage, LuTrash2 } from 'react-icons/lu';

interface ModelEditorProps {
  providerId: string; // For generating unique IDs and placeholder
  providerIndex: number;
  model: ApiModelConfig;
  modelIndex: number;
  onUpdateModel: (
    providerIndex: number,
    modelIndex: number,
    field: keyof ApiModelConfig,
    value: any,
  ) => void;
  onRemoveModel: (providerIndex: number, modelIndex: number) => void;
}

// --- Validation Functions specific to Models ---
const validateModelName = (value: string): string | null => {
  if (!value) return 'Model display name cannot be empty.';
  return null;
};

const validateModelId = (value: string): string | null => {
  if (!value) return 'Model ID cannot be empty.';
  if (!/::/.test(value))
    return "Model ID must contain '::' (e.g., provider::model-name).";
  // Add more specific checks if needed (e.g., no spaces)
  if (/\s/.test(value)) return 'Model ID cannot contain spaces.';
  return null;
};

const parseTrimmedString = (value: string): string => value; // Simple parser for string fields

// --- Component ---
const ModelEditor = memo(
  ({
    providerId,
    providerIndex,
    model,
    modelIndex,
    onUpdateModel,
    onRemoveModel,
  }: ModelEditorProps) => {
    // --- Callbacks for ValidatedInput onSave ---
    const handleSaveName = useCallback(
      (value: string) => {
        onUpdateModel(providerIndex, modelIndex, 'name', value);
      },
      [onUpdateModel, providerIndex, modelIndex],
    );

    const handleSaveId = useCallback(
      (value: NamespacedModelId) => {
        onUpdateModel(providerIndex, modelIndex, 'id', value);
      },
      [onUpdateModel, providerIndex, modelIndex],
    );

    // --- Direct Callbacks for Checkboxes (No validation needed) ---
    const handleFileUploadChange = useCallback(
      (checked: boolean | 'indeterminate') => {
        onUpdateModel(
          providerIndex,
          modelIndex,
          'supportsFileUpload',
          !!checked,
        );
      },
      [onUpdateModel, providerIndex, modelIndex],
    );

    const handleImageUploadChange = useCallback(
      (checked: boolean | 'indeterminate') => {
        onUpdateModel(
          providerIndex,
          modelIndex,
          'supportsImageUpload',
          !!checked,
        );
      },
      [onUpdateModel, providerIndex, modelIndex],
    );

    const handleRemoveClick = useCallback(() => {
      onRemoveModel(providerIndex, modelIndex);
    }, [onRemoveModel, providerIndex, modelIndex]);

    // Unique IDs for labels/inputs
    const baseId = `p${providerIndex}-m${modelIndex}`;

    return (
      <div className="bg-muted/30 hover:bg-muted/60 flex flex-col gap-4 rounded p-3 text-xs">
        {/* Increased gap slightly */}
        {/* Model Name & ID Inputs using ValidatedInput */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ValidatedInput
            id={`${baseId}-name`}
            label="Display Name"
            initialValue={model.name}
            onSave={handleSaveName}
            validate={validateModelName}
            parse={parseTrimmedString}
            placeholder="User-friendly name"
            inputClassName="h-7 text-xs" // Maintain size
          />
          <ValidatedInput
            id={`${baseId}-id`}
            label="Model ID (namespace::id)"
            initialValue={model.id}
            onSave={handleSaveId}
            validate={validateModelId}
            parse={parseTrimmedString}
            placeholder={`${providerId}::your-model-id`}
            inputClassName="h-7 text-xs" // Maintain size
          />
        </div>
        {/* Model Flags & Delete */}
        <div className="flex items-center justify-between gap-4 pt-1">
          {/* Added slight top padding */}
          <div className="flex items-center gap-3">
            {/* File Upload Flag */}
            <div className="flex items-center space-x-1.5">
              <Checkbox
                id={`${baseId}-file`}
                checked={!!model.supportsFileUpload} // Read from prop directly
                onCheckedChange={handleFileUploadChange} // Update atom directly
              />
              <Label
                htmlFor={`${baseId}-file`}
                className="flex cursor-pointer items-center text-xs font-normal"
              >
                <LuFile className="mr-1 h-3.5 w-3.5 text-green-600" /> File
                Upload
              </Label>
            </div>
            {/* Image Upload Flag */}
            <div className="flex items-center space-x-1.5">
              <Checkbox
                id={`${baseId}-image`}
                checked={!!model.supportsImageUpload} // Read from prop directly
                onCheckedChange={handleImageUploadChange} // Update atom directly
              />
              <Label
                htmlFor={`${baseId}-image`}
                className="flex cursor-pointer items-center text-xs font-normal"
              >
                <LuImage className="mr-1 h-3.5 w-3.5 text-blue-600" /> Image
                Upload
              </Label>
            </div>
          </div>
          {/* Delete button for model */}
          <Button
            type="button" // Important
            size="xs"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 h-6 w-6 p-1"
            onClick={handleRemoveClick}
            aria-label={`Remove ${model.name || 'custom model'}`}
          >
            <LuTrash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  },
);

ModelEditor.displayName = 'ModelEditor';

export default ModelEditor;
