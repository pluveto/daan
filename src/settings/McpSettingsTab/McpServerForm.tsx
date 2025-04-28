// src/settings/McpSettingsTab/McpServerForm.tsx
// ... (imports: include Select components, useEffect, useForm, etc.)
import { Button } from '@/components/ui/Button';
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/Form';
import { Input } from '@/components/ui/Input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Textarea } from '@/components/ui/Textarea';
import { isDesktopEnv } from '@/lib/env';
import { cn } from '@/lib/utils';
import { McpServerConfig } from '@/store/mcp'; // Import specific type if needed
import { miniappsDefinitionAtom } from '@/store/miniapp'; // Import definitions atom
import { zodResolver } from '@hookform/resolvers/zod';
import { useAtomValue } from 'jotai'; // Import useAtomValue
import React, { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { McpServerFormData, mcpServerFormSchema } from './schema';

interface McpServerFormProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (data: McpServerFormData) => void;
  editingServer: McpServerConfig | null;
}

const formInitialState: () => Partial<McpServerFormData> = () => ({
  name: '',
  description: '',
  type: 'sse',
  url: '',
  command: undefined,
  args: [],
  targetMiniappId: undefined,
  autoApproveTools: false,
});

export const McpServerForm: React.FC<McpServerFormProps> = ({
  isOpen,
  onOpenChange,
  onSubmit,
  editingServer,
}) => {
  const isEditing = !!editingServer;
  const canUseStdio = isDesktopEnv();
  const isEditingBuiltin =
    isEditing && editingServer?.type === 'builtin-pseudo';

  // Get Miniapp definitions for the dropdown
  const miniappDefinitions = useAtomValue(miniappsDefinitionAtom);

  // Filter definitions that could potentially be MCP servers (optional)
  // For now, list all non-enabled ones for selection. A better filter might check for mcpDefinition.
  const mcpCandidateMiniapps = useMemo(() => {
    return miniappDefinitions.map((def) => ({
      value: def.id,
      label:
        `${def.icon || '📦'} ${def.name}` +
        (def.mcpDefinition ? ' (MCP Capable)' : ''), // Indicate if MCP def exists
    }));
  }, [miniappDefinitions]);

  const form = useForm<McpServerFormData>({
    // Use the specific Zod type
    mode: 'onChange',
    resolver: zodResolver(mcpServerFormSchema) as any,
    defaultValues: formInitialState(),
  });

  console.log('form', form);

  const serverType = form.watch('type');

  // Reset form logic
  useEffect(() => {
    if (isOpen) {
      if (editingServer) {
        // Prepare form data based on editingServer type
        const formData: Partial<McpServerFormData> = {
          id: editingServer.id,
          name: editingServer.name,
          description: editingServer.description || '',
          type: editingServer.type,
          autoApproveTools: editingServer.autoApproveTools,
          // Set type-specific fields
          url: editingServer.type === 'sse' ? editingServer.url : undefined,
          command:
            editingServer.type === 'stdio' ? editingServer.command : undefined,
          args: editingServer.type === 'stdio' ? editingServer.args : undefined,
          targetMiniappId:
            editingServer.type === 'miniapp'
              ? editingServer.targetMiniappId
              : undefined,
        };
        form.reset(formData);
      } else {
        // Reset to defaults for adding new
        form.reset(formInitialState());
      }
    }
  }, [isOpen, editingServer, form]);

  const handleFormSubmit = (data: McpServerFormData) => {
    let finalData: any = { ...data };
    if (data.type !== 'sse') finalData.url = undefined;
    if (data.type !== 'stdio') {
      finalData.command = undefined;
      finalData.args = undefined;
    }
    if (data.type !== 'miniapp') {
      finalData.targetMiniappId = undefined;
    }

    onSubmit(finalData);
    onOpenChange(false);
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{isEditing ? 'Edit' : 'Add'} MCP Server</DialogTitle>
        <DialogDescription>
          Configure connection details for an MCP server.
          {canUseStdio && ' Stdio type is available in Tauri.'}
          {form.formState.errors &&
            Object.keys(form.formState.errors).length > 0 && (
              <div className="mt-2 text-sm text-red-500">
                <p>Please check the following errors:</p>
                <ul className="list-inside list-disc">
                  {Object.entries(form.formState.errors).map(
                    ([name, error]) => (
                      <li key={name}>
                        <strong>{name}:</strong> {error?.message}
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleFormSubmit)}
          className="space-y-5"
        >
          {/* Name */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="My Custom Tools"
                    {...field}
                    disabled={isEditingBuiltin}
                    className={cn(
                      isEditingBuiltin && 'cursor-not-allowed opacity-70',
                    )}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Description */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (Optional)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Provides tools for..."
                    {...field}
                    value={field.value ?? ''}
                    disabled={isEditingBuiltin}
                    className={cn(
                      isEditingBuiltin && 'cursor-not-allowed opacity-70',
                    )}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Type Selector */}
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Server Type</FormLabel>
                <FormDescription>
                  {!isDesktopEnv() &&
                    'Note: Stdio type is only available in Desktop apps.'}
                </FormDescription>
                <Select
                  onValueChange={(value) => {
                    field.onChange(value);
                    // Reset other fields when type changes
                    // form.setValue('url', undefined);
                    // form.setValue('command', undefined);
                    // form.setValue('args', []);
                    // form.setValue('targetMiniappId', undefined);
                  }}
                  // Disable changing type for built-in or if stdio not supported
                  disabled={isEditingBuiltin} // Disable changing type for built-in
                >
                  <FormControl>
                    <SelectTrigger
                      className={cn(
                        isEditingBuiltin && 'cursor-not-allowed opacity-70',
                      )}
                    >
                      <SelectValue placeholder="Select server type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="sse">
                      SSE Client (External URL)
                    </SelectItem>
                    {canUseStdio && (
                      <SelectItem value="stdio">
                        Stdio (Local Command)
                      </SelectItem>
                    )}
                    <SelectItem value="miniapp">Miniapp</SelectItem>
                    {isEditingBuiltin && (
                      <SelectItem value="builtin-pseudo" disabled>
                        Built-in
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* SSE URL Input */}
          {serverType === 'sse' && (
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Server URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="http://localhost:8080/mcp"
                      {...field}
                      value={field.value ?? ''} // Handle potential undefined
                    />
                  </FormControl>
                  <FormDescription>
                    The URL endpoint for the MCP SSE connection.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Stdio Command Input */}
          {serverType === 'stdio' && canUseStdio && (
            <FormField
              control={form.control}
              name="command"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Command</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="/path/to/executable or command_name"
                      {...field}
                      value={field.value ?? ''} // Handle potential undefined
                    />
                  </FormControl>
                  <FormDescription>
                    The command or executable to run (must be in PATH or
                    absolute).
                    {/* https://github.com/modelcontextprotocol/servers/issues/1526#issuecomment-2819858033 */}
                    {isDesktopEnv() &&
                      "NOTE: on Windows, you may need to use 'cmd.exe' as the command, " +
                        "and put '/c' ... other args in the 'Arguments' field."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Stdio Args Input */}
          {serverType === 'stdio' && canUseStdio && (
            <FormField
              control={form.control}
              name="args"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Arguments (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="arg1&#10;arg2&#10;--flag value"
                      {...field}
                      // Need custom logic to parse lines into array on change/blur
                      value={
                        (field.value as string[] | undefined)?.join('\n') ?? ''
                      }
                      onChange={(e) =>
                        field.onChange(
                          e.target.value
                            .split('\n')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        )
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    Comma-separated arguments to pass to the command.
                    {/* For Textarea: Arguments to pass to the command, one per line. */}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {/* === NEW: Miniapp Target Selector === */}
          {serverType === 'miniapp' && (
            <FormField
              control={form.control}
              name="targetMiniappId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target Miniapp</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select the Miniapp acting as server..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {mcpCandidateMiniapps.length === 0 && (
                        <SelectItem value="-" disabled>
                          No Miniapps available
                        </SelectItem>
                      )}
                      {mcpCandidateMiniapps.map((miniapp) => (
                        <SelectItem key={miniapp.value} value={miniapp.value}>
                          {miniapp.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Select the installed Miniapp that will handle MCP requests.
                    Ensure it's coded to act as an MCP server.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Auto-Approve Switch */}
          <FormField
            control={form.control}
            name="autoApproveTools"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel>Auto-Approve Tool Calls</FormLabel>
                  <FormDescription>
                    Automatically approve tool calls from this server. Use with
                    caution.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            {/* Disable submit if form is invalid or potentially during submission */}
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {isEditing ? 'Save Changes' : 'Add Server'}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  );
};
