import { Client } from '@moinfra/mcp-client-sdk/client/index.js';
import { PseudoTransport } from '@moinfra/mcp-client-sdk/client/pseudo.js';
import { McpServer } from '@moinfra/mcp-client-sdk/server/mcp.js';
import {
  CallToolResult,
  Implementation,
} from '@moinfra/mcp-client-sdk/types.js';
import { z } from 'zod';
import { Button } from './ui/Button';

export function Demo() {
  async function runDemo() {
    console.log('Setting up McpServer...');
    const serverInfo: Implementation = {
      name: 'PseudoServer',
      version: '1.0.0',
    };
    const mcpServer = new McpServer(serverInfo);

    // Register a simple echo tool on the server
    mcpServer.tool(
      'echo',
      'Replies with the input message',
      { message: z.string().describe('The message to echo back') } as any,
      async (args: any): Promise<CallToolResult> => {
        console.log('[Server Tool] Echoing:', args.message);
        return {
          content: [{ type: 'text', text: `Server echoed: ${args.message}` }],
        };
      },
    );
    console.log("McpServer configured with 'echo' tool.");

    console.log('\nCreating PseudoTransport and Client...');
    const transport = new PseudoTransport(mcpServer);
    const client = new Client({ name: 'PseudoClient', version: '1.0.0' });

    try {
      console.log(
        '\nConnecting Client to PseudoTransport (this also connects the server internally)...',
      );
      // Client connect calls transport.start(), which connects the server
      console.log('\nClient initializing connection...');
      await client.connect(transport);
      console.log('Client connected.');

      console.log('\nClient listing tools...');
      const toolsResult = await client.listTools();
      console.log('[Client] Tools listed:', toolsResult.tools);

      console.log("\nClient calling 'echo' tool...");
      const echoResult = await client.callTool({
        name: 'echo',
        arguments: { message: 'Hello Pseudo World!' },
      });
      console.log('[Client] Echo tool result:', echoResult);
    } catch (error) {
      console.error('\nError during pseudo communication:', error);
    } finally {
      console.log('\nClosing client connection (which closes transport)...');
      await client.close(); // This calls transport.close()
      // Optionally ensure server is also cleaned up if needed
      // await mcpServer.close();
      console.log('\nExample finished.');
    }
  }

  return (
    <>
      <Button onClick={runDemo}>Run Demo</Button>
    </>
  );
}
