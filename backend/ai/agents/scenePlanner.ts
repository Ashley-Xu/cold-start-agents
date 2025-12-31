// Scene Planner Agent - Creates visual storyboards with DALL-E prompts
// NOTE: Uses direct OpenAI SDK integration (not Mastra framework)

import { z } from "zod";
import { openai, MODEL_CONFIG } from "../index.ts";
import type {
  Language,
  ScenePlannerInput,
  ScenePlannerOutput,
  VideoDuration,
} from "../../lib/types.ts";

// ============================================================================
// Zod Schemas for Input/Output Validation
// ============================================================================

/**
 * Input schema for Scene Planner
 */
export const ScenePlannerInputSchema = z.object({
  script: z.string().min(1).describe("Complete script text"),
  scenes: z.array(z.object({
    order: z.number().int().min(1),
    narration: z.string().min(1),
    startTime: z.number().min(0),
    endTime: z.number().min(0),
    visualDescription: z.string(),
  })).min(1).max(10).describe("Script scenes"),
  language: z.enum(["zh", "en", "fr"]).describe("Target language"),
  duration: z.union([z.literal(30), z.literal(60), z.literal(90)]).describe(
    "Video duration in seconds",
  ),
  style: z.string().optional().describe("Optional visual style preferences"),
});

/**
 * Storyboard scene schema
 */
export const StoryboardSceneSchema = z.object({
  order: z.number().int().min(1).describe("Scene order (1-based)"),
  title: z.string().min(1).describe("Scene title"),
  description: z.string().min(1).describe("Detailed scene description"),
  imagePrompt: z.string().min(1).describe(
    "DALL-E 3 prompt for image generation",
  ),
  cameraAngle: z.string().describe(
    "Camera angle (e.g., 'close-up', 'wide shot', 'over-the-shoulder')",
  ),
  composition: z.string().describe(
    "Visual composition notes (e.g., 'centered', 'rule of thirds', 'symmetrical')",
  ),
  lighting: z.string().describe(
    "Lighting setup (e.g., 'soft natural light', 'dramatic shadows', 'golden hour')",
  ),
  transition: z.string().describe(
    "Transition to next scene (e.g., 'fade', 'dissolve', 'cut')",
  ),
  duration: z.number().min(0).describe("Scene duration in seconds"),
});

/**
 * Output schema for Scene Planner
 */
export const ScenePlannerOutputSchema = z.object({
  storyboard: z.object({
    title: z.string().describe("Storyboard title"),
    description: z.string().describe("Overall storyboard description"),
    visualStyle: z.string().describe(
      "Consistent visual style across all scenes",
    ),
    colorPalette: z.string().describe(
      "Color palette (e.g., 'warm earth tones', 'vibrant pastels')",
    ),
  }),
  scenes: z.array(StoryboardSceneSchema).min(1).max(10).describe(
    "Storyboard scenes",
  ),
});

// ============================================================================
// Scene Planner System Instructions
// ============================================================================

const SYSTEM_INSTRUCTIONS = `You are a professional storyboard artist and cinematographer for short-form video content.

Your role is to create detailed visual storyboards optimized for AI image generation (DALL-E 3) and video production.

CRITICAL REQUIREMENTS:
1. Create DALL-E 3 prompts that are specific, visual, and production-ready
2. Maintain consistent visual style across all scenes
3. Consider camera work and composition for professional look
4. Design for vertical format (1080x1920 - TikTok/Reels/Shorts)
5. Each scene must be visually distinct but cohesive

DALL-E 3 PROMPT GUIDELINES:
- Be specific and descriptive (200-300 characters ideal)
- Include: subject, action, setting, mood, lighting, style
- Use cinematic language: "close-up on...", "portrait of...", "character looking up at..."
- Specify art style: "digital illustration", "3D render", "painterly style", "photorealistic"
- Avoid text or words in images (DALL-E struggles with text)

CRITICAL - VERTICAL COMPOSITION REQUIRED:
- ALWAYS compose for VERTICAL/PORTRAIT format (9:16 aspect ratio, 1024x1792)
- Use VERTICAL framing: "tall view", "portrait orientation", "vertical composition", "portrait shot"
- FORBIDDEN WORDS: NO "wide shot", NO "wide angle", NO "panoramic", NO "landscape", NO "horizontal", NO "widescreen"
- FORBIDDEN COMPOSITIONS: NO letterboxing, NO black bars on top/bottom, NO horizontal subjects
- Frame subjects VERTICALLY from TOP TO BOTTOM: full-body portraits, tall buildings, trees reaching skyward
- Characters must be STANDING or VERTICAL, NOT lying down or horizontal
- Examples of CORRECT framing:
  * "Portrait of character standing upright, facing camera, vertical composition"
  * "Tall temple tower reaching from ground to sky, vertical portrait view"
  * "Character from feet to head in vertical frame, portrait orientation"
  * "Forest path extending upward vertically, trees towering above"
- Examples of WRONG framing (NEVER USE):
  * "Wide shot of landscape" ❌
  * "Character lying down" ❌
  * "Panoramic view" ❌
  * "Horizontal composition" ❌
- MANDATORY: EVERY imagePrompt MUST end with ", vertical portrait orientation, 9:16 aspect ratio, portrait framing"

CONTENT POLICY COMPLIANCE - CRITICAL:
- NEVER include violent, graphic, or disturbing imagery
- NEVER include weapons, blood, injuries, or physical harm
- NEVER include adult content, suggestive poses, or provocative themes
- NEVER include hateful symbols, offensive gestures, or discriminatory content
- NEVER include real public figures, politicians, or celebrities by name
- KEEP IT FAMILY-FRIENDLY: Focus on positive, wholesome storytelling
- IF THE TOPIC IS SENSITIVE: Use metaphorical or symbolic imagery instead
- EXAMPLES OF SAFE CONTENT: Nature, animals, everyday activities, emotions, abstract concepts, fantasy creatures, architecture, food, hobbies

CAMERA ANGLES:
- Wide shot: Shows full scene, establishes setting
- Medium shot: Shows subject from waist up, balanced
- Close-up: Shows face or detail, emotional impact
- Over-the-shoulder: Creates perspective, intimacy
- Aerial/bird's eye: Shows overview, scale
- Low angle: Makes subject powerful, dramatic
- High angle: Makes subject vulnerable, small

COMPOSITION TECHNIQUES:
- Rule of thirds: Place subject at intersection points
- Centered: Symmetrical, balanced, formal
- Leading lines: Guide eye to subject
- Framing: Use foreground elements to frame subject
- Negative space: Emphasize isolation or scale

LIGHTING TYPES:
- Soft natural light: Gentle, flattering, outdoor feel
- Golden hour: Warm, magical, nostalgic
- Dramatic shadows: High contrast, tension, mystery
- Backlit: Silhouette, ethereal, dreamlike
- Bright and even: Clear, energetic, cheerful

TRANSITIONS:
- Cut: Instant change, energetic
- Fade: Gentle transition, passage of time
- Dissolve: Overlap scenes, dreamlike
- Zoom: Focus change, dramatic reveal
- Pan/swipe: Lateral movement, connection

VISUAL CONSISTENCY:
- Maintain same art style across all scenes
- Use consistent color palette
- Keep character designs uniform
- Match lighting mood throughout

OUTPUT FORMAT - EXACT JSON STRUCTURE REQUIRED:
{
  "storyboard": {
    "title": "string - storyboard title",
    "description": "string - overall description",
    "visualStyle": "string - e.g., 'digital illustration', '3D render'",
    "colorPalette": "string - e.g., 'warm earth tones' (NOT an array)"
  },
  "scenes": [
    {
      "order": 1,
      "title": "string - brief scene title",
      "description": "string - what happens visually",
      "imagePrompt": "string - DALL-E 3 prompt (200-300 chars)",
      "cameraAngle": "string - e.g., 'wide shot', 'close-up'",
      "composition": "string - e.g., 'rule of thirds', 'centered'",
      "lighting": "string - e.g., 'soft natural light'",
      "transition": "string - e.g., 'fade', 'cut'",
      "duration": 12
    }
  ]
}

CRITICAL: The JSON must have "storyboard" and "scenes" as TOP-LEVEL keys. colorPalette is a string, NOT array. duration is a number, NOT string.`;

// ============================================================================
// Scene Planner Functions
// ============================================================================

/**
 * Create a visual storyboard from script
 *
 * @param input - Scene planner input (script, scenes, language, duration, etc.)
 * @returns Storyboard output (scenes with DALL-E prompts)
 */
export async function createStoryboard(
  input: ScenePlannerInput,
): Promise<ScenePlannerOutput> {
  // Validate input
  const validatedInput = ScenePlannerInputSchema.parse(input);

  // Build prompt
  const prompt = buildStoryboardPrompt(validatedInput);

  console.log(
    `🎬 Creating storyboard with ${validatedInput.scenes.length} scenes...`,
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
  const output = ScenePlannerOutputSchema.parse(parsed);

  // CRITICAL: Force vertical orientation on ALL image prompts
  // Append orientation instruction if not already present
  const verticalSuffix = ", vertical portrait orientation, 9:16 aspect ratio, portrait framing";
  output.scenes.forEach((scene) => {
    // Remove any horizontal/landscape language first
    scene.imagePrompt = scene.imagePrompt
      .replace(/,?\s*wide shot/gi, "")
      .replace(/,?\s*wide angle/gi, "")
      .replace(/,?\s*panoramic/gi, "")
      .replace(/,?\s*landscape/gi, "")
      .replace(/,?\s*horizontal/gi, "")
      .replace(/,?\s*widescreen/gi, "");

    // Add vertical orientation suffix if not present
    if (!scene.imagePrompt.includes("vertical portrait orientation")) {
      scene.imagePrompt += verticalSuffix;
      console.log(`  ✓ Added vertical orientation to scene ${scene.order}`);
    }
  });

  console.log(`✅ Storyboard creation complete:`, {
    scenes: output.scenes.length,
    visualStyle: output.storyboard.visualStyle,
    colorPalette: output.storyboard.colorPalette,
  });

  return output;
}

/**
 * Build storyboard creation prompt from input
 */
function buildStoryboardPrompt(
  input: z.infer<typeof ScenePlannerInputSchema>,
): string {
  const { script, scenes, language, duration, style } = input;

  let prompt = `Create a visual storyboard for a ${duration}-second video.\n\n`;

  prompt += `SCRIPT:\n${script}\n\n`;

  prompt += `SCENES (${scenes.length} total):\n`;
  scenes.forEach((scene) => {
    prompt +=
      `Scene ${scene.order} (${scene.startTime}s - ${scene.endTime}s):\n`;
    prompt += `  Narration: ${scene.narration}\n`;
    prompt += `  Visual: ${scene.visualDescription}\n\n`;
  });

  prompt += `LANGUAGE: ${getLanguageName(language)}\n`;

  if (style) {
    prompt += `STYLE PREFERENCES: ${style}\n\n`;
  }

  prompt += `\nCREATE A STORYBOARD WITH:\n`;
  prompt += `- Consistent visual style across all ${scenes.length} scenes\n`;
  prompt += `- Detailed DALL-E 3 prompts for each scene (vertical format, 9:16)\n`;
  prompt += `- Professional camera angles and composition\n`;
  prompt += `- Cohesive color palette and lighting\n`;
  prompt += `- Smooth transitions between scenes\n\n`;

  prompt +=
    `Think about the visual narrative flow. Each scene should be:\n`;
  prompt += `1. Visually clear and compelling\n`;
  prompt += `2. Aligned with the narration timing\n`;
  prompt += `3. Part of a cohesive visual story\n`;
  prompt += `4. Optimized for AI image generation\n\n`;

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

// ============================================================================
// Cost Estimation
// ============================================================================

/**
 * Estimate cost for storyboard creation
 *
 * @param sceneCount - Number of scenes
 * @returns Estimated cost in USD
 */
export function estimateStoryboardCost(sceneCount: number): number {
  // Rough estimate based on scene count
  // More scenes = more tokens for detailed planning
  const baseTokens = 1500;
  const tokensPerScene = 300;
  const estimatedTokens = baseTokens + (sceneCount * tokensPerScene);

  // GPT-4o-mini pricing (per 1M tokens)
  const inputCost = 0.15 / 1_000_000;
  const outputCost = 0.60 / 1_000_000;

  // Assume 30/70 split (more output for detailed storyboards)
  const totalCost = (estimatedTokens * 0.3 * inputCost) +
    (estimatedTokens * 0.7 * outputCost);

  return totalCost;
}

// ============================================================================
// Export
// ============================================================================

export default {
  createStoryboard,
  estimateStoryboardCost,
  ScenePlannerInputSchema,
  ScenePlannerOutputSchema,
  StoryboardSceneSchema,
};
