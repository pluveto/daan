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
import { McpServerConfig } from '@/store/mcp';
import { zodResolver } from '@hookform/resolvers/zod';
import { isEmpty } from 'lodash';
import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { McpServerFormData, mcpServerFormSchema } from './schema';

interface McpServerFormProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (data: McpServerFormData) => void;
  editingServer: McpServerConfig | null;
}

export const McpServerForm: React.FC<McpServerFormProps> = ({
  isOpen,
  onOpenChange,
  onSubmit,
  editingServer,
}) => {
  const isEditing = !!editingServer;
  const canUseStdio = isDesktopEnv(); // Check if Tauri environment is active

  const isEditingBuiltin =
    isEditing && editingServer?.type === 'builtin-pseudo';

  const form = useForm({
    mode: 'onChange',
    resolver: zodResolver(mcpServerFormSchema),
    // Default values should ideally match the schema structure
    defaultValues: {
      name: '',
      description: '',
      type: 'sse', // Default to SSE
      url: '',
      command: undefined,
      args: undefined,
      autoApproveTools: false,
    },
  });

  console.log(form.formState);
  // Watch the 'type' field to conditionally render inputs
  const serverType = form.watch('type');

  // Reset form when dialog opens or editingServer changes
  useEffect(() => {
    if (isOpen) {
      if (editingServer) {
        // Prepare data for the form, especially converting args back to string for input if needed
        const formData: Partial<McpServerFormData> = {
          id: editingServer.id,
          name: editingServer.name,
          description: editingServer.description || '',
          type: editingServer.type, // Cast based on logic
          autoApproveTools: editingServer.autoApproveTools,
        };
        if (editingServer.type === 'sse') {
          formData.url = editingServer.url;
        } else if (editingServer.type === 'stdio') {
          formData.command = editingServer.command;
          formData.args = editingServer.args; // Keep as array for reset
        }
        form.reset(formData);
      } else {
        // Reset to defaults for adding new, ensuring type is valid
        form.reset({
          name: '',
          description: '',
          type: 'sse', // Default to SSE
          url: '',
          command: undefined,
          args: undefined,
          autoApproveTools: false,
        });
      }
    }
  }, [isOpen, editingServer, form, canUseStdio]);

  const handleFormSubmit = (data: McpServerFormData) => {
    onSubmit(data); // Pass validated data up
    onOpenChange(false); // Close dialog
  };

  // Helper to get args as string for display in input/textarea
  const getArgsAsString = (args: string[] | undefined): string => {
    return Array.isArray(args) ? args.join(', ') : '';
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
          className="space-y-4"
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
                <Select
                  onValueChange={(value) => {
                    field.onChange(value);
                    // Optionally reset other fields when type changes
                    if (value === 'sse') {
                      form.setValue('command', undefined);
                      form.setValue('args', undefined);
                    } else if (value === 'stdio') {
                      form.setValue('url', undefined);
                    }
                  }}
                  value={field.value}
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
                    {/* If editing a built-in, show it disabled */}
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
