// Script Writer Agent - Generates timestamped multilingual scripts
// NOTE: Uses direct OpenAI SDK integration (not Mastra framework)

import { z } from "zod";
import { openai, MODEL_CONFIG } from "../index.ts";
import type {
  Language,
  ScriptWriterInput,
  ScriptWriterOutput,
  VideoDuration,
} from "../../lib/types.ts";

// ============================================================================
// Zod Schemas for Input/Output Validation
// ============================================================================

/**
 * Input schema for Script Writer
 */
export const ScriptWriterInputSchema = z.object({
  concept: z.string().min(1).describe("Story concept from analyzer"),
  themes: z.array(z.string()).min(1).max(5).describe("Story themes"),
  characters: z.array(z.string()).min(0).max(5).describe("Key characters"),
  mood: z.string().describe("Overall mood/tone"),
  language: z.enum(["zh", "en", "fr"]).describe("Target language"),
  duration: z.union([z.literal(30), z.literal(60), z.literal(90)]).describe(
    "Video duration in seconds",
  ),
  style: z.string().optional().describe("Optional style preferences"),
});

/**
 * Scene schema for script output
 */
export const SceneScriptSchema = z.object({
  order: z.number().int().min(1).describe("Scene order (1-based)"),
  narration: z.string().min(1).describe("Narration text for this scene"),
  startTime: z.number().min(0).describe("Scene start time in seconds"),
  endTime: z.number().min(0).describe("Scene end time in seconds"),
  visualDescription: z.string().describe(
    "Visual description of what happens in the scene",
  ),
});

/**
 * Output schema for Script Writer
 */
export const ScriptWriterOutputSchema = z.object({
  script: z.string().min(1).describe("Complete script text"),
  scenes: z.array(SceneScriptSchema).min(1).max(10).describe(
    "Scene-by-scene breakdown",
  ),
  wordCount: z.number().int().min(1).describe("Total word count"),
  estimatedDuration: z.number().min(0).describe(
    "Estimated duration in seconds",
  ),
});

// ============================================================================
// Script Writer System Instructions
// ============================================================================

const SYSTEM_INSTRUCTIONS = `You are an expert script writer for short-form video content.

Your role is to write compelling, concise scripts optimized for 30-90 second videos with visual storytelling.

CRITICAL REQUIREMENTS:
1. Scripts must match the target duration exactly (word count based)
2. Write in the TARGET LANGUAGE (not English unless specified)
3. Create natural, engaging narration suitable for voice-over
4. Structure scenes with clear visual descriptions
5. Each scene must have precise timing (startTime, endTime)

WORD COUNT TARGETS (based on ~150 words per minute speaking rate):
- 30 seconds: 70-80 words
- 60 seconds: 140-160 words
- 90 seconds: 210-240 words

SCENE GUIDELINES:
- 30 seconds: 2-3 scenes (10-15 seconds each)
- 60 seconds: 3-5 scenes (12-20 seconds each)
- 90 seconds: 5-7 scenes (12-18 seconds each)

OUTPUT FORMAT:
- script: Complete narration text in target language
- scenes: Array of scene objects, each with:
  - order: Scene number (1, 2, 3, ...)
  - narration: Text spoken during this scene (in target language)
  - startTime: When scene starts (e.g., 0, 12, 25)
  - endTime: When scene ends (e.g., 12, 25, 30)
  - visualDescription: What viewer sees (in English for production team)
- wordCount: Total words in script
- estimatedDuration: Duration in seconds based on word count

LANGUAGE-SPECIFIC CONSIDERATIONS:
- Chinese (zh): Use natural Mandarin expressions, avoid overly formal language
- English (en): Clear, conversational tone suitable for international audience
- French (fr): Elegant phrasing, natural flow with proper liaison

NARRATION STYLE:
- Write for VOICE-OVER (not dialogue unless characters speak)
- Use present tense for immediacy
- Create emotional connection
- Keep sentences short and clear for easy voicing
- Build narrative arc: setup → development → resolution

TIMING PRECISION:
- Scenes must not overlap
- Total duration must match target (±2 seconds acceptable)
- Distribute time logically (key moments get more time)
- Account for pacing (action scenes faster, emotional scenes slower)

Always output valid JSON matching the schema.`;

// ============================================================================
// Script Writer Functions
// ============================================================================

/**
 * Generate a script from story concept
 *
 * @param input - Script writer input (concept, themes, language, duration, etc.)
 * @returns Script output (script text, scenes, word count)
 */
export async function generateScript(
  input: ScriptWriterInput,
): Promise<ScriptWriterOutput> {
  // Validate input
  const validatedInput = ScriptWriterInputSchema.parse(input);

  // Build prompt
  const prompt = buildScriptPrompt(validatedInput);

  console.log(
    `📝 Generating ${validatedInput.duration}s script in ${validatedInput.language}...`,
  );

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
  const output = ScriptWriterOutputSchema.parse(parsed);

  console.log(`✅ Script generation complete:`, {
    wordCount: output.wordCount,
    scenes: output.scenes.length,
    duration: output.estimatedDuration,
  });

  return output;
}

/**
 * Build script generation prompt from input
 */
function buildScriptPrompt(
  input: z.infer<typeof ScriptWriterInputSchema>,
): string {
  const { concept, themes, characters, mood, language, duration, style } =
    input;

  let prompt = `Write a ${duration}-second video script in ${getLanguageName(language)}.\n\n`;

  prompt += `STORY CONCEPT:\n${concept}\n\n`;

  prompt += `THEMES: ${themes.join(", ")}\n`;
  if (characters.length > 0) {
    prompt += `CHARACTERS: ${characters.join(", ")}\n`;
  }
  prompt += `MOOD: ${mood}\n\n`;

  if (style) {
    prompt += `STYLE PREFERENCES: ${style}\n\n`;
  }

  prompt += `TARGET WORD COUNT: ${getTargetWordCount(duration)} words\n`;
  prompt += `TARGET SCENES: ${getTargetSceneCount(duration)} scenes\n\n`;

  prompt +=
    `Write the complete script with scene-by-scene breakdown. Remember:\n`;
  prompt += `- Write ALL narration in ${getLanguageName(language)}\n`;
  prompt += `- Visual descriptions in English\n`;
  prompt += `- Each scene needs: order, narration, startTime, endTime, visualDescription\n`;
  prompt += `- Scenes must cover the full ${duration} seconds without gaps\n`;
  prompt += `- Create a compelling narrative arc from beginning to end\n\n`;

  prompt += `Output as JSON matching the schema.`;

  return prompt;
}

/**
 * Get language full name
 */
function getLanguageName(lang: Language): string {
  const names: Record<Language, string> = {
    zh: "Chinese (Mandarin)",
    en: "English",
    fr: "French",
  };
  return names[lang];
}

/**
 * Get target word count based on duration
 */
function getTargetWordCount(duration: VideoDuration): string {
  const targets: Record<VideoDuration, string> = {
    30: "70-80",
    60: "140-160",
    90: "210-240",
  };
  return targets[duration];
}

/**
 * Get target scene count based on duration
 */
function getTargetSceneCount(duration: VideoDuration): string {
  const counts: Record<VideoDuration, string> = {
    30: "2-3",
    60: "3-5",
    90: "5-7",
  };
  return counts[duration];
}

// ============================================================================
// Cost Estimation
// ============================================================================

/**
 * Estimate cost for script generation
 *
 * @param duration - Video duration
 * @returns Estimated cost in USD
 */
export function estimateScriptCost(duration: VideoDuration): number {
  // Rough estimate based on duration
  // 30s: ~1000 tokens, 60s: ~1500 tokens, 90s: ~2000 tokens
  const tokenEstimates: Record<VideoDuration, number> = {
    30: 1000,
    60: 1500,
    90: 2000,
  };

  const estimatedTokens = tokenEstimates[duration];

  // GPT-4o-mini pricing (per 1M tokens)
  const inputCost = 0.15 / 1_000_000;
  const outputCost = 0.60 / 1_000_000;

  // Assume 40/60 split (more output for scripts)
  const totalCost = (estimatedTokens * 0.4 * inputCost) +
    (estimatedTokens * 0.6 * outputCost);

  return totalCost;
}

// ============================================================================
// Export
// ============================================================================

export default {
  generateScript,
  estimateScriptCost,
  ScriptWriterInputSchema,
  ScriptWriterOutputSchema,
  SceneScriptSchema,
};
