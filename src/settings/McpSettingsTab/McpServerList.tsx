import { Button } from '@/components/ui/Button';
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
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils'; // Adjust import path
import { McpServerConfig, McpServerState } from '@/store/mcp'; // Adjust import path
import React from 'react';
import {
  LuCircleDotDashed,
  LuInfo,
  LuPencil, // Using Pencil for Edit for clarity
  LuPlug,
  LuPlugZap,
  LuRefreshCw,
  LuTrash2,
  LuUnplug,
  LuX,
} from 'react-icons/lu';

// Helper function to get connection status display properties
// (Can be moved to a utils file if preferred)
const getConnectionStatus = (state: McpServerState | undefined) => {
  if (state?.isConnecting)
    return {
      text: 'Connecting',
      color: 'text-yellow-500',
      icon: LuCircleDotDashed,
      isConnecting: true,
      isConnected: false,
    };
  if (state?.isConnected)
    return {
      text: 'Connected',
      color: 'text-green-500',
      icon: LuPlugZap,
      isConnecting: false,
      isConnected: true,
    };
  if (state?.error)
    return {
      text: 'Error',
      color: 'text-red-500',
      icon: LuUnplug,
      error: state.error,
      isConnecting: false,
      isConnected: false,
    };
  // Default/Initial state or explicitly disconnected
  return {
    text: 'Disconnected',
    color: 'text-gray-500',
    icon: LuX,
    isConnecting: false,
    isConnected: false,
  };
};

interface McpServerListProps {
  servers: McpServerConfig[];
  serverStates: Map<string, McpServerState>;
  onToggleEnabled: (serverId: string) => void;
  onConnect: (serverId: string) => void;
  onDisconnect: (serverId: string) => void;
  onEdit: (server: McpServerConfig) => void;
  onDelete: (serverId: string) => void;
}

export const McpServerList: React.FC<McpServerListProps> = ({
  servers,
  serverStates,
  onToggleEnabled,
  onConnect,
  onDisconnect,
  onEdit,
  onDelete,
}) => {
  const handleDeleteClick = (serverId: string, serverName: string) => {
    if (
      window.confirm(
        `Are you sure you want to delete the MCP server "${serverName}"?`,
      )
    ) {
      onDelete(serverId);
    }
  };

  const getTypeDisplay = (server: McpServerConfig) => {
    switch (server.type) {
      case 'builtin-pseudo':
        return 'Built-in';
      case 'sse':
        return 'SSE';
      case 'stdio':
        return 'Stdio';
    }
  };

  const getTooltipContent = (server: McpServerConfig) => {
    if (server.type === 'sse') {
      return <p>URL: {server.url}</p>;
    }
    if (server.type === 'stdio') {
      return (
        <p>
          Cmd: {server.command} {server.args.join(' ')}
        </p>
      );
    }
    return null;
  };

  return (
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
            const state = serverStates.get(server.id);
            const status = getConnectionStatus(state);
            const isBuiltin = server.type === 'builtin-pseudo';
            const typeDisplay = getTypeDisplay(server);
            const infoTooltipContent = getTooltipContent(server);

            return (
              <TableRow
                key={server.id}
                data-state={status.isConnected ? 'connected' : undefined}
              >
                <TableCell>
                  <Switch
                    checked={server.enabled}
                    onCheckedChange={() => onToggleEnabled(server.id)}
                    aria-label={`Enable ${server.name}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="font-medium">{server.name}</div>
                  <div className="text-muted-foreground max-w-xs truncate text-xs">
                    {server.description ||
                      (isBuiltin ? 'Core functionality' : 'No description')}
                  </div>
                </TableCell>
                <TableCell>
                  <Tooltip delayDuration={100}>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          'flex cursor-default items-center gap-1.5 text-xs',
                          status.color,
                        )}
                      >
                        <status.icon
                          className={cn(
                            'h-3.5 w-3.5 flex-shrink-0',
                            status.isConnecting && 'animate-spin',
                          )}
                        />
                        {status.text}
                      </div>
                    </TooltipTrigger>
                    {status.error && (
                      <TooltipContent side="bottom">
                        <p className="max-w-xs text-xs break-words">
                          Error: {status.error}
                        </p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <div className="flex items-center">
                    <span className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                      {typeDisplay}
                    </span>
                    {infoTooltipContent && (
                      <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                          <button
                            className="text-muted-foreground hover:text-foreground ml-1.5"
                            aria-label="Show connection details"
                            onClick={(e) => {
                              e.preventDefault(); // Prevent row interactions if any
                              // Optionally copy details to clipboard
                              if (server.type === 'sse')
                                navigator.clipboard.writeText(server.url);
                              if (server.type === 'stdio')
                                navigator.clipboard.writeText(
                                  `${server.command} ${server.args.join(' ')}`,
                                );
                            }}
                          >
                            <LuInfo className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          {infoTooltipContent}
                          <p className="text-muted-foreground mt-1 text-xs">
                            (Click icon to copy)
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {/* Connect/Disconnect Button */}
                    {
                      // Don't show connect/disconnect for built-in
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() =>
                          status.isConnected
                            ? onDisconnect(server.id)
                            : onConnect(server.id)
                        }
                        disabled={!server.enabled || status.isConnecting}
                        title={status.isConnected ? 'Disconnect' : 'Connect'}
                      >
                        {status.isConnecting ? (
                          <LuRefreshCw className="h-4 w-4 animate-spin" />
                        ) : status.isConnected ? (
                          <LuUnplug className="h-4 w-4 text-red-500" />
                        ) : (
                          <LuPlug className="h-4 w-4 text-green-600" />
                        )}
                      </Button>
                    }
                    {/* Edit Button */}
                    {
                      // Don't allow editing built-in server details usually
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => onEdit(server)}
                        title="Edit Server"
                      >
                        <LuPencil className="h-4 w-4" />
                      </Button>
                    }
                    {/* Delete Button */}
                    {!isBuiltin && ( // Don't allow deleting built-in server
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() =>
                          handleDeleteClick(server.id, server.name)
                        }
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
  );
};
