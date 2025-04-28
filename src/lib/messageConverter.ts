// src/lib/messageConverter.ts (New File)
import type { MessageEntity } from '@/types/internal';
import type OpenAI from 'openai';

/**
 * Converts an array of internal messages into the format expected by the
 * OpenAI Chat Completions API.
 *
 * - Filters out hidden messages.
 * - Maps roles (user, assistant, system, tool).
 * - Extracts content.
 * - Handles potential future multi-modal content.
 * - Strips internal metadata not needed by the API.
 *
 * Note: This initial version focuses on text content and basic roles.
 * It does NOT yet explicitly handle OpenAI's 'tool_calls' or assistant messages
 * requesting tool calls in their specific format, as MCP handles tool calls
 * via code blocks in this application. 'tool_call_result' internal role
 * is mapped to OpenAI's 'tool' role.
 */
export function convertToOpenAIMessages(
  internalMessages: MessageEntity[],
): OpenAI.ChatCompletionMessageParam[] {
  const openAiMessages: OpenAI.ChatCompletionMessageParam[] = [];

  for (const msg of internalMessages) {
    // Skip messages marked as hidden (e.g., internal instructions fed back to AI)
    if (msg.isHidden) {
      continue;
    }

    // Skip messages representing pending tool calls (these are UI states)
    if (msg.role === 'tool_call_pending') {
      continue;
    }

    let messageParam: OpenAI.ChatCompletionMessageParam | null = null;

    switch (msg.role) {
      case 'system':
        messageParam = {
          role: 'system',
          content: msg.content,
        };
        break;
      case 'user':
        // TODO: Handle multi-modal content (images, files) later
        // For now, assuming text content only
        messageParam = {
          role: 'user',
          content: msg.content,
        };
        break;
      case 'assistant':
        // If this assistant message *contains* a tool call request (via msg.toolCallInfo of type 'pending' or similar),
        // OpenAI's API expects a specific 'tool_calls' array.
        // However, since we use MCP via code blocks, we generally just send the text content.
        // If native OpenAI tool calling support is added later, this needs adjustment.
        messageParam = {
          role: 'assistant',
          content: msg.content || null, // Pass null if content is empty (e.g., only a tool call was made - though MCP includes text)
          // tool_calls: [], // Add if supporting native tool calls
        };
        // Strip out MCP block before sending back to AI to avoid confusion? Optional.
        // if (messageParam.content) {
        //    messageParam.content = messageParam.content.replace(/(\n*)?```json:mcp-tool-call[\s\S]*?```\s*$/,'').trim();
        // }
        break;
      case 'tool_call_result':
        // Map our internal 'tool_call_result' to OpenAI's 'tool' role
        if (msg.toolCallInfo?.callId) {
          messageParam = {
            role: 'tool',
            tool_call_id: msg.toolCallInfo.callId, // Required by OpenAI
            content: msg.content, // The result content
          };
        } else {
          console.warn(
            `Message ${msg.id} has role 'tool_call_result' but missing toolCallInfo.callId. Skipping.`,
          );
        }
        break;

      // Skip other internal roles/types not relevant to the API
      default:
        console.warn(
          `Skipping message ${msg.id} with unhandled role for API: ${msg.role}`,
        );
        break;
    }

    if (messageParam) {
      // Basic validation: Ensure content is not undefined (null is okay for assistant)
      if (messageParam.content !== undefined) {
        openAiMessages.push(messageParam);
      } else {
        console.warn(
          `Skipping message ${msg.id} due to undefined content after conversion.`,
        );
      }
    }
  }

  return openAiMessages;
}

// Add conversion functions for other providers (e.g., Anthropic, Google) here later if needed.
// export function convertToAnthropicMessages(...) {}
// export function convertToGoogleMessages(...) {}
