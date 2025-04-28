// src/lib/MarketplaceService.ts
import { Octokit } from '@octokit/rest'; // pnpm add @octokit/rest gray-matter marked
import { marked } from 'marked'; // For potentially rendering description Markdown (optional)
import { toast } from 'sonner';
import { z } from 'zod';

// --- Types ---
const MarketplaceItemMetadataSchema = z
  .object({
    name: z.string(),
    icon: z.string().optional(),
    version: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    license: z.string().optional(),
    repository: z.string().url().optional(),
    // Add other metadata fields as needed
  })
  .passthrough(); // Allow extra fields

// Schema for the JSON block content
const DefinitionContainerSchema = z.record(z.string(), z.any());

export type MarketplaceItemMetadata = z.infer<
  typeof MarketplaceItemMetadataSchema
>;

export interface MarketplaceItem {
  id: number; // GitHub Issue ID
  title: string; // Issue Title (might differ slightly from name)
  url: string; // HTML URL of the issue
  state: 'open' | 'closed';
  metadata: MarketplaceItemMetadata | null; // Parsed frontmatter
  labels: string[];
  createdAt: number;
  updatedAt: number;
  githubUser: { login: string; avatarUrl?: string } | null;
}

// Includes the parsed definition and full description
export interface ParsedMarketplaceItem extends MarketplaceItem {
  definition: Record<string, any> | null; // Parsed definition from JSON block
  longDescriptionHtml: string | null; // Parsed Markdown description (optional)
}

// --- Constants ---
const GITHUB_OWNER = 'pluveto';
const GITHUB_REPO = 'daan';
const MINIAPP_LABEL = 'market-miniapp';
const CHARACTER_LABEL = 'market-character';

// --- Service Implementation ---

// Initialize Octokit (unauthenticated for now)
const octokit = new Octokit({
  // Optionally add auth token if available from settings for higher rate limits
  // auth: process.env.GITHUB_TOKEN // Example: Using an env var (not suitable for browser)
  // For browser: Provide user PAT from settings if implemented
});

function extractCodeBlock(
  markdown: string,
  lang: string,
  locator: string | undefined = undefined,
): string | null {
  if (locator) {
    // search after locator (if provided)
    const index = markdown
      .toLocaleLowerCase()
      .indexOf(locator.toLocaleLowerCase());
    if (index === -1) {
      return null;
    }
    markdown = markdown.slice(index + locator.length);
  }
  const regex = new RegExp('```' + lang + '\\s*([\\s\\S]*?)\\s*```');
  const match = markdown.match(regex);
  return match ? match[1].trim() : null;
}

/** Parses the issue body into metadata, description, and definition */
async function parseIssueBody(body: string | null | undefined): Promise<{
  metadata: z.infer<typeof MarketplaceItemMetadataSchema> | null;
  definition: Record<string, any> | null;
  longDescriptionHtml: string | null;
}> {
  if (!body)
    return { metadata: null, definition: null, longDescriptionHtml: null };

  try {
    // 1. Parse Frontmatter (metadata)
    let markdownContent = body;

    // 2. Extract Definition JSON (excluding htmlContent potentially)
    let definition: Record<string, any> | null = null;
    const jsonString = extractCodeBlock(
      markdownContent,
      'json',
      '## Installation Data',
    ); // Use helper
    if (jsonString) {
      try {
        const parsedJson = JSON.parse(jsonString);
        const definitionContainerResult =
          DefinitionContainerSchema.safeParse(parsedJson);
        if (definitionContainerResult.success) {
          definition = definitionContainerResult.data;
        } else {
          console.warn(
            'MarketplaceService: Failed to parse definition container JSON:',
            definitionContainerResult.error,
          );
        }
      } catch (jsonError) {
        console.error(
          'MarketplaceService: Invalid JSON in definition block:',
          jsonError,
        );
      }
    } else {
      console.warn(
        'MarketplaceService: Could not find JSON definition block in issue body.',
      );
    }

    const metadata =
      MarketplaceItemMetadataSchema.safeParse(definition).data ?? null;

    // --- NEW: Extract HTML Content ---
    const htmlContent = extractCodeBlock(
      markdownContent,
      'html',
      '## HTML Content',
    ); // Use helper
    const promptContent =
      extractCodeBlock(markdownContent, 'markdown', '## Prompt') ??
      extractCodeBlock(markdownContent, 'md', '## Prompt');

    // Combine if necessary: Prioritize separate HTML block if it exists
    if (definition && htmlContent) {
      // If separate HTML block exists, add/overwrite it in the definition object
      definition.htmlContent = htmlContent;
      definition.prompt = promptContent;
    } else if (definition && !definition.htmlContent) {
      // If definition exists but has no htmlContent AND no separate block was found
      console.warn(
        'MarketplaceService: Definition JSON found, but no htmlContent inside or in a separate ```html block.',
      );
      // Potentially invalidate the item? Or let install fail later? For now, keep definition as is.
    } else if (!definition && htmlContent) {
      // If ONLY html block exists, create a minimal definition? Less ideal.
      console.warn(
        'MarketplaceService: Found HTML block but no definition JSON block.',
      );
      // definition = { htmlContent: htmlString, name: metadata?.name || 'Untitled' }; // Example minimal definition
      definition = null; // Let's consider items without definition JSON invalid for now.
    }

    // ... (parse description Markdown, removing *both* code blocks) ...
    const descriptionMarkdown = markdownContent
      .replace(/```json\s*[\s\S]*?\s*```/, '')
      .replace(/```html\s*[\s\S]*?\s*```/, '') // Remove HTML block too
      .trim();
    const longDescriptionHtml = descriptionMarkdown
      ? await marked.parse(descriptionMarkdown)
      : null;

    return { metadata, definition, longDescriptionHtml };
  } catch (error) {
    console.error('MarketplaceService: Error parsing issue body:', error);
    return { metadata: null, definition: null, longDescriptionHtml: null };
  }
}

/** Fetches and processes issues for a specific marketplace label */
async function fetchMarketplaceItems(
  label: string,
  query?: string,
  page: number = 1,
  perPage: number = 50,
): Promise<{
  items: MarketplaceItem[];
  totalCount: number;
}> {
  try {
    // Construct search query: label + user query +  is:issue
    let q = `repo:${GITHUB_OWNER}/${GITHUB_REPO} is:issue label:"${label}"`;
    if (query?.trim()) {
      if (query.trim().startsWith('repo:')) {
        q = query.trim();
      }
      q += ` ${query.trim()}`; // Add user search terms
    }

    console.log(`MarketplaceService: Fetching items with query: ${q}`);
    // Use search API for filtering by label and query terms
    const response = await octokit.rest.search.issuesAndPullRequests({
      q,
      per_page: perPage, // Adjust page size as needed
      page: page,
    });

    console.log(
      `MarketplaceService: Found ${response.data.total_count} items (fetched ${response.data.items.length}).`,
      response.data.items,
    );

    const items = await Promise.all(
      response.data.items.map(
        async (issue): Promise<MarketplaceItem | null> => {
          // Parse body immediately to get metadata for display
          const { metadata } = await parseIssueBody(issue.body);

          // Skip if essential metadata (like name) is missing? Or handle in UI.
          // if (!metadata?.name) return null;

          return {
            id: issue.number,
            title: issue.title,
            url: issue.html_url,
            state: issue.state as 'open' | 'closed',
            metadata: metadata, // Use parsed metadata
            labels: issue.labels
              .map((l) => (typeof l === 'string' ? l : l.name))
              .filter((name): name is string => !!name),
            createdAt: +new Date(issue.created_at),
            updatedAt: +new Date(issue.updated_at),
            githubUser: issue.user
              ? { login: issue.user.login, avatarUrl: issue.user.avatar_url }
              : null,
          };
        },
      ),
    );

    // Filter out nulls if any parsing failed critically
    return {
      items: items.filter((item): item is MarketplaceItem => !!item),
      totalCount: response.data.total_count,
    };
  } catch (error: any) {
    console.error(`MarketplaceService: Error fetching ${label} items:`, error);
    toast.error(`Failed to fetch marketplace items: ${error.message}`);
    return { items: [], totalCount: 0 };
  }
}

/** Fetches full details including definition for a specific issue */
async function fetchItemDetails(
  issueNumber: number,
): Promise<ParsedMarketplaceItem | null> {
  try {
    console.log(
      `MarketplaceService: Fetching details for issue #${issueNumber}`,
    );
    const response = await octokit.rest.issues.get({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      issue_number: issueNumber,
    });

    const issue = response.data;
    const { metadata, definition, longDescriptionHtml } = await parseIssueBody(
      issue.body,
    );

    // Basic validation: Ensure definition was found
    if (!definition) {
      console.error(
        `MarketplaceService: No valid definition JSON found in issue #${issueNumber}.`,
      );
      toast.error(
        'Failed to get item details: Definition data missing or invalid in issue body.',
      );
      return null;
    }

    if (!longDescriptionHtml) {
      console.error(
        `MarketplaceService: No valid description html found in issue #${issueNumber}.`,
      );
      return null;
    }

    return {
      id: issue.number,
      title: issue.title,
      url: issue.html_url,
      state: issue.state as 'open' | 'closed',
      metadata: metadata,
      labels: issue.labels
        .map((l) => (typeof l === 'string' ? l : l.name))
        .filter((name): name is string => !!name),
      createdAt: +new Date(issue.created_at),
      updatedAt: +new Date(issue.updated_at),
      githubUser: issue.user
        ? { login: issue.user.login, avatarUrl: issue.user.avatar_url }
        : null,
      definition: definition, // Include the parsed definition
      longDescriptionHtml: longDescriptionHtml, // Include parsed description HTML
    };
  } catch (error: any) {
    console.error(
      `MarketplaceService: Error fetching details for issue #${issueNumber}:`,
      error,
    );
    toast.error(`Failed to get item details: ${error.message}`);
    return null;
  }
}

// --- Public API ---
export const MarketplaceService = {
  /** Search for Miniapps in the marketplace */
  searchMiniapps: (
    query?: string,
    page: number = 1,
    perPage: number = 50,
  ): Promise<{
    items: MarketplaceItem[];
    totalCount: number;
  }> => {
    return fetchMarketplaceItems(MINIAPP_LABEL, query, page, perPage);
  },
  /** Search for Characters in the marketplace */
  searchCharacters: (
    query?: string,
    page: number = 1,
    perPage: number = 50,
  ): Promise<{
    items: MarketplaceItem[];
    totalCount: number;
  }> => {
    return fetchMarketplaceItems(CHARACTER_LABEL, query, page, perPage);
  },
  /** Get full details (including definition) for a specific Miniapp issue */
  getMiniappDetails: (
    issueNumber: number,
  ): Promise<ParsedMarketplaceItem | null> => {
    // Optionally add extra validation (e.g., check label) if needed
    return fetchItemDetails(issueNumber);
  },
  /** Get full details (including definition) for a specific Character issue */
  getCharacterDetails: (
    issueNumber: number,
  ): Promise<ParsedMarketplaceItem | null> => {
    // Optionally add extra validation (e.g., check label) if needed
    return fetchItemDetails(issueNumber);
  },
};
