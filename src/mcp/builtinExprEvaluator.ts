// src/mcp/builtinExprEvaluator.ts
import { McpServer } from '@moinfra/mcp-client-sdk/server/mcp.js';
import {
  CallToolResult,
  Implementation,
} from '@moinfra/mcp-client-sdk/types.js';
import { z } from 'zod';

const serverInfo: Implementation = {
  name: 'Daan Builtin Evaluator',
  version: '1.0.0',
  // Add other implementation details if needed
};

// Define the schema for the tool input using Zod
const exprEvaluatorInputSchema = z.object({
  expression: z
    .string()
    .describe('The JavaScript expression string to evaluate'),
});

// Define the handler function for the tool
async function evaluateExpression(
  args: z.infer<typeof exprEvaluatorInputSchema>,
): Promise<CallToolResult> {
  console.log('[Builtin MCP Server] Received expression:', args.expression);
  try {
    // WARNING: Using eval is inherently insecure if the input is not strictly controlled.
    // This is acceptable here ONLY because it's a local pseudo-server for trusted use.
    // DO NOT expose this functionality directly to untrusted inputs or external networks.
    // eslint-disable-next-line no-eval
    const result = eval(args.expression);

    // Attempt to stringify the result, handle potential circular references or large objects
    let resultString: string;
    try {
      if (typeof result === 'undefined') {
        resultString = 'undefined';
      } else if (result === null) {
        resultString = 'null';
      } else {
        // Simple stringification for common types
        resultString = result.toString();
        // Add more robust stringification if complex objects are expected
        // e.g., using JSON.stringify with checks or a dedicated library
      }
    } catch (stringifyError) {
      console.error(
        '[Builtin MCP Server] Error stringifying result:',
        stringifyError,
      );
      resultString = '[Error: Could not stringify result]';
    }

    console.log('[Builtin MCP Server] Evaluation result:', resultString);
    return {
      // Return the result as text content
      content: [{ type: 'text', text: resultString }],
    };
  } catch (error: any) {
    console.error('[Builtin MCP Server] Evaluation error:', error);
    return {
      // Return error information
      content: [{ type: 'text', text: `Evaluation failed: ${error.message}` }],
      isError: true,
    };
  }
}

// Function to create and configure the server instance
export function createBuiltinExprEvaluatorServer(): McpServer {
  console.log('Creating Builtin Expr Evaluator MCP Server...');
  const server = new McpServer(serverInfo);

  server.tool(
    'expr_evaluator', // Tool name
    'Evaluates a JavaScript expression string and returns the result as text. Use only for simple calculations or trusted code snippets.', // Description
    exprEvaluatorInputSchema,
    evaluateExpression, // Tool handler function
  );

  console.log("Builtin MCP Server 'expr_evaluator' tool registered.");
  return server;
}

// Optional: Atom to hold the singleton instance of the server
// This prevents recreating the server unnecessarily.
// We might manage this instance within the main MCP state atom instead.
// import { atom } from 'jotai';
// export const builtinExprEvaluatorServerAtom = atom<McpServer | null>(null);
// export const initializeBuiltinServerAtom = atom(null, (get, set) => {
//     if (!get(builtinExprEvaluatorServerAtom)) {
//         set(builtinExprEvaluatorServerAtom, createBuiltinExprEvaluatorServer());
//     }
// });
