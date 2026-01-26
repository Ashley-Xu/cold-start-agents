// Animation Generator - Animates images using Hailuo

import { z } from "zod";
import { generateAnimatedVideo } from "../tools/hailuoClient.ts";
import type { AssetGeneratorOutput } from "../../lib/types.ts";
import {
  AssetSceneSchema,
  GeneratedAssetSchema,
} from "./assetGenerator.ts";

type GeneratedAssetWithCosts = z.infer<typeof GeneratedAssetSchema> & {
  imageCost?: number;
  animationCost?: number;
};

// ============================================================================
// Animation Functions
// ============================================================================

/**
 * Animate existing image assets with Hailuo
 *
 * @param imageAssets - Array of image assets to animate
 * @param scenes - Array of scenes (for animation prompts)
 * @returns Animated assets (or static if animation fails/unavailable)
 */
export async function animateImages(
  imageAssets: GeneratedAssetWithCosts[],
  scenes: z.infer<typeof AssetSceneSchema>[],
): Promise<AssetGeneratorOutput> {
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

  console.log(`🎬 Animating ${imageAssets.length} images...`);
  const assets: GeneratedAssetWithCosts[] = [];
  const animationFailures: Error[] = [];

  if (hailuoAvailable && imageAssets.length > 0) {
    // Animate all images
    for (let idx = 0; idx < imageAssets.length; idx++) {
      const imageAsset = imageAssets[idx];
      const scene = scenes[idx];
      
      if (!scene) {
        console.warn(`  ⚠️  No scene found for image ${idx + 1}, skipping animation`);
        assets.push({
          ...imageAsset,
          animationProvider: "static" as const,
          imageCost: imageAsset.imageCost ?? imageAsset.cost,
          animationCost: 0,
        });
        continue;
      }
      
      try {
        console.log(`  🎬 Animating scene ${idx + 1} with Hailuo...`);
        const animatedAsset = await animateImageWithHailuo(imageAsset, scene);
        animatedAsset.imageProvider = imageAsset.imageProvider; // Preserve provider info
        console.log(`  ✓ Asset ${idx + 1} animated (${animatedAsset.url.substring(0, 50)}...)`);
        assets.push(animatedAsset);
      } catch (error) {
        console.warn(`  ⚠️  Animation failed for scene ${idx + 1}, using static image:`, error);
        animationFailures.push(error instanceof Error ? error : new Error(String(error)));
        // Fallback to static image with Ken Burns effect
        assets.push({
          ...imageAsset,
          animationProvider: "static" as const,
          imageCost: imageAsset.imageCost ?? imageAsset.cost,
          animationCost: 0,
        });
      }
    }
  } else {
    // No Hailuo API key or no images, use static images
    if (imageAssets.length > 0) {
      console.log(`  ℹ️  Using static images (Hailuo not available)`);
      for (const imageAsset of imageAssets) {
        assets.push({
          ...imageAsset,
          animationProvider: "static" as const,
          imageCost: imageAsset.imageCost ?? imageAsset.cost,
          animationCost: 0,
        });
      }
    }
  }

  // Allow partial success
  if (animationFailures.length > 0) {
    console.warn(`⚠️  ${animationFailures.length} animation(s) failed`);
  }

  const totalCost = assets.reduce((sum, a) => sum + a.cost, 0);

  console.log(`✅ Animation complete:`, {
    totalAssets: assets.length,
    totalCost: `$${totalCost.toFixed(4)}`,
  });

  return {
    assets,
  };
}

/**
 * Animate an image using MiniMax Hailuo-02 API
 * Works with images from any provider (Gemini, etc.)
 *
 * @param imageAsset - Generated image asset (from any provider)
 * @param scene - Scene with description for animation prompt
 * @returns Animated video asset with Hailuo provider
 */
export async function animateImageWithHailuo(
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
  const imageCost = imageAsset.cost;
  const totalCost = imageCost + hailuoCost; // Image generation + Hailuo animation

  console.log(`    ✓ Animation complete in ${generationTime.toFixed(1)}s (cost: $${hailuoCost.toFixed(3)})`);

  return {
    sceneId: imageAsset.sceneId,
    sceneOrder: imageAsset.sceneOrder,
    type: "video_clip",
    url: videoUrl,
    cost: totalCost,
    imageCost,
    animationCost: hailuoCost,
    reused: false,
    animationProvider: "hailuo",
    generationTime,
    imageProvider: imageAsset.imageProvider,
    referenceImageCount: imageAsset.referenceImageCount,
  };
}
