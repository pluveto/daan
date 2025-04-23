// src/settings/ApiSettingsTab.tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/Accordion';
import { Button } from '@/components/ui/Button';
// import { Checkbox } from '@/components/ui/Checkbox'; // If needed
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/Form';
import { Input } from '@/components/ui/Input';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Separator } from '@/components/ui/Separator';
import { Switch } from '@/components/ui/Switch';
// import { Textarea } from '@/components/ui/Textarea'; // If needed
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import {
  apiBaseUrlAtom,
  apiKeyAtom,
  apiProvidersAtom,
  defaultMaxTokensAtom,
  defaultTemperatureAtom,
  defaultTopPAtom,
} from '@/store/settings';
import { ApiModelConfig, ApiProviderConfig, NamespacedModelId } from '@/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import isEqual from 'lodash/isEqual'; // For deep comparison
import React, { useCallback, useEffect, useRef } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { LuFile, LuImage, LuPlus, LuTrash2 } from 'react-icons/lu'; // Removed LuSave
import { toast } from 'sonner';
import { useDebouncedCallback } from 'use-debounce'; // Using use-debounce library
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

// --- Zod Schema Definition ---

// Helper to handle common number/null/undefined pattern with empty string input
const optionalNullableNumber = (schema: z.ZodNumber) =>
  z
    .preprocess(
      // Preprocess: Convert empty string, null, or undefined to null. Otherwise, attempt to coerce to Number.
      (val) => (val === '' || val === null || val === undefined ? null : val),
      // Validate: Coerce the value to a number if possible, then apply specific schema rules. Allow null.
      z.coerce.number().pipe(schema).nullish(), // .nullish() allows null or undefined
    )
    .optional(); // .optional() allows the key to be absent

// Zod schema for a single model within a provider
const modelSchema = z.object({
  id: z
    .string()
    .min(1, 'Model ID cannot be empty')
    .regex(/^[\w-]+::[\w-]+$/, 'Model ID must be in format: namespace::id')
    .refine((val) => !val.startsWith('custom::new-model-'), {
      message: 'Please provide a specific model ID',
    }) as z.ZodType<NamespacedModelId>,
  name: z.string().min(1, 'Model name cannot be empty'),
  supportsFileUpload: z.boolean().optional(),
  supportsImageUpload: z.boolean().optional(),
  // Refactored numeric fields
  temperature: optionalNullableNumber(z.number().min(0).max(2)),
  maxTokens: optionalNullableNumber(z.number().int().positive()),
  topP: optionalNullableNumber(z.number().min(0).max(1)), // Adjusted TopP to typical 0-1 float range and validation. Keep int().positive() if that's truly needed.
});

// Zod schema for a single provider
const providerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Provider name cannot be empty'),
  description: z.string().optional(),
  enabled: z.boolean(),
  apiKey: z
    .string()
    .transform((val) => (val === '' ? null : val))
    .nullable()
    .optional(), // Store empty string as null
  apiBaseUrl: z
    .string()
    .transform((val) => (val === '' ? null : val))
    .nullable()
    .optional(), // Store empty string as null
  // Refactored default numeric fields
  defaultTemperature: optionalNullableNumber(z.number().min(0).max(2)),
  defaultMaxTokens: optionalNullableNumber(z.number().int().positive()),
  defaultTopP: optionalNullableNumber(z.number().min(0).max(1)), // Adjusted TopP range
  models: z.array(modelSchema),
});

// Zod schema for the entire API settings form data
const apiSettingsSchema = z.object({
  globalApiKey: z
    .string()
    .transform((val) => (val === '' ? null : val))
    .nullable()
    .optional(), // Store empty string as null
  globalApiBaseUrl: z
    .string()
    .transform((val) => (val === '' ? null : val))
    .nullable()
    .optional(), // Store empty string as null
  // Global numeric fallbacks (should generally have defaults, not be null/optional)
  globalTemperature: z.preprocess(
    // Ensure empty string or invalid input becomes a default number (e.g., 0.7)
    (val) => (val === '' || typeof val !== 'number' ? 0.7 : Number(val)),
    z.number().min(0).max(2).default(0.7), // Ensure it's a number, provide default
  ),
  globalMaxTokens: z.preprocess(
    (val) => (val === '' ? null : val), // Allow empty string -> null
    z.coerce.number().int().positive().nullable(), // Coerce, validate, allow null
  ),
  globalTopP: z.preprocess(
    (val) => (val === '' ? null : val), // Allow empty string -> null
    z.coerce.number().min(0).max(1).nullable(), // Coerce, validate (0-1 range), allow null
    // Use z.coerce.number().int().positive().nullable() if you need integer TopP
  ),
  providers: z.array(providerSchema),
});

// Type inferred from the schema - should now be more consistent
export type ApiSettingsFormData = z.infer<typeof apiSettingsSchema>;

// Helper to get current settings state from atoms
const getCurrentSettingsFromAtoms = (
  gApiKey: string | null,
  gApiBaseUrl: string | null,
  gTemp: number | null,
  gMaxTokens: number | null,
  gTopP: number | null,
  providersData: ApiProviderConfig[],
): ApiSettingsFormData => ({
  globalApiKey: gApiKey ?? '',
  globalApiBaseUrl: gApiBaseUrl ?? '',
  globalTemperature: gTemp ?? 0.7,
  globalMaxTokens: gMaxTokens ?? null,
  globalTopP: gTopP ?? null,
  providers: providersData ?? [],
});

export const ApiSettingsTab: React.FC = () => {
  // --- Jotai State ---
  const [globalApiKey, setGlobalApiKey] = useAtom(apiKeyAtom);
  const [globalApiBaseUrl, setGlobalApiBaseUrl] = useAtom(apiBaseUrlAtom);
  const [globalTemperature, setGlobalTemperature] = useAtom(
    defaultTemperatureAtom,
  );
  const [globalMaxTokens, setGlobalMaxTokens] = useAtom(defaultMaxTokensAtom);
  const [globalTopP, setGlobalTopP] = useAtom(defaultTopPAtom);
  const [providers, setProviders] = useAtom(apiProvidersAtom);

  // Store the last successfully saved state to prevent redundant saves
  const lastSavedState = useRef<ApiSettingsFormData | null>(null);

  // --- React Hook Form ---
  const form = useForm({
    resolver: zodResolver(apiSettingsSchema),
    defaultValues: getCurrentSettingsFromAtoms(
      globalApiKey,
      globalApiBaseUrl,
      globalTemperature,
      globalMaxTokens,
      globalTopP,
      providers,
    ),
    mode: 'onBlur', // Validate on blur, shows errors after leaving field
    // mode: 'onChange', // Use this for immediate validation feedback (can be noisy)
  });

  // `useFieldArray` for managing providers
  const { fields /* append, remove, update */ } = useFieldArray({
    control: form.control,
    name: 'providers',
    keyName: 'fieldId', // Use a different key name than 'id'
  });

  // --- Auto-Save Logic ---

  // The actual function to save the data to Jotai atoms
  const performSave = useCallback(
    (data: ApiSettingsFormData) => {
      console.log('Auto-saving API Settings:', data);
      try {
        // Update global settings atoms
        // Ensure empty strings become null where appropriate before setting atom
        setGlobalApiKey(data.globalApiKey || null);
        setGlobalApiBaseUrl(data.globalApiBaseUrl || null);
        setGlobalTemperature(data.globalTemperature); // Already a number due to schema
        setGlobalMaxTokens(data.globalMaxTokens); // Already number | null
        setGlobalTopP(data.globalTopP); // Already number | null

        // Update providers atom
        setProviders(
          data.providers.map((provider) => ({
            ...provider,
            // Ensure empty strings for optional overrides become null
            apiKey: provider.apiKey || null,
            apiBaseUrl: provider.apiBaseUrl || null,
            // default values are already handled by preprocess/schema
          })),
        );

        lastSavedState.current = data; // Update last saved state
        form.reset(data, {
          keepValues: true,
          keepDirty: false,
          keepDefaultValues: false,
        }); // Reset dirty state after successful save
        toast.success('API settings saved automatically.');
      } catch (error) {
        console.error('Error auto-saving API settings:', error);
        toast.error('Failed to auto-save API settings.');
      }
    },
    [
      setGlobalApiKey,
      setGlobalApiBaseUrl,
      setGlobalTemperature,
      setGlobalMaxTokens,
      setGlobalTopP,
      setProviders,
      form, // Include form in dependency array for form.reset
    ],
  );

  // Debounced save function
  const debouncedSave = useDebouncedCallback(performSave, 1500); // Debounce for 1.5 seconds

  // Effect to watch form changes and trigger debounced save
  useEffect(() => {
    const subscription = form.watch((value, { name, type }) => {
      // value contains the full form data
      const currentFormData = value as ApiSettingsFormData;

      // Initialize lastSavedState on first render after defaultValues are set
      if (lastSavedState.current === null) {
        lastSavedState.current = getCurrentSettingsFromAtoms(
          globalApiKey,
          globalApiBaseUrl,
          globalTemperature,
          globalMaxTokens,
          globalTopP,
          providers,
        );
      }

      // Check if data has actually changed compared to the last saved state
      // Use lodash/isEqual for deep comparison, especially important for arrays/objects
      if (
        form.formState.isDirty &&
        !isEqual(currentFormData, lastSavedState.current)
      ) {
        // Trigger validation manually before attempting save with debounce
        form.trigger().then((isValid) => {
          if (isValid) {
            console.log(
              'Form changed and is valid, debouncing save for:',
              name,
            );
            debouncedSave(currentFormData);
          } else {
            console.log('Form changed but is invalid, save cancelled.');
            // Cancel any pending debounced save if the form becomes invalid
            debouncedSave.cancel();
          }
        });
      } else {
        // If not dirty or data hasn't changed, cancel any pending save
        debouncedSave.cancel();
      }
    });
    return () => subscription.unsubscribe();
  }, [
    form,
    debouncedSave,
    globalApiKey,
    globalApiBaseUrl,
    globalTemperature,
    globalMaxTokens,
    globalTopP,
    providers,
  ]); // Add Jotai atoms to deps to re-initialize baseline state

  // --- Event Handlers for Models (within Custom Provider) ---
  const addCustomModel = () => {
    const customProviderIndex = fields.findIndex((p) => p.id === 'custom');
    if (customProviderIndex === -1) {
      toast.error("Could not find the 'Custom' provider to add a model.");
      return;
    }

    const currentModels =
      form.getValues(`providers.${customProviderIndex}.models`) || [];
    // Use a more descriptive temporary ID that fails validation initially
    const tempIdSuffix = uuidv4().slice(0, 4);
    const newModelId: NamespacedModelId = `custom::new-model-${tempIdSuffix}`;
    const newModel: ApiModelConfig = {
      id: newModelId,
      name: `New Model ${tempIdSuffix}`, // Make name unique too initially
      temperature: null,
      maxTokens: null,
      topP: null,
      supportsFileUpload: false, // Default flags
      supportsImageUpload: false,
    };

    // Use form.setValue to update the array
    form.setValue(
      `providers.${customProviderIndex}.models`,
      [...currentModels, newModel],
      { shouldDirty: true, shouldValidate: true }, // Mark dirty and trigger validation
    );
  };

  const removeCustomModel = (modelIndex: number) => {
    const customProviderIndex = fields.findIndex((p) => p.id === 'custom');
    if (customProviderIndex === -1) return;

    const currentModels =
      form.getValues(`providers.${customProviderIndex}.models`) || [];
    const updatedModels = currentModels.filter(
      (_, index) => index !== modelIndex,
    );
    form.setValue(`providers.${customProviderIndex}.models`, updatedModels, {
      shouldDirty: true,
      shouldValidate: true, // Validate after removal
    });
  };

  // --- Render Logic ---
  return (
    <TooltipProvider>
      {/* Removed onSubmit from form tag */}
      <Form {...form}>
        <form className="space-y-6 p-6">
          {/* --- Global Fallback Settings --- */}
          <section className="space-y-4 rounded-md border p-4">
            <h4 className="text-base font-semibold">Global Fallbacks</h4>
            <p className="text-muted-foreground text-xs">
              These settings are used if not overridden by a specific provider.
            </p>
            <FormField
              control={form.control}
              name="globalApiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Global API Key</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="sk-..."
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage /> {/* Shows validation errors */}
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="globalApiBaseUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Global API Base URL (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., https://api.openai.com/v1"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage /> {/* Shows validation errors */}
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="globalTemperature"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temperature</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        {...field}
                        value={(field.value as string) ?? ''}
                      />
                    </FormControl>
                    <FormMessage /> {/* Shows validation errors */}
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="globalMaxTokens"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Tokens</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        placeholder="Default"
                        {...field}
                        // Important: RHF expects string value for number inputs
                        value={(field.value as string) ?? ''}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === ''
                              ? null
                              : parseInt(e.target.value, 10),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage /> {/* Shows validation errors */}
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="globalTopP"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Top P</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="1" // Top P is usually 0-1 float, adjust if needed
                        min="0" // Assuming 0-1 range
                        max="1" // Assuming 0-1 range
                        placeholder="Default"
                        {...field}
                        // Important: RHF expects string value for number inputs
                        value={(field.value as string) ?? ''}
                        // Adjust parsing based on expected type (float?)
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === ''
                              ? null
                              : parseFloat(e.target.value),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage /> {/* Shows validation errors */}
                  </FormItem>
                )}
              />
            </div>
          </section>

          <Separator />

          {/* --- API Providers --- */}
          <section className="space-y-4">
            <h4 className="text-base font-semibold">API Providers</h4>
            <Accordion type="multiple" className="w-full">
              {fields.map((field, providerIndex) => (
                <AccordionItem
                  key={field.fieldId}
                  value={field.id} // Use the unique provider ID
                  className="bg-background mb-2 rounded-md border"
                >
                  <div className="flex items-center p-3">
                    {/* Toggle Switch */}
                    <FormField
                      control={form.control}
                      name={`providers.${providerIndex}.enabled`}
                      render={({ field: switchField }) => (
                        <FormItem className="mr-4 flex-shrink-0">
                          {/* No FormLabel needed visually for a switch usually */}
                          <FormControl>
                            <Switch
                              checked={switchField.value}
                              onCheckedChange={switchField.onChange} // This correctly triggers form state change
                              aria-label={`${form.getValues(`providers.${providerIndex}.name`)} Enabled`}
                            />
                          </FormControl>
                          {/* <FormMessage /> You could add one here if needed */}
                        </FormItem>
                      )}
                    />
                    {/* Accordion Trigger */}
                    <AccordionTrigger className="flex-grow p-0 hover:no-underline">
                      <span className="font-medium">
                        {/* Use watch for potentially dynamic name like 'Custom' */}
                        {form.watch(`providers.${providerIndex}.name`)}
                      </span>
                    </AccordionTrigger>
                  </div>
                  <AccordionContent className="px-4 pt-0 pb-4">
                    <div className="space-y-4 border-t pt-4">
                      <p className="text-muted-foreground text-xs">
                        {field.description}
                      </p>
                      {/* Provider Name & Description (Readonly for default providers?) */}
                      {field.id === 'custom' ? (
                        <FormField
                          control={form.control}
                          name={`providers.${providerIndex}.name`}
                          render={({ field: nameField }) => (
                            <FormItem>
                              <FormLabel>Provider Name</FormLabel>
                              <FormControl>
                                <Input {...nameField} />
                              </FormControl>
                              <FormMessage /> {/* Error shown here */}
                            </FormItem>
                          )}
                        />
                      ) : // Display name for non-custom providers
                      // <p className="text-sm font-medium">{field.name}</p>
                      // No need to display again as it's in the trigger
                      null}

                      {/* Provider Overrides */}
                      <div className="space-y-2 rounded border p-3">
                        <h5 className="text-muted-foreground text-xs font-semibold">
                          Provider Overrides (Optional)
                        </h5>
                        <FormField
                          control={form.control}
                          name={`providers.${providerIndex}.apiKey`}
                          render={({ field: keyField }) => (
                            <FormItem>
                              <FormLabel>API Key Override</FormLabel>
                              <FormControl>
                                <Input
                                  type="password"
                                  placeholder="Use Global Key"
                                  {...keyField}
                                  value={keyField.value ?? ''} // Handle null
                                />
                              </FormControl>
                              <FormMessage /> {/* Error shown here */}
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`providers.${providerIndex}.apiBaseUrl`}
                          render={({ field: urlField }) => (
                            <FormItem>
                              <FormLabel>API Base URL Override</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Use Global URL"
                                  {...urlField}
                                  value={urlField.value ?? ''} // Handle null
                                />
                              </FormControl>
                              <FormMessage /> {/* Error shown here */}
                            </FormItem>
                          )}
                        />
                        {/* Add Temp/Tokens/TopP overrides if needed, similar structure */}
                      </div>

                      {/* --- Model List --- */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-semibold">Models</h5>
                          {field.id === 'custom' && (
                            <Button
                              type="button" // Important: prevent form submission
                              size="xs"
                              variant="outline"
                              onClick={addCustomModel}
                            >
                              <LuPlus className="mr-1 h-3 w-3" /> Add Model
                            </Button>
                          )}
                        </div>

                        <ScrollArea className="h-40 rounded-md border">
                          <div className="space-y-1 p-2">
                            {/* Watch the specific model array for dynamic rendering */}
                            {form
                              .watch(`providers.${providerIndex}.models`)
                              ?.map((model, modelIndex) => (
                                <div
                                  key={model.id || modelIndex} // Use model.id but fallback to index if ID isn't stable yet
                                  className="hover:bg-muted/50 flex flex-col gap-2 rounded p-1.5 text-xs sm:flex-row sm:items-center sm:justify-between"
                                >
                                  {/* Left side: Inputs or Display */}
                                  <div className="flex flex-grow items-center gap-2">
                                    {field.id === 'custom' ? (
                                      <>
                                        {/* Custom model inputs */}
                                        <FormField
                                          control={form.control}
                                          name={`providers.${providerIndex}.models.${modelIndex}.name`}
                                          render={({ field: nameField }) => (
                                            <FormItem className="flex-1">
                                              <FormControl>
                                                <Input
                                                  className="h-6 text-xs"
                                                  placeholder="Model Display Name"
                                                  {...nameField}
                                                />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                        <FormField
                                          control={form.control}
                                          name={`providers.${providerIndex}.models.${modelIndex}.id`}
                                          render={({ field: idField }) => (
                                            <FormItem className="flex-1">
                                              <FormControl>
                                                <Input
                                                  className="h-6 text-xs"
                                                  placeholder="namespace::model-id"
                                                  {...idField}
                                                />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                      </>
                                    ) : (
                                      // Display for non-custom models
                                      <span className="flex-grow break-all">
                                        {model.name}{' '}
                                        <span className="text-muted-foreground">
                                          ({model.id})
                                        </span>
                                      </span>
                                    )}
                                  </div>

                                  {/* Right side: Icons and Delete Button */}
                                  <div className="flex items-center justify-end gap-2">
                                    {/* Feature Icons */}
                                    {model.supportsImageUpload && (
                                      <Tooltip delayDuration={100}>
                                        <TooltipTrigger>
                                          <LuImage className="h-3.5 w-3.5 text-blue-500" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Supports Image Upload</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                    {model.supportsFileUpload && (
                                      <Tooltip delayDuration={100}>
                                        <TooltipTrigger>
                                          <LuFile className="h-3.5 w-3.5 text-green-500" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Supports File Upload</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    )}

                                    {/* Delete button for custom models */}
                                    {field.id === 'custom' && (
                                      <Button
                                        type="button" // Important
                                        size="xs"
                                        variant="ghost"
                                        className="text-destructive hover:bg-destructive/10 h-6 w-6 p-1"
                                        onClick={() =>
                                          removeCustomModel(modelIndex)
                                        }
                                        aria-label={`Remove ${model.name || 'custom model'}`}
                                      >
                                        <LuTrash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            {/* Message when no models */}
                            {form.watch(`providers.${providerIndex}.models`)
                              ?.length === 0 && (
                              <p className="text-muted-foreground p-2 text-center text-xs">
                                No models defined for this provider.
                                {field.id === 'custom' &&
                                  " Click 'Add Model' to add one."}
                              </p>
                            )}
                          </div>
                        </ScrollArea>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>

          <Separator />

          {/* --- Save Button Removed --- */}
          {/* The form now saves automatically on valid changes */}
          <div className="text-muted-foreground flex justify-end text-sm">
            Settings are saved automatically.
          </div>
        </form>
      </Form>
    </TooltipProvider>
  );
};
