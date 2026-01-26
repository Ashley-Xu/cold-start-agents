// Asset Generator Agent - Orchestrates image generation and animation
// This module coordinates the imageGenerator and animationGenerator modules

import { z } from "zod";
import type {
  AssetGeneratorInput,
  AssetGeneratorOutput,
} from "../../lib/types.ts";
import { generateImagesOnly, generateImageAsset, generateImageAssetWithReferences } from "./imageGenerator.ts";
import { animateImages, animateImageWithHailuo } from "./animationGenerator.ts";

// Re-export types for convenience
export type { AssetGeneratorInput, AssetGeneratorOutput } from "../../lib/types.ts";

// ============================================================================
// Zod Schemas for Input/Output Validation
// ============================================================================

/**
 * Image provider options
 */
export type ImageProvider = "gemini-2.5-flash-image" | "gemini-3-pro";

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
  imageProvider: z.enum(["gemini-2.5-flash-image", "gemini-3-pro"]).default("gemini-3-pro").describe("Image generation provider: Gemini"),
  useRecursiveGeneration: z.boolean().default(true).describe("Use previous images as reference for consistency (auto-enabled for Pro model)"),
  referenceStrategy: z.enum(["lastN", "all", "keyframe"]).default("lastN").describe("Strategy for selecting reference images"),
  maxReferenceImages: z.number().int().min(1).max(14).default(2).describe("Maximum number of reference images to use"),
});

/**
 * Asset schema for output
 */
export const GeneratedAssetSchema = z.object({
  sceneId: z.string().describe("Scene identifier (generated)"),
  sceneOrder: z.number().int().min(1).describe("Scene order number (1-based)"),
  type: z.enum(["image", "video_clip"]).describe("Asset type"),
  url: z.string().url().describe("Asset URL from Gemini or Hailuo"),
  cost: z.number().min(0).describe("Total generation cost in USD"),
  imageCost: z.number().min(0).optional().describe("Image generation cost in USD"),
  animationCost: z.number().min(0).optional().describe("Animation generation cost in USD"),
  reused: z.boolean().describe("Whether asset was reused from library"),
  animationProvider: z.enum(["hailuo", "static"]).optional().describe("Animation provider used"),
  generationTime: z.number().optional().describe("Time taken to generate in seconds"),
  imageProvider: z.enum(["gemini-2.5-flash-image", "gemini-3-pro"]).optional().describe("Image generation provider used (for frontend display)"),
  referenceImageCount: z.number().int().min(0).optional().describe("Number of reference images used for this generation"),
});

/**
 * Output schema for Asset Generator
 */
export const AssetGeneratorOutputSchema = z.object({
  assets: z.array(GeneratedAssetSchema).min(1).max(10).describe("Generated assets"),
});

// ============================================================================
// Re-export functions from specialized modules
// ============================================================================

export { generateImagesOnly } from "./imageGenerator.ts";
export { animateImages } from "./animationGenerator.ts";

/**
 * Generate visual assets from storyboard scenes (images + animation)
 *
 * Uses Gemini Nano Banana for image generation
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

  // Default strategy: First image uses gemini-2.5-flash-image, subsequent images use gemini-3-pro with references
  const defaultProvider = validatedInput.imageProvider || "gemini-3-pro";
  
  // Auto-enable recursive generation for Pro model (unless explicitly disabled)
  const useRecursive = validatedInput.useRecursiveGeneration !== false && 
    (defaultProvider === "gemini-3-pro" || validatedInput.useRecursiveGeneration === true);
  
  // Warn if recursive generation requested but not supported
  if (validatedInput.useRecursiveGeneration && defaultProvider === "gemini-2.5-flash-image") {
    console.warn("⚠️  Recursive generation requires gemini-3-pro. Falling back to standard generation.");
  }

  console.log(
    `🎨 Generating assets for ${validatedInput.scenes.length} scenes (Default: ${defaultProvider}, Animation: Hailuo, Recursive: ${useRecursive ? "Yes" : "No"})...`,
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

  // Phase 1: Generate all images sequentially (with reference tracking for recursive generation)
  console.log(`📸 Phase 1: Generating ${validatedInput.scenes.length} images...`);
  const imageAssets: z.infer<typeof GeneratedAssetSchema>[] = [];
  const previousImageUrls: string[] = [];
  const imageFailures: Error[] = [];

  for (let idx = 0; idx < validatedInput.scenes.length; idx++) {
    const scene = validatedInput.scenes[idx];
    try {
      console.log(`  Generating image ${idx + 1}/${validatedInput.scenes.length}...`);

      let currentProvider: ImageProvider;
      if (idx === 0 && defaultProvider === "gemini-3-pro") {
        currentProvider = "gemini-2.5-flash-image";
        console.log(`    📸 Using gemini-2.5-flash-image for first image (no references)`);
      } else if (idx > 0 && useRecursive && defaultProvider === "gemini-3-pro") {
        currentProvider = "gemini-3-pro";
      } else {
        currentProvider = defaultProvider;
      }

      let imageAsset: z.infer<typeof GeneratedAssetSchema>;
      
      if (useRecursive && idx > 0 && currentProvider === "gemini-3-pro") {
        const referenceUrls = previousImageUrls.length > 0 
          ? [previousImageUrls[previousImageUrls.length - 1]]
          : [];
        imageAsset = await generateImageAssetWithReferences(
          scene,
          currentProvider,
          referenceUrls,
          false,
        );
        console.log(`    📸 Using ${referenceUrls.length} reference image(s) for continuity`);
      } else {
        imageAsset = await generateImageAsset(scene, currentProvider);
      }

      imageAsset.imageProvider = currentProvider;
      imageAssets.push(imageAsset);

      if (useRecursive && imageAsset.url) {
        previousImageUrls.push(imageAsset.url);
        if (previousImageUrls.length > 1) {
          previousImageUrls.shift();
        }
      }

      console.log(`  ✓ Image ${idx + 1} generated (${imageAsset.url.substring(0, 50)}...)`);
    } catch (error) {
      console.error(`  ✗ Failed to generate image ${idx + 1}:`, error);
      imageFailures.push(error instanceof Error ? error : new Error(String(error)));
      
      if (idx === 0) {
        throw error;
      }
    }
  }

  // Phase 2: Animate all images (if Hailuo is available)
  console.log(`🎬 Phase 2: Animating ${imageAssets.length} images...`);
  const assets: z.infer<typeof GeneratedAssetSchema>[] = [];
  const animationFailures: Error[] = [];

  if (hailuoAvailable && imageAssets.length > 0) {
    // Animate all images (can be done in parallel or sequentially)
    for (let idx = 0; idx < imageAssets.length; idx++) {
      const imageAsset = imageAssets[idx];
      const scene = validatedInput.scenes[idx];
      
      try {
        console.log(`  🎬 Animating scene ${idx + 1} with Hailuo...`);
        const animatedAsset = await animateImageWithHailuo(imageAsset, scene);
        animatedAsset.imageProvider = imageAsset.imageProvider; // Preserve provider info from image generation
        console.log(`  ✓ Asset ${idx + 1} animated (${animatedAsset.url.substring(0, 50)}...)`);
        assets.push(animatedAsset);
      } catch (error) {
        console.warn(`  ⚠️  Animation failed for scene ${idx + 1}, using static image:`, error);
        animationFailures.push(error instanceof Error ? error : new Error(String(error)));
        // Fallback to static image with Ken Burns effect
        assets.push({
          ...imageAsset,
          animationProvider: "static" as const,
        });
      }
    }
  } else {
    // No Hailuo API key or no images generated, use static images
    if (imageAssets.length > 0) {
      console.log(`  ℹ️  Using static images (Hailuo not available)`);
      for (const imageAsset of imageAssets) {
        assets.push({
          ...imageAsset,
          animationProvider: "static" as const,
        });
      }
    }
  }

  // Combine failures from both phases
  const failures = [...imageFailures, ...animationFailures];

  // Allow partial success - proceed if at least 1 asset was generated
  if (failures.length > 0) {
    console.warn(`⚠️  ${failures.length} asset(s) failed to generate`);

    // Log failure details for debugging
    failures.forEach((failure) => {
      const errorMessage = failure?.message || "Unknown error";
      console.warn(`  Failed asset: ${errorMessage}`);
    });

    // Only fail if ALL assets failed
    if (assets.length === 0) {
      const errorMessage = failures[0]?.message || "Unknown error";

      if (errorMessage.includes("content filters") || errorMessage.includes("content_policy_violation")) {
        throw new Error(
          "All image prompts were blocked by content filters. Please try again with a different topic or style."
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
    defaultProvider: defaultProvider,
  });

  return {
    assets,
  };
}

// ============================================================================
// Cost Estimation
// ============================================================================

/**
 * Estimate cost for image generation only
 *
 * @param sceneCount - Number of scenes
 * @param imageProvider - Image generation provider (default: gemini-3-pro)
 * @returns Estimated image generation cost in USD
 */
export function estimateImageCost(
  sceneCount: number,
  imageProvider: ImageProvider = "gemini-3-pro",
): number {
  switch (imageProvider) {
    case "gemini-2.5-flash-image": {
      // Gemini 2.5 Flash Image: ~$0.01 per image (1K resolution)
      return sceneCount * 0.01;
    }
    case "gemini-3-pro": {
      // Gemini 3 Pro: ~$0.05 per image (1K resolution)
      // Note: Reference images don't add extra cost - they're part of the request
      return sceneCount * 0.05;
    }
    default: {
      return sceneCount * 0.05;
    }
  }
}

/**
 * Estimate cost for animation only
 *
 * @param sceneCount - Number of scenes
 * @param secondsPerScene - Animation duration in seconds per scene
 * @returns Estimated animation cost in USD
 */
export function estimateAnimationCost(
  sceneCount: number,
  secondsPerScene = 6,
): number {
  // Hailuo 768p: $0.045/second
  const pricePerSecond = 0.045;
  return sceneCount * secondsPerScene * pricePerSecond;
}

// ============================================================================
// Export
// ============================================================================

export default {
  generateAssets,
  generateImagesOnly,
  animateImages,
  estimateImageCost,
  estimateAnimationCost,
  AssetGeneratorInputSchema,
  AssetGeneratorOutputSchema,
  AssetSceneSchema,
  GeneratedAssetSchema,
};
