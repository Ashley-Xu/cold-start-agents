// Asset Generator Agent - Generates visual assets with DALL-E 3 or Gemini Nano Banana
// NOTE: Uses direct OpenAI SDK integration (not Mastra framework)

import { z } from "zod";
import { openai } from "../index.ts";
import { generateAnimatedVideo } from "../tools/hailuoClient.ts";
import { generateImage as generateGeminiImage } from "../tools/geminiClient.ts";
import type {
  AssetGeneratorInput,
  AssetGeneratorOutput,
} from "../../lib/types.ts";

// ============================================================================
// Zod Schemas for Input/Output Validation
// ============================================================================

/**
 * Image provider options
 */
export type ImageProvider = "dall-e-3" | "gemini-nanobanana" | "gemini-nanobanana-pro";

/**
 * Scene schema for asset generation input
 */
export const AssetSceneSchema = z.object({
  order: z.number().int().min(1).describe("Scene order"),
  description: z.string().min(1).describe("Scene description"),
  imagePrompt: z.string().min(1).describe("Image generation prompt"),
});

/**
 * Input schema for Asset Generator
 */
export const AssetGeneratorInputSchema = z.object({
  scenes: z.array(AssetSceneSchema).min(1).max(10).describe("Storyboard scenes"),
  isPremium: z.boolean().describe("Use Sora for premium quality (true) or image generation (false)"),
  imageProvider: z.enum(["dall-e-3", "gemini-nanobanana", "gemini-nanobanana-pro"]).default("gemini-nanobanana").describe("Image generation provider: DALL-E 3 or Gemini Nano Banana"),
});

/**
 * Asset schema for output
 */
export const GeneratedAssetSchema = z.object({
  sceneId: z.string().describe("Scene identifier (generated)"),
  type: z.enum(["image", "video_clip"]).describe("Asset type"),
  url: z.string().url().describe("Asset URL from OpenAI or Hailuo"),
  cost: z.number().min(0).describe("Generation cost in USD"),
  reused: z.boolean().describe("Whether asset was reused from library"),
  animationProvider: z.enum(["hailuo", "static"]).optional().describe("Animation provider used"),
  generationTime: z.number().optional().describe("Time taken to generate in seconds"),
});

/**
 * Output schema for Asset Generator
 */
export const AssetGeneratorOutputSchema = z.object({
  assets: z.array(GeneratedAssetSchema).min(1).max(10).describe("Generated assets"),
});

// ============================================================================
// Asset Generation Functions
// ============================================================================

/**
 * Generate visual assets from storyboard scenes
 *
 * For MVP: Uses DALL-E 3 for all assets (Sora not publicly available yet)
 * Future: Will support Sora for premium videos when API is available
 *
 * @param input - Asset generator input (scenes, premium flag)
 * @returns Asset output (URLs, costs, reuse flags)
 */
export async function generateAssets(
  input: AssetGeneratorInput,
): Promise<AssetGeneratorOutput> {
  // Validate input
  const validatedInput = AssetGeneratorInputSchema.parse(input);

  const imageProvider = validatedInput.imageProvider || "gemini-nanobanana";
  console.log(
    `🎨 Generating assets for ${validatedInput.scenes.length} scenes (Image: ${imageProvider}, Animation: Hailuo)...`,
  );

  // Check if Hailuo API is available
  const hailuoAvailable = !!Deno.env.get("MINIMAX_API_KEY_PAY_AS_YOU_GO");

  if (!hailuoAvailable) {
    console.log(
      "ℹ️  MiniMax API key not found. All videos will use static FFmpeg effects.",
    );
    console.log(
      "ℹ️  To enable Hailuo animation: Add MINIMAX_API_KEY_PAY_AS_YOU_GO to .env file",
    );
  }

  // Generate assets in parallel (max 10 concurrent to respect rate limits)
  const assetPromises = validatedInput.scenes.map(async (scene, idx) => {
    try {
      console.log(`  Generating asset ${idx + 1}/${validatedInput.scenes.length}...`);

      // Step 1: Generate image using selected provider
      const imageAsset = await generateImageAsset(scene, imageProvider);

      // Step 2: Try to animate with Hailuo (with fallback to static)
      if (hailuoAvailable) {
        try {
          console.log(`  🎬 Animating scene ${idx + 1} with Hailuo...`);
          const animatedAsset = await animateImageWithHailuo(imageAsset, scene);
          console.log(`  ✓ Asset ${idx + 1} animated (${animatedAsset.url.substring(0, 50)}...)`);
          return animatedAsset;
        } catch (error) {
          console.warn(`  ⚠️  Animation failed for scene ${idx + 1}, using static image:`, error);
          // Fallback to static image with Ken Burns effect
          return {
            ...imageAsset,
            animationProvider: "static" as const,
          };
        }
      } else {
        // No Hailuo API key, use static image
        console.log(`  ✓ Asset ${idx + 1} generated (static) (${imageAsset.url.substring(0, 50)}...)`);
        return {
          ...imageAsset,
          animationProvider: "static" as const,
        };
      }
    } catch (error) {
      console.error(`  ✗ Failed to generate asset ${idx + 1}:`, error);
      throw error;
    }
  });

  // Wait for all assets to complete
  const results = await Promise.allSettled(assetPromises);

  // Separate successful and failed results
  const assets = results
    .filter((r): r is PromiseFulfilledResult<z.infer<typeof GeneratedAssetSchema>> => r.status === "fulfilled")
    .map((r) => r.value);

  const failures = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason);

  // Allow partial success - proceed if at least 1 asset was generated
  if (failures.length > 0) {
    console.warn(`⚠️  ${failures.length} asset(s) failed to generate`);

    // Log failure details for debugging
    failures.forEach((failure, idx) => {
      const errorMessage = failure?.message || "Unknown error";
      console.warn(`  Failed asset ${idx + 1}: ${errorMessage}`);
    });

    // Only fail if ALL assets failed
    if (assets.length === 0) {
      const errorMessage = failures[0]?.message || "Unknown error";

      // Check if it's a content policy violation
      if (errorMessage.includes("content filters") || errorMessage.includes("content_policy_violation")) {
        throw new Error(
          "All image prompts were blocked by OpenAI's content filters. Please try again with a different topic or style. OpenAI blocks content that may be inappropriate, violent, or otherwise violates their usage policies."
        );
      }

      throw new Error(
        `Failed to generate all ${failures.length} assets: ${errorMessage}`,
      );
    }

    console.log(`✅ Partial success: Generated ${assets.length} out of ${validatedInput.scenes.length} assets`);
  }

  const totalCost = assets.reduce((sum, a) => sum + a.cost, 0);

  console.log(`✅ Asset generation complete:`, {
    totalAssets: assets.length,
    totalCost: `$${totalCost.toFixed(4)}`,
    reusedAssets: assets.filter((a) => a.reused).length,
  });

  return {
    assets,
  };
}

/**
 * Generate an image asset using DALL-E 3 or Gemini Nano Banana
 *
 * @param scene - Scene with image prompt
 * @param provider - Image generation provider (dall-e-3, gemini-nanobanana, or gemini-nanobanana-pro)
 * @returns Generated asset with URL and cost
 */
async function generateImageAsset(
  scene: z.infer<typeof AssetSceneSchema>,
  provider: ImageProvider = "gemini-nanobanana",
): Promise<z.infer<typeof GeneratedAssetSchema>> {
  // Generate sceneId (will be replaced by actual scene ID from database later)
  const sceneId = `scene-${scene.order}`;

  // Route to appropriate provider
  if (provider === "dall-e-3") {
    return await generateDalleImage(scene, sceneId);
  } else if (provider === "gemini-nanobanana" || provider === "gemini-nanobanana-pro") {
    return await generateGeminiImageAsset(scene, sceneId, provider);
  } else {
    throw new Error(`Unsupported image provider: ${provider}`);
  }
}

/**
 * Generate an image asset using DALL-E 3
 *
 * @param scene - Scene with image prompt
 * @param sceneId - Scene identifier
 * @returns Generated asset with URL and cost
 */
async function generateDalleImage(
  scene: z.infer<typeof AssetSceneSchema>,
  sceneId: string,
): Promise<z.infer<typeof GeneratedAssetSchema>> {
  try {
    // Enhance prompt to ensure correct vertical orientation
    const orientedPrompt = `${scene.imagePrompt}. IMPORTANT: Create a VERTICAL PORTRAIT composition (9:16 aspect ratio) where subjects are upright and properly oriented for vertical viewing. The scene should be naturally composed for vertical/portrait orientation.`;

    // Call DALL-E 3 API
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: orientedPrompt,
      n: 1,
      size: "1024x1792", // Vertical format for TikTok/Reels (9:16 aspect ratio)
      quality: "standard", // or "hd" for premium
    });

    const imageUrl = response.data?.[0]?.url;

    if (!imageUrl) {
      throw new Error("DALL-E 3 did not return an image URL");
    }

    // DALL-E 3 pricing: $0.040 per image (1024x1792, standard quality)
    // HD quality: $0.080 per image
    const cost = 0.040;

    return {
      sceneId,
      type: "image",
      url: imageUrl,
      cost,
      reused: false,
    };
  } catch (error) {
    console.error(`Error generating DALL-E image for scene ${scene.order}:`, error);
    throw error;
  }
}

/**
 * Generate an image asset using Gemini Nano Banana
 *
 * @param scene - Scene with image prompt
 * @param sceneId - Scene identifier
 * @param provider - Gemini model variant (nanobanana or nanobanana-pro)
 * @returns Generated asset with URL and cost
 */
async function generateGeminiImageAsset(
  scene: z.infer<typeof AssetSceneSchema>,
  sceneId: string,
  provider: "gemini-nanobanana" | "gemini-nanobanana-pro",
): Promise<z.infer<typeof GeneratedAssetSchema>> {
  try {
    // Enhance prompt to ensure correct vertical orientation
    const orientedPrompt = `${scene.imagePrompt}. IMPORTANT: Create a VERTICAL PORTRAIT composition (9:16 aspect ratio) where subjects are upright and properly oriented for vertical viewing. The scene should be naturally composed for vertical/portrait orientation.`;

    // Map provider to Gemini model name
    const geminiModel = provider === "gemini-nanobanana-pro"
      ? "gemini-3-pro-image-preview"
      : "gemini-2.5-flash-image";

    // Determine resolution based on provider
    const resolution = provider === "gemini-nanobanana-pro" ? "2K" : "1K";

    console.log(`    🎨 Generating image with Gemini ${geminiModel}...`);

    // Call Gemini API
    const result = await generateGeminiImage({
      prompt: orientedPrompt,
      model: geminiModel,
      aspectRatio: "9:16", // Vertical format for TikTok/Reels
      resolution: resolution as "1K" | "2K" | "4K",
      responseModalities: ["IMAGE"],
    });

    return {
      sceneId,
      type: "image",
      url: result.imageUrl,
      cost: result.cost,
      reused: false,
    };
  } catch (error) {
    console.error(`Error generating Gemini image for scene ${scene.order}:`, error);
    
    // Provide helpful error message
    if (error instanceof Error) {
      if (error.message.includes("GOOGLE_GEMINI_API_KEY")) {
        throw new Error(
          "Gemini API key not found. Please set GOOGLE_GEMINI_API_KEY environment variable. Get one at https://aistudio.google.com/app/apikey"
        );
      }
    }
    
    throw error;
  }
}

/**
 * Generate a video asset using Sora 2
 *
 * Sora 2 API Pricing (as of Dec 2025):
 * - Standard: $0.10/second (720p)
 * - Pro: $0.30-$0.50/second (720p-1792p)
 *
 * @param scene - Scene with video prompt
 * @returns Generated asset with URL and cost
 */
async function _generateVideoAsset(
  scene: z.infer<typeof AssetSceneSchema>,
): Promise<z.infer<typeof GeneratedAssetSchema>> {
  const sceneId = `scene-${scene.order}`;

  try {
    // Determine duration based on scene (default 5-10 seconds per scene)
    const duration = 10; // 10 seconds per scene for short-form content

    console.log(`    🎥 Calling Sora 2 API for scene ${scene.order} (${duration}s)...`);

    // Call Sora 2 API
    // Note: API endpoint structure based on OpenAI SDK patterns
    // Actual implementation may need adjustment when Sora 2 API is fully documented
    const response = await openai.chat.completions.create({
      model: "sora-2", // or "sora-2-pro" for higher quality
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Generate a ${duration}-second video: ${scene.imagePrompt}`,
            },
          ],
        },
      ],
      // Additional parameters may be needed based on actual API
      // max_tokens, temperature, etc.
    }) as unknown as { data?: Array<{ url?: string }>; choices?: Array<{ message?: { content?: string } }> };

    // Extract video URL from response
    // Note: Response structure may differ from this placeholder
    const videoUrl = response.data?.[0]?.url || response.choices?.[0]?.message?.content;

    if (!videoUrl) {
      throw new Error("Sora 2 did not return a video URL");
    }

    // Sora 2 Standard pricing: $0.10/second
    // For higher quality (Sora 2 Pro): $0.30-$0.50/second
    // Using Standard pricing for now
    const pricePerSecond = 0.10;
    const cost = duration * pricePerSecond;

    console.log(`    ✓ Sora 2 video generated: ${duration}s, cost=$${cost.toFixed(2)}`);

    return {
      sceneId,
      type: "video_clip",
      url: videoUrl,
      cost,
      reused: false,
    };
  } catch (error) {
    console.error(`Error generating Sora video for scene ${scene.order}:`, error);

    // Provide helpful error message
    if (error instanceof Error) {
      if (error.message.includes("model") || error.message.includes("not found")) {
        throw new Error(
          "Sora 2 API access not available. Please ensure you have API access from OpenAI. Falling back to DALL-E 3.",
        );
      }
    }

    throw error;
  }
}

// ============================================================================
// Hailuo Animation Integration
// ============================================================================

/**
 * Animate an image using MiniMax Hailuo-02 API
 * Works with images from any provider (DALL-E 3, Gemini, etc.)
 *
 * @param imageAsset - Generated image asset (from any provider)
 * @param scene - Scene with description for animation prompt
 * @returns Animated video asset with Hailuo provider
 */
async function animateImageWithHailuo(
  imageAsset: z.infer<typeof GeneratedAssetSchema>,
  scene: z.infer<typeof AssetSceneSchema>,
): Promise<z.infer<typeof GeneratedAssetSchema>> {
  // Create animation prompt with EXPLICIT vertical/portrait orientation instructions
  const animationPrompt = `${scene.description}. CRITICAL: Maintain VERTICAL PORTRAIT orientation (9:16 aspect ratio) for mobile/TikTok format. Keep all subjects UPRIGHT and properly oriented for vertical viewing. Animate with realistic movement, natural motion, and cinematic camera work while preserving the vertical composition.`;

  console.log(`    🎬 Hailuo animation starting for scene ${scene.order}...`);

  // Generate animated video (combines generation + polling)
  const { videoUrl, generationTime } = await generateAnimatedVideo({
    imageUrl: imageAsset.url,
    prompt: animationPrompt,
    resolution: "768p", // Cost-effective: $0.045/second (512p not supported)
    duration: 6, // 6 seconds per scene
  });

  // Calculate cost: 768p = $0.045/second × 6 seconds = $0.270
  const hailuoCost = 0.045 * 6;
  const totalCost = imageAsset.cost + hailuoCost; // Image generation + Hailuo animation

  console.log(`    ✓ Animation complete in ${generationTime.toFixed(1)}s (cost: $${hailuoCost.toFixed(3)})`);

  return {
    sceneId: imageAsset.sceneId,
    type: "video_clip",
    url: videoUrl,
    cost: totalCost,
    reused: false,
    animationProvider: "hailuo",
    generationTime,
  };
}

// ============================================================================
// Asset Similarity Search (for reuse optimization)
// ============================================================================

/**
 * Search for similar assets in the database using vector embeddings
 *
 * NOTE: This requires Neo4j vector index to be set up and embeddings to be generated
 * For MVP: Skipping similarity search, always generating new assets
 * Future: Implement this to save costs by reusing similar assets
 *
 * @param _prompt - Image prompt to search for
 * @param _threshold - Similarity threshold (0.85 = 85% similar)
 * @returns Similar asset if found, null otherwise
 */
function _findSimilarAsset(
  _prompt: string,
  _threshold = 0.85,
): Promise<{ id: string; url: string; cost: number } | null> {
  // Placeholder for future implementation
  // This would:
  // 1. Generate embedding for the prompt using OpenAI embeddings API
  // 2. Query Neo4j vector index for similar assets
  // 3. Return most similar asset if similarity > threshold
  // 4. Otherwise return null

  return Promise.resolve(null); // For MVP, always generate new assets
}

// ============================================================================
// Cost Estimation
// ============================================================================

/**
 * Estimate cost for asset generation with Hailuo animation
 *
 * @param sceneCount - Number of scenes
 * @param withAnimation - Include Hailuo animation cost (default: true)
 * @param imageProvider - Image generation provider (default: dall-e-3)
 * @returns Estimated cost in USD
 */
export function estimateAssetCost(
  sceneCount: number,
  withAnimation: boolean = true,
  imageProvider: ImageProvider = "gemini-nanobanana"
): number {
  // Calculate image generation cost based on provider
  let imageCost: number;
  switch (imageProvider) {
    case "dall-e-3":
      // DALL-E 3: $0.040 per image (1024x1792, standard quality)
      imageCost = sceneCount * 0.040;
      break;
    case "gemini-nanobanana":
      // Gemini Nano Banana: ~$0.01 per image (1K resolution)
      imageCost = sceneCount * 0.01;
      break;
    case "gemini-nanobanana-pro":
      // Gemini Nano Banana Pro: ~$0.075 per image (2K resolution)
      imageCost = sceneCount * 0.075;
      break;
    default:
      imageCost = sceneCount * 0.01; // Default to Gemini Nano Banana pricing
  }

  if (withAnimation) {
    // Hailuo 768p: $0.045/second × 6 seconds = $0.270 per scene
    const hailuoCost = sceneCount * (0.045 * 6);
    return imageCost + hailuoCost;
  } else {
    // Static images only
    return imageCost;
  }
}

// ============================================================================
// Export
// ============================================================================

export default {
  generateAssets,
  estimateAssetCost,
  AssetGeneratorInputSchema,
  AssetGeneratorOutputSchema,
  AssetSceneSchema,
  GeneratedAssetSchema,
};
