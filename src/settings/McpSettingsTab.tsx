// src/settings/McpSettingsTab.tsx
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
// Import MCP atoms
import { cn } from '@/lib/utils';
import {
  addMcpServerAtom,
  connectAllMcpServersAtom,
  connectMcpServerAtom,
  deleteMcpServerAtom,
  disconnectAllMcpServersAtom,
  disconnectMcpServerAtom,
  McpServerConfig,
  mcpServersAtom,
  mcpServerStatesAtom,
  toggleMcpServerEnabledAtom,
  updateMcpServerConfigAtom,
} from '@/store/mcp';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom, useSetAtom } from 'jotai';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  LuCircleDotDashed,
  LuInfo,
  LuPlug,
  LuPlugZap,
  LuPlus,
  LuRefreshCw,
  LuTrash2,
  LuUnplug,
  LuX,
} from 'react-icons/lu';
import { z } from 'zod';

// Zod schema for the Add/Edit MCP Server form
const mcpServerFormSchema = z
  .object({
    id: z.string().optional(), // Present when editing
    name: z.string().min(1, 'Server name is required'),
    description: z.string().optional(),
    type: z.enum(['builtin-pseudo', 'sse-client'], {
      required_error: 'Server type is required',
    }),
    url: z.string().optional(),
    autoApproveTools: z.boolean(),
  })
  .refine(
    (data) => {
      // URL is required only if type is 'sse-client'
      if (data.type === 'sse-client' && (!data.url || data.url.trim() === '')) {
        return false;
      }
      return true;
    },
    {
      message: 'URL is required for SSE Client type',
      path: ['url'], // Associate error with the URL field
    },
  );

type McpServerFormData = z.infer<typeof mcpServerFormSchema>;

export const McpSettingsTab: React.FC = () => {
  const [servers] = useAtom(mcpServersAtom);
  const [serverStates] = useAtom(mcpServerStatesAtom);
  const connectServer = useSetAtom(connectMcpServerAtom);
  const disconnectServer = useSetAtom(disconnectMcpServerAtom);
  const connectAll = useSetAtom(connectAllMcpServersAtom);
  const disconnectAll = useSetAtom(disconnectAllMcpServersAtom);
  const toggleEnabled = useSetAtom(toggleMcpServerEnabledAtom);
  const deleteServer = useSetAtom(deleteMcpServerAtom);
  const addServer = useSetAtom(addMcpServerAtom);
  const updateServer = useSetAtom(updateMcpServerConfigAtom);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServerConfig | null>(
    null,
  );

  const form = useForm<McpServerFormData>({
    resolver: zodResolver(mcpServerFormSchema),
    defaultValues: {
      name: '',
      description: '',
      type: 'sse-client',
      url: '',
      autoApproveTools: false,
    },
  });

  const handleOpenForm = (server: McpServerConfig | null = null) => {
    setEditingServer(server);
    if (server) {
      form.reset({
        id: server.id,
        name: server.name,
        description: server.description || '',
        type: server.type,
        url: server.url || '',
        autoApproveTools: server.autoApproveTools,
      });
    } else {
      form.reset({
        // Reset to defaults for adding new
        id: undefined,
        name: '',
        description: '',
        type: 'sse-client',
        url: '',
        autoApproveTools: false,
      });
    }
    setIsFormOpen(true);
  };

  const handleFormSubmit = (data: McpServerFormData) => {
    const configData = {
      name: data.name,
      description: data.description || '', // Ensure description is string or empty
      type: data.type,
      url: data.url || '', // Ensure url is string or empty
      autoApproveTools: data.autoApproveTools,
    };

    if (editingServer && data.id) {
      // Update existing server
      updateServer({ id: data.id, ...configData });
    } else {
      // Add new server
      addServer(configData);
    }
    setIsFormOpen(false); // Close dialog on success
  };

  const handleDeleteClick = (serverId: string) => {
    if (
      window.confirm(
        'Are you sure you want to delete this MCP server configuration?',
      )
    ) {
      deleteServer(serverId);
    }
  };

  const getConnectionStatus = (serverId: string) => {
    const state = serverStates.get(serverId);
    if (state?.isConnecting)
      return {
        text: 'Connecting',
        color: 'text-yellow-500',
        icon: LuCircleDotDashed,
      };
    if (state?.isConnected)
      return { text: 'Connected', color: 'text-green-500', icon: LuPlugZap };
    if (state?.error)
      return {
        text: 'Error',
        color: 'text-red-500',
        icon: LuUnplug,
        error: state.error,
      };
    return { text: 'Disconnected', color: 'text-gray-500', icon: LuX }; // Default/Initial state
  };

  return (
    <TooltipProvider>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">MCP Servers</h3>
            <p className="text-muted-foreground text-sm">
              Manage connections to external tools and resources.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => connectAll()}
              title="Connect to all enabled servers"
            >
              <LuPlug className="mr-2 h-4 w-4" /> Connect All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnectAll()}
              title="Disconnect from all servers"
            >
              <LuUnplug className="mr-2 h-4 w-4" /> Disconnect All
            </Button>
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={() => handleOpenForm()}>
                  <LuPlus className="mr-2 h-4 w-4" /> Add Server
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingServer ? 'Edit' : 'Add'} MCP Server
                  </DialogTitle>
                  <DialogDescription>
                    Configure connection details for an MCP server.
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(handleFormSubmit)}
                    className="space-y-4"
                  >
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input placeholder="My Custom Tools" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
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
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Server Type</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            value={field.value}
                            disabled={
                              !!editingServer &&
                              editingServer.type === 'builtin-pseudo'
                            }
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select server type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {/* Only allow adding SSE type manually */}
                              {/* <SelectItem value="builtin-pseudo" disabled>Built-in Pseudo Server</SelectItem> */}
                              <SelectItem value="sse-client">
                                SSE Client (External)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {/* Conditionally render URL input */}
                    {form.watch('type') === 'sse-client' && (
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
                                value={field.value ?? ''}
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
                    <FormField
                      control={form.control}
                      name="autoApproveTools"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                          <div className="space-y-0.5">
                            <FormLabel>Auto-Approve Tool Calls</FormLabel>
                            <FormDescription>
                              Automatically approve all tool calls from this
                              server without asking. Use with caution.
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
                        onClick={() => setIsFormOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={!form.formState.isValid}>
                        {editingServer ? 'Save Changes' : 'Add Server'}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Server List Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">Enabled</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No MCP servers configured. Add one to get started.
                  </TableCell>
                </TableRow>
              )}
              {servers.map((server) => {
                const status = getConnectionStatus(server.id);
                const state = serverStates.get(server.id);
                const isConnected = state?.isConnected ?? false;
                const isConnecting = state?.isConnecting ?? false;
                const isBuiltin = server.type === 'builtin-pseudo';

                return (
                  <TableRow key={server.id}>
                    <TableCell>
                      <Switch
                        checked={server.enabled}
                        onCheckedChange={() => toggleEnabled(server.id)}
                        aria-label={`Enable ${server.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{server.name}</div>
                      <div className="text-muted-foreground max-w-xs truncate text-xs">
                        {server.description ||
                          (isBuiltin ? 'Built-in server' : 'No description')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              'flex items-center gap-1.5 text-xs',
                              status.color,
                            )}
                          >
                            <status.icon
                              className={cn(
                                'h-3.5 w-3.5',
                                isConnecting && 'animate-spin',
                              )}
                            />
                            {status.text}
                          </div>
                        </TooltipTrigger>
                        {status.error && (
                          <TooltipContent>
                            <p>Error: {status.error}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <span className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                        {server.type === 'builtin-pseudo'
                          ? 'Built-in'
                          : server.type === 'sse-client'
                            ? 'SSE'
                            : server.type}
                      </span>
                      {server.type === 'sse-client' && server.url && (
                        <Tooltip delayDuration={100}>
                          <TooltipTrigger asChild>
                            <button
                              className="ml-1"
                              onClick={() =>
                                navigator.clipboard.writeText(server.url!)
                              }
                            >
                              <LuInfo className="text-muted-foreground h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{server.url}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            isConnected
                              ? disconnectServer(server.id)
                              : connectServer(server.id)
                          }
                          disabled={!server.enabled || isConnecting} // Disable if not enabled or connecting
                          title={isConnected ? 'Disconnect' : 'Connect'}
                        >
                          {isConnecting ? (
                            <LuRefreshCw className="h-4 w-4 animate-spin" />
                          ) : isConnected ? (
                            <LuUnplug className="h-4 w-4" />
                          ) : (
                            <LuPlug className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleOpenForm(server)}
                          title="Edit Server"
                        >
                          Edit
                        </Button>
                        {!isBuiltin && ( // Don't allow deleting built-in server
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleDeleteClick(server.id)}
                            title="Delete Server"
                          >
                            <LuTrash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </TooltipProvider>
  );
};
