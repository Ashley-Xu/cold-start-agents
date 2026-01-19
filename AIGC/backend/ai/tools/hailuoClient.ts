// MiniMax Hailuo-02 API Client - Image-to-Video Animation
// API Documentation: https://platform.minimax.io/docs/pricing/video-package

import { z } from "zod";

// ============================================================================
// Zod Schemas for Input/Output Validation
// ============================================================================

/**
 * Input schema for Hailuo image-to-video generation
 */
export const HailuoGenerationInputSchema = z.object({
  imageUrl: z.string().url().describe("URL of the image to animate"),
  prompt: z.string().min(1).describe("Animation prompt describing desired motion"),
  resolution: z.enum(["768p", "1080p"]).default("768p").describe("Output video resolution (768P or 1080P)"),
  duration: z.number().min(5).max(10).default(6).describe("Video duration in seconds (5-10)"),
});

/**
 * Output schema for Hailuo generation response
 */
export const HailuoGenerationOutputSchema = z.object({
  taskId: z.string().describe("Unique task identifier for polling"),
  status: z.enum(["pending", "processing", "completed", "failed"]).describe("Current generation status"),
  videoUrl: z.string().url().optional().describe("Download URL of generated video (when completed)"),
  error: z.string().optional().describe("Error message (when failed)"),
});

// ============================================================================
// API Client Functions
// ============================================================================

/**
 * Initiate image-to-video animation with MiniMax Hailuo-02
 *
 * @param input - Generation parameters (image URL, prompt, resolution, duration)
 * @returns Task ID and initial status
 *
 * @example
 * ```typescript
 * const result = await generateAnimation({
 *   imageUrl: "https://example.com/scene.jpg",
 *   prompt: "A knight walking through a misty forest with birds flying overhead",
 *   resolution: "512p",
 *   duration: 6
 * });
 * ```
 */
export async function generateAnimation(
  input: z.infer<typeof HailuoGenerationInputSchema>
): Promise<z.infer<typeof HailuoGenerationOutputSchema>> {
  // Validate input
  const validatedInput = HailuoGenerationInputSchema.parse(input);

  // Call MiniMax API
  const response = await fetch("https://api.minimax.io/v1/video_generation", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("MINIMAX_API_KEY_PAY_AS_YOU_GO")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "MiniMax-Hailuo-2.3",
      prompt: validatedInput.prompt,
      first_frame_image: validatedInput.imageUrl,
      duration: validatedInput.duration,
      resolution: validatedInput.resolution.toUpperCase(), // Convert 512p to 512P
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MiniMax Hailuo API error: ${response.status} ${errorText}`);
  }

  const result = await response.json();

  // Check for API errors in base_resp
  if (result.base_resp && result.base_resp.status_code !== 0) {
    const errorCode = result.base_resp.status_code;
    const errorMsg = result.base_resp.status_msg;

    if (errorCode === 1008) {
      throw new Error(`MiniMax API error: Insufficient balance. Please check your account credits at https://platform.minimax.io/user-center/basic-information`);
    } else if (errorCode === 2049) {
      throw new Error(`MiniMax API error: Invalid API key. Please verify MINIMAX_API_KEY_PAY_AS_YOU_GO in .env file`);
    } else if (errorCode === 2013) {
      throw new Error(`MiniMax API error: Invalid parameters - ${errorMsg}`);
    } else {
      throw new Error(`MiniMax API error (${errorCode}): ${errorMsg}`);
    }
  }

  // Return standardized output
  return {
    taskId: result.task_id || result.id,
    status: "pending",
    videoUrl: undefined,
    error: undefined,
  };
}

/**
 * Poll generation status until completion or timeout
 *
 * @param taskId - Task identifier from generateAnimation()
 * @param maxWaitSeconds - Maximum time to wait (default: 120 seconds)
 * @returns Final generation result with video URL
 *
 * @example
 * ```typescript
 * const completed = await pollGenerationStatus(taskId, 120);
 * if (completed.status === "completed") {
 *   console.log("Video URL:", completed.videoUrl);
 * }
 * ```
 */
export async function pollGenerationStatus(
  taskId: string,
  maxWaitSeconds = 120
): Promise<z.infer<typeof HailuoGenerationOutputSchema>> {
  const startTime = Date.now();
  const pollInterval = 10000; // Poll every 10 seconds (recommended by MiniMax)

  while (Date.now() - startTime < maxWaitSeconds * 1000) {
    // Query task status (use GET with query parameter)
    const response = await fetch(
      `https://api.minimax.io/v1/query/video_generation?task_id=${taskId}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("MINIMAX_API_KEY_PAY_AS_YOU_GO")}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MiniMax status query error: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    // Debug logging
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`      [${elapsed}s] Status: ${result.status || result.base_resp?.status_msg || 'unknown'}`);

    // Check status (MiniMax uses "success" not "completed")
    if (result.status === "success" || result.status === "Success") {
      // Step 3: Retrieve download URL using file_id
      const fileId = result.file_id;
      console.log(`      Retrieving download URL for file_id: ${fileId}`);

      const downloadUrl = await retrieveVideoDownloadUrl(fileId);

      return {
        taskId,
        status: "completed",
        videoUrl: downloadUrl,
        error: undefined,
      };
    } else if (result.status === "failed" || result.status === "Failed") {
      throw new Error(`Hailuo generation failed: ${result.base_resp?.status_msg || "Unknown error"}`);
    }

    // Still processing, wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // Timeout reached
  throw new Error(`Hailuo generation timed out after ${maxWaitSeconds}s`);
}

/**
 * Retrieve video download URL from file_id
 *
 * @param fileId - File ID returned from video generation
 * @returns Download URL for the generated video
 */
async function retrieveVideoDownloadUrl(fileId: string): Promise<string> {
  const response = await fetch(
    `https://api.minimax.io/v1/files/retrieve?file_id=${fileId}`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("MINIMAX_API_KEY_PAY_AS_YOU_GO")}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MiniMax file retrieval error: ${response.status} ${errorText}`);
  }

  const result = await response.json();

  // Extract download URL from response
  const downloadUrl = result.file?.download_url;

  if (!downloadUrl) {
    throw new Error(`No download URL found in file retrieval response for file_id: ${fileId}`);
  }

  return downloadUrl;
}

/**
 * Generate animated video from static image (combines generation + polling)
 *
 * This is a convenience function that handles the full workflow:
 * 1. Initiate generation
 * 2. Poll until completion
 * 3. Return video URL
 *
 * @param input - Generation parameters
 * @param maxWaitSeconds - Maximum time to wait for completion
 * @returns Video URL and generation metadata
 *
 * @example
 * ```typescript
 * const { videoUrl, generationTime } = await generateAnimatedVideo({
 *   imageUrl: "https://example.com/scene.jpg",
 *   prompt: "Character walking with natural movement",
 *   resolution: "512p",
 *   duration: 6
 * });
 * ```
 */
export async function generateAnimatedVideo(
  input: z.infer<typeof HailuoGenerationInputSchema>,
  maxWaitSeconds = 120
): Promise<{ videoUrl: string; generationTime: number }> {
  const startTime = Date.now();

  // Step 1: Initiate generation
  const generation = await generateAnimation(input);
  console.log(`🎬 Hailuo generation started: ${generation.taskId}`);

  // Step 2: Poll for completion
  const completed = await pollGenerationStatus(generation.taskId, maxWaitSeconds);

  if (!completed.videoUrl) {
    throw new Error("Hailuo generation completed but no video URL returned");
  }

  const generationTime = (Date.now() - startTime) / 1000;
  console.log(`✓ Animation complete in ${generationTime.toFixed(1)}s`);

  return {
    videoUrl: completed.videoUrl,
    generationTime,
  };
}

// ============================================================================
// Cost Calculation Utilities
// ============================================================================

/**
 * Calculate cost for Hailuo video generation (pay-as-you-go pricing)
 *
 * Pricing (as of 2026):
 * - 768p: $0.045/second
 * - 1080p: $0.08/second
 * Note: 512p is not supported by MiniMax-Hailuo-2.3
 *
 * @param resolution - Video resolution
 * @param duration - Video duration in seconds
 * @returns Cost in USD
 */
export function calculateCost(
  resolution: "768p" | "1080p",
  duration: number
): number {
  const pricePerSecond = {
    "768p": 0.045,
    "1080p": 0.08,
  };

  return pricePerSecond[resolution] * duration;
}

/**
 * Estimate total cost for multiple video generations
 *
 * @param videoCount - Number of videos to generate
 * @param resolution - Video resolution
 * @param duration - Average duration per video
 * @returns Total estimated cost in USD
 */
export function estimateBatchCost(
  videoCount: number,
  resolution: "768p" | "1080p" = "768p",
  duration: number = 6
): number {
  return calculateCost(resolution, duration) * videoCount;
}

// ============================================================================
// Export
// ============================================================================

export default {
  generateAnimation,
  pollGenerationStatus,
  generateAnimatedVideo,
  calculateCost,
  estimateBatchCost,
  HailuoGenerationInputSchema,
  HailuoGenerationOutputSchema,
};
