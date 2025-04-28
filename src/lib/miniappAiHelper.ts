// src/lib/miniappAiHelper.ts
import { defaultModelAtom } from '@/store';
import { Getter } from 'jotai';
import { toast } from 'sonner';
import { handleLlmCall } from './miniappLlmService';

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
- hostApi.llm.call(options): Initiates an LLM call via the host. Requires options: { requestId: string, model: string | undefined, messages: Array<{role, content}>, stream: boolean, ... }. Returns Promise<void>. Listen for DOM events 'daan:llmChunk', 'daan:llmFinal', 'daan:llmError' with details containing the requestId. (Requires 'llmAccess' permission)
  - When model param is set to undefined, the host will use the default model set in the host settings.
  - options.stream decide whether to stream the response (true) or get it all at once (false). when false, data will be received in 'daan:llmFinal' event.
- hostApi.llm.abort(requestId): Aborts an ongoing LLM call. Returns Promise<void>. (Requires 'llmAccess' permission)
All async hostApi methods return Promises that resolve/reject based on host execution.

Event format detail:

CustomEvent('daan:llmChunk', {
  detail: { requestId, chunk: (string) },
})
CustomEvent('daan:llmFinal', {
  detail: {
    requestId,
    result: (string),
    finishReason:
      (string),
  },
})
CustomEvent('daan:llmError', { detail: { requestId, error } })
`;

  const constraints = `
CONSTRAINTS:
- You MUST generate a single, complete HTML file, and take it seriously because it is production-ready code.
- Do NOT generate a title app title like <h1>Some Util</h1> because the host window will provide a title.
- Include ALL necessary CSS within <style> tags and ALL JavaScript within <script> tags in the HTML file. Do NOT assume external files.
- Use ONLY VANILLA JAVASCRIPT. Do NOT use React, Vue, jQuery, or any other frameworks or libraries unless explicitly provided via a standard browser API.
- State must be managed manually within the script.
- The host automatically includes 'host-api.js', making 'window.hostApi' available. Do NOT include it yourself.
- For styling, the host auto injects 'miniapp.css' Do NOT include it yourself. Native HTML elements (button, input, p, h1, etc.) are already styled where the <body> tag has the class "daan-ui". Add this class to the body tag for standard styling. 
The host manages theme switching via 'theme-light'/'theme-dark' classes on the body. !!!ONLY write custom CSS when it is fatal!!! Your CSS should primarily use CSS variables provided by the host (e.g., --background, --foreground, --primary, --radius).
- Miniapps run in a tiny window, so ensure the UI is optimized for small screens, with clear and concise text and buttons and very compact layouts.
- Ensure the generated code is secure and avoids common pitfalls like injection vulnerabilities if processing external data (though primarily rely on hostApi for external interactions).
- Dark mode is auto handled, do not handle color style manually.

All the utility classes you can use is a subset of tailwind:
.flex
.grid
.block
.inline-block
.hidden
.items-center
.justify-center
.justify-between
.relative
.absolute
.fixed
.top-0
.bottom-0
.left-0
.right-0
.z-10
.p-4
.px-4
.py-2
.m-4
.mx-auto
.mt-2
.mb-4
.ml-4
.mr-4
.space-x-4
.space-y-4
.w-full
.h-full
.w-screen
.h-screen
.w-auto
.h-auto
.w-64
.h-12
.max-w-md
.max-w-lg
.max-w-xl
.container
.text-sm
.text-base
.text-lg
.text-xl
.text-2xl
.font-bold
.font-medium
.font-semibold
.font-normal
.text-gray-700
.text-white
.text-blue-500
.text-gray-500
.text-center
.text-left
.text-right
.leading-tight
.leading-normal
.leading-relaxed
.bg-white
.bg-gray-100
.bg-blue-500
.bg-transparent
.bg-gray-800
.border
.border-gray-300
.border-blue-500
.rounded
.rounded-lg
.rounded-full
.rounded-md
.shadow
.shadow-md
.shadow-lg
.opacity-75
.opacity-100
.opacity-50
.opacity-0
.gap-1
.gap-2
.gap-4
.gap-8
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
    const rawResponse = (
      await handleLlmCall(
        get,
        {
          model: get(defaultModelAtom),
          messages: [{ role: 'user', content: prompt }],
          stream: false,
        },
        {
          onChunk: (chunk) => {},
          onComplete: () => {},
          onError: () => {},
        },
        new AbortController().signal,
      )
    )?.content;

    if (!rawResponse) {
      throw new Error('LLM returned empty response.');
    }

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
