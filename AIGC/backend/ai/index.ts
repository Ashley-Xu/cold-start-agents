// AI Module - OpenAI Client Initialization
//
// IMPORTANT: This module does NOT use the Mastra framework.
// We use direct OpenAI SDK integration for:
// - Better Deno compatibility (Mastra requires Prisma with native Node modules)
// - Simpler codebase (no framework overhead)
// - Direct control over AI agent behavior
//
// The directory was renamed from "mastra/" to "ai/" to avoid confusion.

import OpenAI from "openai";

// ============================================================================
// OpenAI Client Initialization
// ============================================================================

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

if (!OPENAI_API_KEY) {
  throw new Error(
    "OPENAI_API_KEY environment variable is required",
  );
}

export const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

console.log("✅ OpenAI client initialized");

// ============================================================================
// Model Configuration
// ============================================================================

/**
 * Default model for AI agents
 */
export const DEFAULT_MODEL = "gpt-4o-mini";

/**
 * Model configurations for different use cases
 */
export const MODEL_CONFIG = {
  // Fast, cheap model for planning/analysis
  planning: {
    model: "gpt-4o-mini",
    temperature: 0.7,
    max_tokens: 2000,
  },

  // Creative model for script writing
  creative: {
    model: "gpt-4o-mini",
    temperature: 0.8,
    max_tokens: 3000,
  },

  // Precise model for structured output
  structured: {
    model: "gpt-4o-mini",
    temperature: 0.3,
    max_tokens: 2000,
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate text completion using OpenAI
 * @param prompt - Text prompt
 * @param systemMessage - System message
 * @param config - Model configuration
 * @returns Generated text
 */
export async function generateText(
  prompt: string,
  systemMessage: string,
  config = MODEL_CONFIG.planning,
): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt },
      ],
      temperature: config.temperature,
      max_tokens: config.max_tokens,
    });

    const text = response.choices[0]?.message?.content || "";
    return text;
  } catch (error) {
    console.error("❌ Error generating text:", error);
    throw error;
  }
}

/**
 * Generate structured JSON output using OpenAI
 * @param prompt - Text prompt
 * @param systemMessage - System message
 * @param schema - JSON schema for structured output
 * @param config - Model configuration
 * @returns Parsed JSON object
 */
export async function generateStructuredOutput<T>(
  prompt: string,
  systemMessage: string,
  schema: object,
  config = MODEL_CONFIG.structured,
): Promise<T> {
  try {
    const response = await openai.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt },
      ],
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      response_format: { type: "json_object" },
    });

    const text = response.choices[0]?.message?.content || "{}";
    const data = JSON.parse(text) as T;

    // TODO: Add schema validation using Zod
    return data;
  } catch (error) {
    console.error("❌ Error generating structured output:", error);
    throw error;
  }
}

/**
 * Generate embeddings for text (for asset similarity search)
 * @param text - Text to embed
 * @returns Embedding vector (1536 dimensions)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error("❌ Error generating embedding:", error);
    throw error;
  }
}

/**
 * Calculate token count for text (rough estimate)
 * @param text - Text to count
 * @returns Estimated token count
 */
export function estimateTokenCount(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

/**
 * Estimate cost for OpenAI API call
 * @param tokenCount - Number of tokens
 * @param model - Model name
 * @returns Estimated cost in USD
 */
export function estimateCost(
  tokenCount: number,
  model: string = DEFAULT_MODEL,
): number {
  // Pricing (as of December 2024)
  const pricing: Record<string, { input: number; output: number }> = {
    "gpt-4o-mini": {
      input: 0.15 / 1_000_000, // $0.15 per 1M input tokens
      output: 0.60 / 1_000_000, // $0.60 per 1M output tokens
    },
    "gpt-4o": {
      input: 2.50 / 1_000_000, // $2.50 per 1M input tokens
      output: 10.00 / 1_000_000, // $10.00 per 1M output tokens
    },
  };

  const modelPricing = pricing[model] || pricing["gpt-4o-mini"];

  // Assume equal split between input and output tokens
  const inputTokens = tokenCount / 2;
  const outputTokens = tokenCount / 2;

  return (inputTokens * modelPricing.input) +
    (outputTokens * modelPricing.output);
}

// ============================================================================
// Export all
// ============================================================================

export default {
  openai,
  DEFAULT_MODEL,
  MODEL_CONFIG,
  generateText,
  generateStructuredOutput,
  generateEmbedding,
  estimateTokenCount,
  estimateCost,
};
