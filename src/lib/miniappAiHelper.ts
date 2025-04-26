// src/lib/miniappAiHelper.ts
import { Getter } from 'jotai';
import { toast } from 'sonner';
// Assuming the host has a way to make LLM calls, similar to miniappLlmService
// We might need to import or define a function like this:
// import { hostLlmCall } from './hostLlmUtils'; // Placeholder for actual host LLM call function

// --- Placeholder for the actual host LLM calling function ---
// This needs to be implemented based on your host's capabilities.
// It should take a prompt and return the LLM's text response.
// For simplicity, let's assume a non-streaming function exists.
async function hostLlmCall(
  get: Getter,
  prompt: string,
  model?: string,
): Promise<string> {
  // TODO: Replace this with your actual host LLM call implementation.
  // This might involve:
  // 1. Selecting an appropriate model (e.g., from settings).
  // 2. Getting API keys/endpoints.
  // 3. Calling the OpenAI API (or other provider) directly using necessary parameters.
  // 4. Handling errors robustly.
  console.warn(
    'hostLlmCall: Placeholder implementation used. Replace with actual LLM call.',
  );
  toast.warning('AI Generation: Using placeholder LLM response.');

  // Example using a hypothetical direct OpenAI call (needs proper setup)
  /*
    try {
        const targetModelId = model || get(defaultModelAtom); // Use specified or default
        const { apiKey, baseUrl, modelName } = resolveApiConfig(targetModelId, get); // Reuse logic from miniappLlmService?
        if (!apiKey) throw new Error("LLM API Key not configured for host.");

        const openai = new OpenAI({ apiKey, baseURL: baseUrl || undefined, dangerouslyAllowBrowser: true });
        const response = await openai.chat.completions.create({
            model: modelName,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.5, // Lower temp for more predictable code gen
            max_tokens: 3000, // Adjust as needed
            stream: false,
        });
        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error("LLM returned empty content.");
        return content;
    } catch (error: any) {
        console.error("Error in hostLlmCall placeholder:", error);
        throw new Error(`Host LLM Call failed: ${error.message}`);
    }
    */

  // Placeholder response for development without actual LLM call
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Generated Placeholder</title>
    <style>
      body { padding: 1rem; }
      .output { margin-top: 1rem; border: 1px solid #ccc; padding: 0.5rem; min-height: 50px; background: #f9f9f9; }
    </style>
</head>
<body class="daan-ui"> <h1>AI Generated App</h1>
    <p>Based on description: <em>${prompt.split('User Request:')[1]?.split('\n')[0]?.trim() || 'N/A'}</em></p>
    <button id="action-btn">Click Me</button>
    <div id="output" class="output">Output area...</div>

    <script>
      // Vanilla JS - NO React/Vue etc.
      (async () => {
          console.log('AI Generated Miniapp Script Loaded');
          // Check if hostApi exists
          if (!window.hostApi) {
              console.error("hostApi not found!");
              document.getElementById('output').textContent = 'Error: hostApi not available.';
              return;
          }

          const btn = document.getElementById('action-btn');
          const outputDiv = document.getElementById('output');

          // Example: Use storage API
          const counterKey = 'aiAppCounter';
          let count = await window.hostApi.storage.getItem(counterKey) || 0;
          outputDiv.textContent = 'Click count (loaded from storage): ' + count;

          btn.addEventListener('click', async () => {
              outputDiv.textContent = 'Button clicked! Incrementing count...';
              count++;
              await window.hostApi.storage.setItem(counterKey, count);
              outputDiv.textContent = 'Click count (saved to storage): ' + count;
              window.hostApi.log('AI App Button clicked, new count:', count);
          });

           // Example: Get LLM models (requires llmAccess permission)
           try {
               const models = await window.hostApi.llm.getModels();
               console.log("Available LLM Models:", models);
           } catch (err) {
               console.warn("Could not get LLM models (maybe no permission?):", err.message);
           }

      })();
    </script>
    </body>
</html>
    `;
}

/**
 * Constructs the prompt for the LLM to generate/modify Miniapp code.
 * @param description User's natural language request.
 * @param currentHtml The current HTML content (empty string if generating new).
 * @returns The full prompt string.
 */
function constructMiniappGenerationPrompt(
  description: string,
  currentHtml: string,
): string {
  const goal =
    currentHtml.trim() === '' ? 'generate a new' : 'modify the existing';
  const hostApiInfo = `
The Miniapp runs in an iframe and communicates with the host application via a 'window.hostApi' object. Key available methods:
- hostApi.log(...args): Logs messages to the host console. Returns Promise<void>.
- hostApi.getOwnConfig(): Gets the Miniapp's saved config. Returns Promise<object>.
- hostApi.setOwnConfig(config): Saves the Miniapp's config. Returns Promise<void>.
- hostApi.storage.setItem(key, value): Stores JSON-serializable data for this Miniapp. Returns Promise<void>.
- hostApi.storage.getItem(key): Retrieves stored data. Returns Promise<any | null>.
- hostApi.storage.removeItem(key): Removes stored data. Returns Promise<void>.
- hostApi.storage.getAllKeys(): Gets all stored keys for this Miniapp. Returns Promise<string[]>.
- hostApi.registerFunction(name, handler): Registers a function callable by the host/other apps. Handler can be async.
- hostApi.unregisterFunction(name): Unregisters a function.
- hostApi.llm.getModels(): Gets available LLM models. Returns Promise<LlmModelInfo[]>. (Requires 'llmAccess' permission)
- hostApi.llm.call(options): Initiates an LLM call via the host. Requires options: { requestId: string, model: string, messages: Array<{role, content}>, stream: boolean, ... }. Returns Promise<void>. Listen for DOM events 'daan:llmChunk', 'daan:llmFinal', 'daan:llmError' with details containing the requestId. (Requires 'llmAccess' permission)
- hostApi.llm.abort(requestId): Aborts an ongoing LLM call. Returns Promise<void>. (Requires 'llmAccess' permission)
All async hostApi methods return Promises that resolve/reject based on host execution.
`;

  const constraints = `
CONSTRAINTS:
- You MUST generate a single, complete HTML file.
- Include ALL necessary CSS within <style> tags and ALL JavaScript within <script> tags in the HTML file. Do NOT assume external files.
- Use ONLY VANILLA JAVASCRIPT. Do NOT use React, Vue, jQuery, or any other frameworks or libraries unless explicitly provided via a standard browser API.
- State must be managed manually within the script.
- The host automatically includes 'hostApi.js', making 'window.hostApi' available. Do NOT include it yourself.
- For styling, the host injects '/daan-ui-miniapp.css'. Native HTML elements (button, input, p, h1, etc.) will be styled automatically if the <body> tag has the class "daan-ui". Add this class to the body tag for standard styling. The host manages theme switching via 'theme-light'/'theme-dark' classes on the body. Your CSS should primarily use CSS variables provided by the host (e.g., --background, --foreground, --primary, --radius).
- Ensure the generated code is secure and avoids common pitfalls like injection vulnerabilities if processing external data (though primarily rely on hostApi for external interactions).
`;

  const outputFormat = `
OUTPUT FORMAT:
Respond ONLY with the raw HTML code for the complete Miniapp file. Do not include any explanations, markdown formatting (like \`\`\`html), or any text before or after the HTML code.
`;

  const modificationContext =
    goal === 'modify the existing'
      ? `\nCURRENT CODE TO MODIFY:\n\`\`\`html\n${currentHtml}\n\`\`\`\n`
      : '';

  return `
You are an expert web developer specializing in creating self-contained HTML/CSS/Vanilla JS applications (Miniapps) that run within an iframe and interact with a host application via a specific API.

GOAL: ${goal} Miniapp based on the user's request.

${constraints}

${hostApiInfo}

User Request: ${description}
${modificationContext}
${outputFormat}
`;
}

/**
 * Calls the host LLM to generate or modify Miniapp code based on a description.
 * @param description User's natural language request.
 * @param currentHtml Current HTML content (empty string for generation).
 * @param get Jotai getter for accessing host settings (e.g., default model).
 * @returns Promise resolving with the generated/modified HTML string.
 */
export async function generateOrModifyMiniappCode(
  description: string,
  currentHtml: string,
  get: Getter,
): Promise<string> {
  if (!description?.trim()) {
    throw new Error('Description cannot be empty.');
  }

  const prompt = constructMiniappGenerationPrompt(description, currentHtml);
  console.log('AI Helper: Sending prompt to host LLM:', prompt); // Log prompt for debugging

  try {
    toast.info('Generating code with AI...');
    // TODO: Select appropriate model for code generation if possible
    const modelForCodeGen = 'openai::gpt-4o'; // Example: Use a capable model
    const rawResponse = await hostLlmCall(get, prompt /*, modelForCodeGen */);

    // Basic cleanup: Remove potential markdown code fences if the LLM didn't follow instructions
    const cleanedHtml = rawResponse
      .replace(/^```html\s*/i, '') // Remove leading ```html
      .replace(/\s*```$/, '') // Remove trailing ```
      .trim();

    if (!cleanedHtml) {
      throw new Error('LLM returned empty code.');
    }

    toast.success('AI code generation complete.');
    return cleanedHtml;
  } catch (error: any) {
    console.error('AI Helper: Error during code generation:', error);
    toast.error(`AI Generation Failed: ${error.message}`);
    throw error; // Rethrow so the UI can handle it
  }
}
