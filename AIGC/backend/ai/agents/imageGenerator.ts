// Image Generator - Generates images using Gemini

import { z } from "zod";
import { openai } from "../index.ts";
import { generateImage as generateGeminiImage } from "../tools/geminiClient.ts";
import type {
  AssetGeneratorInput,
  AssetGeneratorOutput,
} from "../../lib/types.ts";
import {
  AssetSceneSchema,
  AssetGeneratorInputSchema,
  GeneratedAssetSchema,
  ImageProvider,
} from "./assetGenerator.ts";

// ============================================================================
// Image Generation Functions
// ============================================================================

/**
 * Generate images only (without animation) from storyboard scenes
 *
 * @param input - Asset generator input (scenes, premium flag)
 * @returns Image assets only (no animation)
 */
export async function generateImagesOnly(
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
    `📸 Generating images for ${validatedInput.scenes.length} scenes (Default: ${defaultProvider}, Recursive: ${useRecursive ? "Yes" : "No"})...`,
  );

  // Generate all images sequentially (with reference tracking for recursive generation)
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

  // Allow partial success - proceed if at least 1 image was generated
  if (imageFailures.length > 0) {
    console.warn(`⚠️  ${imageFailures.length} image(s) failed to generate`);

    // Log failure details for debugging
    imageFailures.forEach((failure) => {
      const errorMessage = failure?.message || "Unknown error";
      console.warn(`  Failed image: ${errorMessage}`);
    });

    // Only fail if ALL images failed
    if (imageAssets.length === 0) {
      const errorMessage = imageFailures[0]?.message || "Unknown error";

      if (errorMessage.includes("content filters") || errorMessage.includes("content_policy_violation")) {
        throw new Error(
          "All image prompts were blocked by content filters. Please try again with a different topic or style."
        );
      }

      throw new Error(
        `Failed to generate all ${imageFailures.length} images: ${errorMessage}`,
      );
    }

    console.log(`✅ Partial success: Generated ${imageAssets.length} out of ${validatedInput.scenes.length} images`);
  }

  const totalCost = imageAssets.reduce((sum, a) => sum + a.cost, 0);

  console.log(`✅ Image generation complete:`, {
    totalImages: imageAssets.length,
    totalCost: `$${totalCost.toFixed(4)}`,
    defaultProvider: defaultProvider,
  });

  return {
    assets: imageAssets,
  };
}

/**
 * Generate an image asset using Gemini
 *
 * @param scene - Scene with image prompt
 * @param provider - Image generation provider (gemini-2.5-flash-image or gemini-3-pro)
 * @returns Generated asset with URL and cost
 */
export async function generateImageAsset(
  scene: z.infer<typeof AssetSceneSchema>,
  provider: ImageProvider = "gemini-3-pro",
): Promise<z.infer<typeof GeneratedAssetSchema>> {
  const sceneId = `scene-${scene.order}`;
  const sceneOrder = scene.order;
  return await generateGeminiImageAsset(scene, sceneId, sceneOrder, provider, []);
}

/**
 * Generate an image asset with reference images for recursive generation
 *
 * @param scene - Scene with image prompt
 * @param provider - Image generation provider
 * @param referenceImageUrls - URLs of previous images to use as references
 * @param isFirstScene - Whether this is the first scene (no references)
 * @returns Generated asset with URL and cost
 */
export async function generateImageAssetWithReferences(
  scene: z.infer<typeof AssetSceneSchema>,
  provider: ImageProvider,
  referenceImageUrls: string[],
  isFirstScene: boolean,
): Promise<z.infer<typeof GeneratedAssetSchema>> {
  const sceneId = `scene-${scene.order}`;

  if (isFirstScene || referenceImageUrls.length === 0 || provider === "gemini-2.5-flash-image") {
    if (provider === "gemini-2.5-flash-image" && referenceImageUrls.length > 0) {
      console.warn("⚠️  gemini-2.5-flash-image doesn't support reference images. Use gemini-3-pro for recursive generation.");
    }
    return await generateImageAsset(scene, provider);
  }

  const asset = await generateGeminiImageAsset(
    scene,
    sceneId,
    scene.order,
    provider,
    referenceImageUrls
  );
  
  asset.referenceImageCount = referenceImageUrls.length;
  return asset;
}

/**
 * Generate an image asset using Gemini
 *
 * @param scene - Scene with image prompt
 * @param sceneId - Scene identifier
 * @param sceneOrder - Scene order number
 * @param provider - Gemini model variant (gemini-2.5-flash-image or gemini-3-pro)
 * @param referenceImageUrls - Optional reference image URLs for consistency
 * @returns Generated asset with URL and cost
 */
async function generateGeminiImageAsset(
  scene: z.infer<typeof AssetSceneSchema>,
  sceneId: string,
  sceneOrder: number,
  provider: "gemini-2.5-flash-image" | "gemini-3-pro",
  referenceImageUrls: string[] = [],
): Promise<z.infer<typeof GeneratedAssetSchema>> {
  try {
    // Enhance prompt to ensure correct vertical orientation
    let orientedPrompt = `${scene.imagePrompt}. IMPORTANT: Create a VERTICAL PORTRAIT composition (9:16 aspect ratio) where subjects are upright and properly oriented for vertical viewing. The scene should be naturally composed for vertical/portrait orientation.`;

    // Add style-only instructions if using reference images
    if (referenceImageUrls.length > 0) {
      orientedPrompt += ` Match ONLY the visual style of the reference image(s)—art style, color palette, lighting, and rendering approach. Do NOT copy the specific subjects, characters, or composition from the reference image(s); use the current scene description as the source of content.`;
    }

    // Map provider to Gemini model name
    const geminiModel = provider === "gemini-3-pro"
      ? "gemini-3-pro-image-preview"
      : "gemini-2.5-flash-image";

    const resolution = "1K";

    console.log(`    🎨 Generating image with Gemini ${geminiModel}${referenceImageUrls.length > 0 ? ` (with ${referenceImageUrls.length} reference image(s))` : ""}...`);

    const preparedReferenceUrls: string[] = [];
    for (const url of referenceImageUrls) {
      if (url.startsWith('data:')) {
        console.warn(`    ⚠️  Reference image is a data URL. Gemini API may require accessible URLs.`);
      }
      preparedReferenceUrls.push(url);
    }

    const result = await generateGeminiImage({
      prompt: orientedPrompt,
      model: geminiModel,
      aspectRatio: "9:16",
      resolution: resolution as "1K" | "2K" | "4K",
      responseModalities: ["IMAGE"],
      referenceImages: preparedReferenceUrls.length > 0 ? preparedReferenceUrls : undefined,
    });

    return {
      sceneId,
      sceneOrder,
      type: "image",
      url: result.imageUrl,
      cost: result.cost, // Total cost (only image at this stage)
      imageCost: result.cost, // Image generation cost
      animationCost: 0, // No animation cost for images
      reused: false,
      referenceImageCount: preparedReferenceUrls.length > 0 ? preparedReferenceUrls.length : undefined,
    };
  } catch (error) {
    console.error(`Error generating Gemini image for scene ${scene.order}:`, error);
    
      // If reference images failed, try without them as fallback
      if (referenceImageUrls.length > 0 && error instanceof Error) {
        if (error.message.includes("reference") || error.message.includes("image") || error.message.includes("INVALID_ARGUMENT")) {
          console.warn(`    ⚠️  Reference image generation failed, retrying without references for scene ${scene.order}`);
          // Retry without references
          return await generateGeminiImageAsset(scene, sceneId, sceneOrder, provider, []);
        }
      }
    
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
  const sceneOrder = scene.order;

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
      sceneOrder,
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
          "Sora 2 API access not available. Please ensure you have API access from OpenAI.",
        );
      }
    }

    throw error;
  }
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

