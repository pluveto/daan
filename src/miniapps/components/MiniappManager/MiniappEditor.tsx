// src/miniapps/components/MiniappManager/MiniappEditor.tsx
import { Button } from '@/components/ui/Button';
import { Collapsible, CollapsibleContent } from '@/components/ui/Collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Textarea } from '@/components/ui/Textarea';
import { generateOrModifyMiniappCode } from '@/lib/miniappAiHelper';
import { formatMiniappForPublishing } from '@/lib/miniappImportExport';
import { miniappsDefinitionAtom } from '@/store/miniapp';
import {
  MiniappMcpDefinition,
  MiniappMcpDefinitionSchema,
  type MiniappDefinitionEntity,
  type MiniappPermissions,
} from '@/types';
import { CollapsibleTrigger } from '@radix-ui/react-collapsible';
import { useAtom } from 'jotai';
import { useAtomCallback } from 'jotai/utils';
import { ChevronsUpDown } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { LuCopy, LuGithub, LuLoader, LuSparkles } from 'react-icons/lu';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod'; // For validation
import { CodeSection } from './CodeSection';
import { ConfigurationSection } from './ConfigurationSection';
import { DependenciesSection } from './DependenciesSection';
import { GeneralInfoSection } from './GeneralInfoSection';
import { McpDefinitionEditor } from './McpDefinitionEditor';
import { PermissionsSection } from './PermissionsSection';
// import DEFAULT_HTML from './sample.html?raw'; // Import raw content

const sizeSchema = z.object({
  width: z.number().min(1, 'Width must be greater than 0.'),
  height: z.number().min(1, 'Height must be greater than 0.'),
});

// --- Zod Schema for Validation (Example) ---
const miniappDefinitionSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Miniapp name is required.'),
  icon: z.string().optional(),
  description: z.string().optional(),
  htmlContent: z.string().min(1, 'HTML content cannot be empty.'),
  configSchema: z.record(z.any()).optional().default({}),
  defaultConfig: z.record(z.any()).optional().default({}),
  defaultWindowSize: sizeSchema.optional().default({ width: 800, height: 600 }),
  permissions: z.record(z.any()).optional().default({}), // Could be more specific
  mcpDefinition: MiniappMcpDefinitionSchema.optional(),
  enabled: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
  dependencies: z.array(z.string()).optional().default([]),
});
// --- End Validation ---

interface MiniappEditorProps {
  miniappId: string | null; // null for create mode
  onSaveSuccess: () => void;
  onCancel: () => void; // Add cancel handler
}

// Define a type for the editable state, making complex fields potentially null initially
type EditableMiniappState = Omit<
  Partial<MiniappDefinitionEntity>,
  'configSchema' | 'defaultConfig' | 'permissions' | 'mcpDefinition'
> & {
  configSchema: Record<string, any> | null;
  defaultConfig: Record<string, any> | null;
  defaultWindowSize: { width: number; height: number } | null;
  permissions: MiniappPermissions | null; // Use the specific type
  mcpDefinition: MiniappMcpDefinition | undefined;
};

export function MiniappEditor({
  miniappId,
  onSaveSuccess,
  onCancel,
}: MiniappEditorProps) {
  const [definitions, setDefinitions] = useAtom(miniappsDefinitionAtom);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('general');
  const [aiDescription, setAiDescription] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  // State to hold the miniapp definition being edited
  const [editableState, setEditableState] =
    useState<EditableMiniappState | null>(null);

  const isCreateMode = miniappId === null;

  // Load existing data or initialize for create mode
  useEffect(() => {
    setIsLoading(true);
    let initialState: EditableMiniappState;
    if (isCreateMode) {
      initialState = {
        name: '',
        icon: '📦', // Default icon
        description: '',
        htmlContent: '',
        configSchema: {},
        defaultConfig: {},
        defaultWindowSize: { width: 800, height: 600 },
        permissions: { useStorage: true }, // Sensible default permissions
        mcpDefinition: undefined,
        enabled: false,
        dependencies: [],
      };
    } else {
      const existing = definitions.find((d) => d.id === miniappId);
      if (existing) {
        initialState = {
          ...existing,
          // Ensure complex types are objects, default if undefined/null
          configSchema: existing.configSchema ?? {},
          defaultConfig: existing.defaultConfig ?? {},
          defaultWindowSize: existing.defaultWindowSize ?? {
            width: 800,
            height: 600,
          },
          permissions: existing.permissions ?? { useStorage: true },
          mcpDefinition: undefined,
          dependencies: existing.dependencies ?? [],
        };
      } else {
        console.error(`Miniapp with ID ${miniappId} not found.`);
        toast.error('Miniapp not found.');
        onCancel(); // Close if not found
        return; // Stop execution
      }
    }
    setEditableState(initialState);
    setIsLoading(false);
  }, [miniappId, isCreateMode, definitions, toast, onCancel]);

  // Generic handler to update parts of the state
  const handleStateChange = useCallback(
    <K extends keyof EditableMiniappState>(
      key: K,
      value: EditableMiniappState[K],
    ) => {
      setEditableState((prev) => (prev ? { ...prev, [key]: value } : null));
    },
    [],
  );

  const handleAiGenerate = useAtomCallback(
    useCallback(
      async (get) => {
        // `get` provided by useAtomCallback
        if (!editableState || isAiLoading) return;

        setIsAiLoading(true);
        try {
          // Use editableState directly, no need to get from atom here
          const currentHtml = editableState.htmlContent ?? '';
          const newHtml = await generateOrModifyMiniappCode(
            aiDescription,
            currentHtml,
            get,
          );
          // Update the editor state directly
          handleStateChange('htmlContent', newHtml);
          // Optionally clear the description field after success
          // setAiDescription('');
        } catch (error) {
          // Error toast is handled within the helper function
          console.error('AI Generation failed in editor:', error);
        } finally {
          setIsAiLoading(false);
        }
      },
      [editableState, aiDescription, isAiLoading, handleStateChange], // Dependencies for inner useCallback
    ),
  );

  // Handle saving
  const handleSave = () => {
    if (!editableState) return; // Should not happen if loaded

    const now = Date.now();
    const definitionToSave: Partial<MiniappDefinitionEntity> & { id?: string } =
      {
        ...editableState,
        // Ensure required fields have defaults if somehow null/undefined
        configSchema: editableState.configSchema ?? {},
        defaultConfig: editableState.defaultConfig ?? {},
        defaultWindowSize: editableState.defaultWindowSize ?? {
          width: 800,
          height: 600,
        },
        permissions: editableState.permissions ?? { useStorage: true },
        dependencies: editableState.dependencies ?? [],
        updatedAt: now,
      };

    if (isCreateMode) {
      definitionToSave.id = uuidv4();
      definitionToSave.createdAt = now;
      definitionToSave.enabled = definitionToSave.enabled ?? false; // Ensure boolean
    } else {
      definitionToSave.id = miniappId as string; // We know it's not null here
      // Preserve original createdAt if editing
      const original = definitions.find((d) => d.id === miniappId);
      definitionToSave.createdAt = original?.createdAt ?? now; // Fallback just in case
    }

    // --- Validation ---
    try {
      // Validate against the Zod schema before saving
      const validatedData = miniappDefinitionSchema.parse(definitionToSave);

      // Update or Add the definition
      if (isCreateMode) {
        setDefinitions((prev) => [
          ...prev,
          validatedData as MiniappDefinitionEntity,
        ]); // Add new
        toast.success(`Miniapp "${validatedData.name}" created.`);
      } else {
        setDefinitions(
          (prev) =>
            prev.map((d) =>
              d.id === miniappId
                ? (validatedData as MiniappDefinitionEntity)
                : d,
            ), // Update existing
        );
        toast.success(`Miniapp "${validatedData.name}" updated.`);
      }
      onSaveSuccess(); // Close dialog/signal success
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Validation Error:', error.errors);
        // Show specific validation errors to the user
        const errorMessages = error.errors
          .map((err) => `${err.path.join('.')}: ${err.message}`)
          .join('\n');
        toast.error('Validation Failed', {
          description: (
            <pre className="bg-background mt-2 w-[340px] rounded-md p-4">
              <code className="text-foreground">{errorMessages}</code>
            </pre>
          ),
          duration: 10000,
        });
      } else {
        console.error('Save Error:', error);
        toast.error('Failed to save Miniapp.');
      }
    }
    // --- End Validation ---
  };

  const handleExportForPublishing = () => {
    if (!editableState) return;
    // Construct a definition object from the current state
    const currentDefinitionData = {
      id: miniappId || 'new-miniapp', // Use current ID or placeholder
      name: editableState.name ?? 'Untitled',
      icon: editableState.icon,
      description: editableState.description,
      htmlContent: editableState.htmlContent ?? '',
      configSchema: editableState.configSchema ?? {},
      defaultConfig: editableState.defaultConfig ?? {},
      defaultWindowSize: editableState.defaultWindowSize ?? {
        width: 800,
        height: 600,
      },
      enabled: editableState.enabled ?? false,
      dependencies: editableState.dependencies ?? [],
      permissions: editableState.permissions ?? {},
      mcpDefinition: editableState.mcpDefinition,
      createdAt: editableState.createdAt || Date.now(), // Use existing or current time
      updatedAt: Date.now(),
    };
    const GITHUB_OWNER = 'pluveto';
    const GITHUB_REPO = 'daan';

    const markdownContent = formatMiniappForPublishing(
      currentDefinitionData as MiniappDefinitionEntity,
    );

    // Copy to clipboard and notify user
    if (!navigator.clipboard) {
      toast.error('Failed to access clipboard. Please copy from the console.');
      console.log(markdownContent);
      return;
    }
    navigator.clipboard
      .writeText(markdownContent)
      .then(() => {
        toast.success('Marketplace Markdown copied to clipboard!', {
          description: (
            <span>
              Go to GitHub Issues, create a new issue, paste this content, and
              add the 'market-miniapp' label.
              <a
                href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues/new`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 inline-flex items-center text-blue-500 hover:underline"
              >
                Create Issue <LuGithub className="ml-1 h-4 w-4" />
              </a>
            </span>
          ),
          duration: 10000,
        });
      })
      .catch((err) => {
        console.error('Failed to copy Markdown:', err);
        toast.error(
          'Failed to access clipboard. Please copy from the console.',
        );
        console.log(markdownContent);
        return;
      });
  };

  if (isLoading || !editableState) {
    // Optional: Add a spinner or loading indicator
    return <div className="p-6 text-center">Loading Editor...</div>;
  }

  return (
    // Removed max-h and overflow, DialogContent should handle scrolling if needed
    <div className="flex h-full flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="code">Code & AI</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
          <TabsTrigger value="mcp">MCP</TabsTrigger>
        </TabsList>

        {/* Wrap content in a scrollable area if needed, DialogContent often handles this */}
        <div className="">
          <TabsContent value="general">
            <GeneralInfoSection
              name={editableState.name ?? ''}
              icon={editableState.icon ?? ''}
              description={editableState.description ?? ''}
              enabled={editableState.enabled ?? false}
              defaultWindowSize={
                editableState.defaultWindowSize ?? { width: 800, height: 600 }
              }
              onStateChange={(k, v: any) => handleStateChange(k, v)}
            />
          </TabsContent>
          <TabsContent value="code" className="space-y-6">
            {/* AI Generation Section */}
            <Collapsible className="space-x-4 px-4 py-1 border rounded-md bg-background-secondary">
              <CollapsibleTrigger asChild>
                <div className="flex items-center cursor-pointer ">
                  <h4 className="text-sm font-semibold flex-1">
                    Generate or Modify with AI
                  </h4>
                  <Button variant="ghost" size="sm">
                    <ChevronsUpDown className="h-4 w-4" />
                    <span className="sr-only">Toggle</span>
                  </Button>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <p className="text-muted-foreground mb-2 text-sm">
                  Describe the functionality you want to add or change in plain
                  language. The AI will attempt to generate or update the
                  HTML/CSS/JS code below.
                </p>
                <Textarea
                  id="ai-description"
                  placeholder="e.g., 'Create a simple counter app with increment/decrement buttons that saves the count using hostApi.storage', or 'Change the button color to blue and make it log the current config when clicked'"
                  value={aiDescription}
                  onChange={(e) => setAiDescription(e.target.value)}
                  rows={3}
                  disabled={isAiLoading}
                />
                <Button
                  onClick={handleAiGenerate}
                  disabled={!aiDescription.trim() || isAiLoading}
                  className="my-2"
                  size="sm"
                >
                  {isAiLoading ? (
                    <LuLoader className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <LuSparkles className="mr-2 h-4 w-4" />
                  )}
                  {editableState.htmlContent?.trim()
                    ? 'Modify Code with AI'
                    : 'Generate Code with AI'}
                </Button>
              </CollapsibleContent>
            </Collapsible>

            {/* Existing Code Editor Section */}
            <CodeSection
              htmlContent={editableState.htmlContent ?? ''}
              onHtmlChange={(html) => handleStateChange('htmlContent', html)}
            />
          </TabsContent>
          <TabsContent value="config">
            <ConfigurationSection
              configSchema={editableState.configSchema}
              defaultConfig={editableState.defaultConfig}
              onStateChange={handleStateChange}
            />
          </TabsContent>
          <TabsContent value="permissions">
            <PermissionsSection
              permissions={editableState.permissions}
              onPermissionsChange={(perms) =>
                handleStateChange('permissions', perms)
              }
            />
          </TabsContent>
          <TabsContent value="dependencies">
            <DependenciesSection
              dependencies={editableState.dependencies ?? []}
              currentMiniappId={miniappId} // Pass current ID to exclude self
              onDependenciesChange={(deps) =>
                handleStateChange('dependencies', deps)
              }
            />
          </TabsContent>
          <TabsContent value="mcp">
            <McpDefinitionEditor
              value={editableState.mcpDefinition} // Pass current definition
              onChange={(mcpDef) => handleStateChange('mcpDefinition', mcpDef)} // Update state
            />
          </TabsContent>
        </div>
      </Tabs>

      {/* Footer with Actions */}
      <div className="flex flex-shrink-0 justify-end space-x-2 border-t p-4">
        <Button variant="outline" onClick={handleExportForPublishing}>
          <LuCopy className="mr-2 h-4 w-4" /> Copy Markdown for Publishing
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!editableState?.name?.trim()}>
          {isCreateMode ? 'Create Miniapp' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
