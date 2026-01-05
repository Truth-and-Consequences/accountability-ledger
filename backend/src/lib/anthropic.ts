// Anthropic Claude API client for LLM extraction

import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { logger } from './logger.js';

// Lazy-initialized client (only created when first used)
let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    if (!config.anthropic.apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return client;
}

export interface ClaudeRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ClaudeResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Invoke Claude for extraction with exponential backoff retry.
 */
export async function invokeClaudeExtraction(
  request: ClaudeRequest
): Promise<ClaudeResponse> {
  const { retryAttempts, retryDelayMs } = config.extraction;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retryAttempts; attempt++) {
    try {
      return await invokeClaudeOnce(request);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it's a rate limit error
      const isRateLimit =
        lastError.message.includes('rate') ||
        lastError.message.includes('429') ||
        lastError.message.includes('overloaded');

      if (isRateLimit && attempt < retryAttempts - 1) {
        const delay = retryDelayMs * Math.pow(2, attempt);
        logger.warn(
          { attempt: attempt + 1, delay, error: lastError.message },
          'Rate limited by Anthropic API, retrying...'
        );
        await sleep(delay);
        continue;
      }

      // Non-retryable error or last attempt
      throw lastError;
    }
  }

  throw lastError;
}

/**
 * Single invocation of Claude (no retry).
 */
async function invokeClaudeOnce(request: ClaudeRequest): Promise<ClaudeResponse> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: config.anthropic.model,
    max_tokens: request.maxTokens || config.extraction.maxTokens,
    temperature: request.temperature ?? 0, // Default to deterministic
    messages: [{ role: 'user', content: request.prompt }],
  });

  // Extract text content from response
  const textContent = response.content.find((block) => block.type === 'text');
  const content = textContent?.type === 'text' ? textContent.text : '';

  logger.debug(
    {
      model: config.anthropic.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    'Claude extraction completed'
  );

  return {
    content,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
