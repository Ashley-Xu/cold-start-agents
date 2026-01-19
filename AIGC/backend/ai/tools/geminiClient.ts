// Google Gemini Nano Banana Image Generation Client
// API Documentation: https://ai.google.dev/gemini-api/docs/image-generation

import { z } from "zod";

// ============================================================================
// Zod Schemas for Input/Output Validation
// ============================================================================

/**
 * Gemini model options
 */
export type GeminiImageModel = "gemini-2.5-flash-image" | "gemini-3-pro-image-preview";

/**
 * Aspect ratio options for Gemini image generation
 */
export type GeminiAspectRatio = "1:1" | "4:3" | "16:9" | "9:16" | "21:9";

/**
 * Resolution options for Gemini image generation
 */
export type GeminiResolution = "1K" | "2K" | "4K";

/**
 * Input schema for Gemini image generation
 */
export const GeminiImageGenerationInputSchema = z.object({
  prompt: z.string().min(1).describe("Text prompt describing the image to generate"),
  model: z.enum(["gemini-2.5-flash-image", "gemini-3-pro-image-preview"]).default("gemini-2.5-flash-image").describe("Gemini model to use"),
  aspectRatio: z.enum(["1:1", "4:3", "16:9", "9:16", "21:9"]).default("9:16").describe("Aspect ratio for the generated image"),
  resolution: z.enum(["1K", "2K", "4K"]).default("1K").describe("Output resolution (only 2K and 4K supported for Pro model)"),
  referenceImages: z.array(z.string().url()).optional().describe("Optional reference image URLs for consistency/editing"),
  responseModalities: z.array(z.enum(["IMAGE", "TEXT"])).default(["IMAGE"]).describe("Response modalities (must be uppercase: IMAGE or TEXT)"),
});

/**
 * Output schema for Gemini image generation
 */
export const GeminiImageGenerationOutputSchema = z.object({
  imageUrl: z.string().url().describe("URL of the generated image"),
  imageData: z.string().optional().describe("Base64 encoded image data (if returned inline)"),
  cost: z.number().min(0).describe("Generation cost in USD"),
  model: z.string().describe("Model used for generation"),
});

// ============================================================================
// API Client Functions
// ============================================================================

/**
 * Generate an image using Google Gemini Nano Banana
 *
 * @param input - Generation parameters (prompt, model, aspect ratio, etc.)
 * @returns Generated image URL and metadata
 *
 * @example
 * ```typescript
 * const result = await generateImage({
 *   prompt: "A knight walking through a misty forest",
 *   model: "gemini-2.5-flash-image",
 *   aspectRatio: "9:16",
 *   resolution: "1K"
 * });
 * ```
 */
export async function generateImage(
  input: z.infer<typeof GeminiImageGenerationInputSchema>
): Promise<z.infer<typeof GeminiImageGenerationOutputSchema>> {
  // Validate input
  const validatedInput = GeminiImageGenerationInputSchema.parse(input);

  const apiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error(
      "GOOGLE_GEMINI_API_KEY environment variable is required. Get one at https://aistudio.google.com/app/apikey"
    );
  }

  // Build the API request - include role field as per API spec
  const requestBody: any = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: validatedInput.prompt,
          },
        ],
      },
    ],
  };

  // Build generationConfig
  // For gemini-2.5-flash-image, imageConfig might not support imageSize
  // Try with just aspectRatio first, or omit imageConfig entirely if it fails
  const generationConfig: Record<string, unknown> = {
    responseModalities: validatedInput.responseModalities,
  };

  // Add imageConfig - for flash-image, try without imageSize first
  if (validatedInput.model === "gemini-2.5-flash-image") {
    // Flash-image might only support aspectRatio, not imageSize
    generationConfig.imageConfig = {
      aspectRatio: validatedInput.aspectRatio,
      // Try without imageSize for flash-image model
    };
  } else {
    // Pro model supports both
    generationConfig.imageConfig = {
      aspectRatio: validatedInput.aspectRatio,
      imageSize: validatedInput.resolution,
    };
  }

  requestBody.generationConfig = generationConfig;

  // Add reference images if provided (for Pro model)
  if (validatedInput.referenceImages && validatedInput.referenceImages.length > 0) {
    if (validatedInput.model === "gemini-2.5-flash-image") {
      console.warn("Reference images are only supported with gemini-3-pro-image-preview. Ignoring reference images.");
    } else {
      // Fetch and encode reference images
      const imageParts = await Promise.all(
        validatedInput.referenceImages.map(async (url) => {
          const response = await fetch(url);
          const arrayBuffer = await response.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          const mimeType = response.headers.get("content-type") || "image/jpeg";
          return {
            inlineData: {
              data: base64,
              mimeType: mimeType,
            },
          };
        })
      );
      requestBody.contents[0].parts.push(...imageParts);
    }
  }

  // Call Gemini API
  const modelName = validatedInput.model;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  // Log the request for debugging (without sensitive data)
  console.log("Gemini API Request:", JSON.stringify({
    model: modelName,
    contents: requestBody.contents,
    generationConfig: requestBody.generationConfig,
  }, null, 2));

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Gemini API error: ${response.status} ${errorText}`;
    
    try {
      const errorJson = JSON.parse(errorText);
      console.error("Full Gemini API error response:", JSON.stringify(errorJson, null, 2));
      
      if (errorJson.error?.message) {
        errorMessage = `Gemini API error: ${errorJson.error.message}`;
      }
      // Log the full error details for debugging
      if (errorJson.error?.details) {
        console.error("Gemini API error details:", JSON.stringify(errorJson.error.details, null, 2));
      }
      // Check for field-specific errors
      if (errorJson.error?.status === "INVALID_ARGUMENT") {
        console.error("INVALID_ARGUMENT - Check which field is causing the issue above");
      }
    } catch {
      // Keep original error message if JSON parsing fails
      console.error("Raw error response (not JSON):", errorText);
    }
    
    // Log the request body for debugging (without the API key)
    const debugBody = { ...requestBody };
    console.error("Request body sent to Gemini API:", JSON.stringify(debugBody, null, 2));
    
    throw new Error(errorMessage);
  }

  const result = await response.json();

  // Extract image data from response
  // The response structure may vary - adjust based on actual API response
  const imagePart = result.candidates?.[0]?.content?.parts?.find(
    (part: any) => part.inlineData?.mimeType?.startsWith("image/")
  );

  if (!imagePart) {
    throw new Error("Gemini API did not return an image in the response");
  }

  const imageData = imagePart.inlineData?.data;
  const mimeType = imagePart.inlineData?.mimeType || "image/png";

  // If image is returned as base64, we may need to upload it or return it directly
  // For now, we'll return the base64 data as a data URL
  const imageUrl = imageData
    ? `data:${mimeType};base64,${imageData}`
    : imagePart.url || "";

  if (!imageUrl) {
    throw new Error("Gemini API did not return a valid image URL or data");
  }

  // Calculate cost based on model and resolution
  const cost = calculateCost(validatedInput.model, validatedInput.resolution);

  return {
    imageUrl,
    imageData: imageData || undefined,
    cost,
    model: validatedInput.model,
  };
}

/**
 * Calculate cost for Gemini image generation
 *
 * Pricing (as of 2025 - verify with current pricing):
 * - gemini-2.5-flash-image: ~$0.01-0.02 per image (1K resolution)
 * - gemini-3-pro-image-preview: ~$0.05-0.10 per image (varies by resolution)
 *
 * @param model - Gemini model used
 * @param resolution - Output resolution
 * @returns Cost in USD
 */
export function calculateCost(
  model: GeminiImageModel,
  resolution: GeminiResolution
): number {
  // Pricing estimates - update with actual pricing from Google
  const pricing: Record<GeminiImageModel, Record<GeminiResolution, number>> = {
    "gemini-2.5-flash-image": {
      "1K": 0.01,
      "2K": 0.015,
      "4K": 0.02,
    },
    "gemini-3-pro-image-preview": {
      "1K": 0.05,
      "2K": 0.075,
      "4K": 0.10,
    },
  };

  return pricing[model]?.[resolution] || 0.01;
}

/**
 * Estimate total cost for multiple image generations
 *
 * @param imageCount - Number of images to generate
 * @param model - Gemini model to use
 * @param resolution - Output resolution
 * @returns Total estimated cost in USD
 */
export function estimateBatchCost(
  imageCount: number,
  model: GeminiImageModel = "gemini-2.5-flash-image",
  resolution: GeminiResolution = "1K"
): number {
  return calculateCost(model, resolution) * imageCount;
}

// ============================================================================
// Export
// ============================================================================

export default {
  generateImage,
  calculateCost,
  estimateBatchCost,
  GeminiImageGenerationInputSchema,
  GeminiImageGenerationOutputSchema,
};
