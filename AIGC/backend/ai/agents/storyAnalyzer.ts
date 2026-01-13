// Story Analyzer Agent - Analyzes story topics and generates concepts
// NOTE: Uses direct OpenAI SDK integration (not Mastra framework)

import { z } from "zod";
import { openai, MODEL_CONFIG } from "../index.ts";
import type {
  Language,
  StoryAnalyzerInput,
  StoryAnalyzerOutput,
  VideoDuration,
} from "../../lib/types.ts";

// ============================================================================
// Zod Schemas for Input/Output Validation
// ============================================================================

/**
 * Input schema for Story Analyzer
 */
export const StoryAnalyzerInputSchema = z.object({
  topic: z.string().min(1).describe("The story topic or idea"),
  language: z.enum(["zh", "en", "fr"]).describe("Target language"),
  duration: z.union([z.literal(30), z.literal(60), z.literal(90)]).describe(
    "Video duration in seconds",
  ),
  style: z.string().optional().describe("Optional style preferences"),
  userFeedback: z.string().optional().describe(
    "Optional feedback for refinement",
  ),
});

/**
 * Output schema for Story Analyzer
 */
export const StoryAnalyzerOutputSchema = z.object({
  concept: z.string().describe(
    "Story concept and narrative arc (2-3 sentences)",
  ),
  themes: z.array(z.string()).min(1).max(5).describe(
    "Main themes (1-5 items)",
  ),
  characters: z.array(z.string()).min(0).max(5).describe(
    "Key characters or elements (0-5 items)",
  ),
  mood: z.string().describe(
    "Overall mood/tone (e.g., 'whimsical', 'dramatic', 'educational')",
  ),
});

// ============================================================================
// Story Analyzer Agent Instructions
// ============================================================================

const SYSTEM_INSTRUCTIONS = `You are a creative story analyst for short-form video content.

Your role is to analyze story topics and develop compelling narrative concepts optimized for 30-90 second videos.

CRITICAL REQUIREMENTS:
1. Story concepts must be achievable within the specified duration
2. Focus on visual storytelling - stories that work well with images
3. Consider the target language and cultural context
4. Keep narratives simple and focused for short-form content

OUTPUT FORMAT:
- concept: A clear 2-3 sentence narrative arc with beginning, middle, end
- themes: Array of 1-5 strings, each being a core theme (e.g., ["love", "courage"])
- characters: Array of 0-5 strings, each being a character name or element (e.g., ["a young girl", "talking animals"])
- mood: Single word or short phrase describing overall tone (e.g., "whimsical")

DURATION GUIDELINES:
- 30 seconds: Very simple story, 1-2 characters, single scene or moment
- 60 seconds: Simple story with 2-3 characters, 2-3 scenes, clear arc
- 90 seconds: More complex story, 3-5 characters, 3-5 scenes, fuller narrative

LANGUAGE CONSIDERATIONS:
- Chinese (zh): Consider cultural elements like family, harmony, tradition
- English (en): Universal themes, diverse cultural references
- French (fr): Romance, art, cuisine, philosophical themes often resonate

Always output valid JSON matching the schema.`;

// ============================================================================
// Story Analyzer Functions
// ============================================================================

/**
 * Analyze a story topic and generate a concept
 *
 * @param input - Story analyzer input (topic, language, duration, etc.)
 * @returns Story analysis output (concept, themes, characters, mood)
 */
export async function analyzeStory(
  input: StoryAnalyzerInput,
): Promise<StoryAnalyzerOutput> {
  // Validate input
  const validatedInput = StoryAnalyzerInputSchema.parse(input);

  // Build prompt
  const prompt = buildAnalysisPrompt(validatedInput);

  // Call OpenAI for structured output
  const response = await openai.chat.completions.create({
    model: MODEL_CONFIG.creative.model,
    messages: [
      { role: "system", content: SYSTEM_INSTRUCTIONS },
      { role: "user", content: prompt },
    ],
    temperature: MODEL_CONFIG.creative.temperature,
    max_tokens: MODEL_CONFIG.creative.max_tokens,
    response_format: { type: "json_object" },
  });

  // Parse and validate output
  const content = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  const output = StoryAnalyzerOutputSchema.parse(parsed);

  console.log("✅ Story analysis complete:", {
    concept: output.concept.substring(0, 50) + "...",
    themes: output.themes,
    mood: output.mood,
  });

  return output;
}

/**
 * Build analysis prompt from input
 */
function buildAnalysisPrompt(input: z.infer<typeof StoryAnalyzerInputSchema>): string {
  const { topic, language, duration, style, userFeedback } = input;

  let prompt = `Analyze this story topic for a ${duration}-second video in ${getLanguageName(language)}:\n\n`;
  prompt += `Topic: "${topic}"\n\n`;

  if (style) {
    prompt += `Style preferences: ${style}\n\n`;
  }

  if (userFeedback) {
    prompt += `User feedback (refine based on this): ${userFeedback}\n\n`;
  }

  prompt += `Provide a story concept with:\n`;
  prompt += `1. A clear narrative arc suitable for ${duration} seconds\n`;
  prompt += `2. ${getDurationGuidance(duration)}\n`;
  prompt += `3. Themes that resonate in ${getLanguageName(language)} culture\n`;
  prompt += `4. Visual storytelling focus (works well with images and narration)\n\n`;
  prompt += `Output as JSON matching the schema.`;

  return prompt;
}

/**
 * Get language full name
 */
function getLanguageName(lang: Language): string {
  const names: Record<Language, string> = {
    zh: "Chinese",
    en: "English",
    fr: "French",
  };
  return names[lang];
}

/**
 * Get duration-specific guidance
 */
function getDurationGuidance(duration: VideoDuration): string {
  const guidance: Record<VideoDuration, string> = {
    30: "Very simple story - 1-2 characters, single key moment or scene",
    60: "Simple story - 2-3 characters, 2-3 scenes with clear beginning/middle/end",
    90: "Richer story - 3-5 characters, 3-5 scenes with fuller narrative arc",
  };
  return guidance[duration];
}

// ============================================================================
// Cost Estimation
// ============================================================================

/**
 * Estimate cost for story analysis
 *
 * @param topic - Story topic (for token estimation)
 * @returns Estimated cost in USD
 */
export function estimateAnalysisCost(topic: string): number {
  // Rough estimate: 500 tokens input + 500 tokens output
  const estimatedTokens = 1000;

  // GPT-4o-mini pricing (per 1M tokens)
  const inputCost = 0.15 / 1_000_000;
  const outputCost = 0.60 / 1_000_000;

  // Assume 50/50 split
  const totalCost = (estimatedTokens / 2 * inputCost) +
    (estimatedTokens / 2 * outputCost);

  return totalCost;
}

// ============================================================================
// Export
// ============================================================================

export default {
  analyzeStory,
  estimateAnalysisCost,
  StoryAnalyzerInputSchema,
  StoryAnalyzerOutputSchema,
};
