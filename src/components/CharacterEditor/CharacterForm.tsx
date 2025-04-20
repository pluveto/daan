// src/components/CharacterEditor/CharacterForm.tsx
import { Button } from '@/components/ui/Button.tsx';
// Import shadcn/ui Form components
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/Form.tsx';
import { Input } from '@/components/ui/Input.tsx';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select.tsx';
import { Textarea } from '@/components/ui/Textarea.tsx';
import { cn } from '@/lib/utils.ts';
import { defaultModelAtom } from '@/store/settings.ts';
import { CustomCharacter, exampleModels, PartialCharacter } from '@/types.ts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAtomValue } from 'jotai';
import React, { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { LuLoader } from 'react-icons/lu';
import { CharacterFormData, characterSchema } from './validation.ts';

interface CharacterFormProps {
  characterData: CustomCharacter;
  availableModels: string[];
  globalDefaultMaxHistory: number | null;
  isAutoFilling: boolean;
  canAutoFill: boolean;
  onSave: (data: PartialCharacter) => void;
  onAutoFill: (data: PartialCharacter) => Promise<PartialCharacter | undefined>;
}

export const CharacterForm: React.FC<CharacterFormProps> = ({
  characterData,
  availableModels,
  globalDefaultMaxHistory,
  isAutoFilling,
  canAutoFill,
  onSave,
  onAutoFill,
}) => {
  // 1. Initialize react-hook-form
  const form = useForm<CharacterFormData>({
    resolver: zodResolver(characterSchema),
    mode: 'onChange',
    defaultValues: characterData,
    // Default values are set via reset in useEffect
  });

  // Watch model for Select rendering logic
  const currentModelValue = useWatch({ control: form.control, name: 'model' });

  // 3. Define submit handler
  const onSubmit = (data: CharacterFormData) => {
    const processedData: PartialCharacter = {
      id: characterData.id,
      name: data.name.trim(),
      icon: data.icon?.trim() || '👤',
      description: data.description?.trim()
        ? data.description.trim()
        : undefined,
      prompt: data.prompt,
      model: data.model,
      maxHistory:
        data.maxHistoryStr === undefined || data.maxHistoryStr.trim() === ''
          ? null
          : Number.parseInt(data.maxHistoryStr, 10),
    };
    console.log(processedData);
    onSave(processedData);
    // Reset form to submitted values to clear dirty state
    form.reset(data);
  };

  // 4. Define other handlers
  const handleResetClick = () => {
    form.reset();
  };

  const handleAutoFillClick = async () => {
    if (canAutoFill) {
      const tempData = form.getValues();
      const autoFilledData = await onAutoFill(tempData);
      if (autoFilledData) {
        form.reset({
          ...tempData,
          ...autoFilledData,
        });
      }
    }
  };

  // Prepare model lists for Select
  const customOnlyModels = availableModels.filter(
    (m) => !exampleModels.includes(m),
  );
  const isModelInAvailableList = availableModels.includes(currentModelValue);

  // 5. Render the form using shadcn/ui Form components
  return (
    // Pass the form methods to the Form component
    <Form {...form}>
      {/* form.handleSubmit handles validation before calling onSubmit */}
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex h-full w-full flex-1 flex-col overflow-hidden p-4 sm:w-2/3"
      >
        {/* Scrollable form content area */}
        <div className="flex-1 space-y-4 overflow-y-auto px-1 pr-2 pb-4">
          {/* Name Field */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Name <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  {/* Spread field props: includes onChange, onBlur, value, name, ref */}
                  <Input placeholder="Character Name" {...field} />
                </FormControl>
                {/* <FormDescription>This is the character's display name.</FormDescription> */}
                <FormMessage /> {/* Automatically displays validation error */}
              </FormItem>
            )}
          />

          {/* Icon Field */}
          <FormField
            control={form.control}
            name="icon"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Icon (Emoji)</FormLabel>
                <FormControl>
                  <Input
                    className="w-16 p-1 text-center text-xl"
                    maxLength={2}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Description Field */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Description{' '}
                  <span className="text-muted-foreground text-xs">
                    (Optional)
                  </span>
                </FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Briefly describe the character's role or personality."
                    rows={3}
                    {...field}
                    // value={field.value ?? ''} // Ensure value is controlled string
                    // onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Prompt Field */}
          <FormField
            control={form.control}
            name="prompt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>System Prompt</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Define the character's behavior, rules, and persona..."
                    rows={8}
                    {...field}
                    // value={field.value ?? ''}
                    // onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Model Field */}
          <FormField
            control={form.control}
            name="model"
            render={({ field }) => {
              console.log(field);

              return (
                <FormItem>
                  <FormLabel>
                    Model <span className="text-destructive">*</span>
                  </FormLabel>
                  {/* Use Select component inside FormItem */}
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      {/* Trigger goes inside FormControl */}
                      <SelectTrigger ref={field.ref}>
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                    </FormControl>
                    {/* Content remains outside FormControl */}
                    <SelectContent>
                      {/* Recommended Models */}
                      <SelectGroup>
                        <SelectLabel>Recommended</SelectLabel>
                        {exampleModels.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      {/* Custom Models */}
                      {customOnlyModels.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Custom</SelectLabel>
                          {customOnlyModels.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {/* Ensure current model value is always selectable */}
                      {currentModelValue && !isModelInAvailableList && (
                        <SelectGroup>
                          <SelectLabel>Current (Not in lists)</SelectLabel>
                          <SelectItem
                            key={currentModelValue}
                            value={currentModelValue}
                          >
                            {currentModelValue}
                          </SelectItem>
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          {/* Max History Field */}
          <FormField
            control={form.control}
            name="maxHistoryStr"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max History (Messages)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    placeholder={`Global Default (${globalDefaultMaxHistory ?? 'None'})`}
                    {...field}
                    // Ensure value passed to number input is string or empty string
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  Leave blank for global default. Must be 0 or greater.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>{' '}
        {/* End Scrollable Area */}
        {/* Footer Buttons - sticky at bottom */}
        <div className="mt-auto flex flex-shrink-0 justify-end space-x-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleAutoFillClick}
            disabled={!canAutoFill || isAutoFilling}
            title={!canAutoFill ? 'Set API Key to enable' : ''}
          >
            {isAutoFilling ? (
              <LuLoader className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Auto Fill
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleResetClick}
            disabled={!form.formState.isDirty} // Use formState from form object
          >
            Reset Changes
          </Button>
          <Button
            type="submit"
            disabled={!form.formState.isDirty || !form.formState.isValid} // Use formState
          >
            Save Changes
          </Button>
        </div>
      </form>
    </Form>
  );
};
