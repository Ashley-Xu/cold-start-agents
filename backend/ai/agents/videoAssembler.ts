// Video Assembler Agent - Assembles final video with TTS and motion effects
// NOTE: Uses direct OpenAI SDK integration (not Mastra framework)
//
// This agent orchestrates the final video assembly process:
// 1. Generate TTS audio with ElevenLabs
// 2. Assemble video with FFmpeg (images + audio + effects)
// 3. Add motion effects (Ken Burns, fade, zoom)
// 4. Generate and overlay subtitles
// 5. Export final MP4 (1080x1920, vertical)

import { z } from "zod";
import type {
  VideoAssemblerInput,
  VideoAssemblerOutput,
  VideoScene,
} from "../../lib/types.ts";

// ============================================================================
// Zod Schemas for Input/Output Validation
// ============================================================================

/**
 * Scene schema for video assembly
 */
export const VideoSceneSchema = z.object({
  order: z.number().int().min(1).describe("Scene order"),
  narration: z.string().min(1).describe("Narration text"),
  startTime: z.number().min(0).describe("Start time in seconds"),
  endTime: z.number().min(0).describe("End time in seconds"),
  assetUrl: z.string().url().describe("Image/video asset URL"),
  transition: z.string().optional().describe("Transition effect"),
});

/**
 * Input schema for Video Assembler
 */
export const VideoAssemblerInputSchema = z.object({
  videoId: z.string().min(1).describe("Video project ID"),
  language: z.enum(["zh", "en", "fr"]).describe("Narration language"),
  scenes: z.array(VideoSceneSchema).min(1).max(10).describe("Video scenes"),
  duration: z.union([z.literal(30), z.literal(60), z.literal(90)]).describe(
    "Target duration",
  ),
});

/**
 * Output schema for Video Assembler
 */
export const VideoAssemblerOutputSchema = z.object({
  videoUrl: z.string().url().describe("Final video URL"),
  audioUrl: z.string().url().describe("Generated TTS audio URL"),
  subtitlesUrl: z.string().url().optional().describe("Subtitles file URL (SRT)"),
  duration: z.number().min(0).describe("Actual video duration in seconds"),
  fileSize: z.number().min(0).describe("File size in bytes"),
  cost: z.number().min(0).describe("Total generation cost in USD"),
  format: z.string().describe("Video format (e.g., mp4)"),
  resolution: z.string().describe("Video resolution (e.g., 1080x1920)"),
});

// ============================================================================
// TTS Generation (ElevenLabs Integration)
// ============================================================================

/**
 * Generate TTS audio with ElevenLabs
 *
 * NOTE: This is a placeholder implementation. Real implementation requires:
 * 1. ElevenLabs API key in environment
 * 2. Voice ID selection based on language
 * 3. Audio file upload to storage
 *
 * @param text - Narration text
 * @param language - Target language (zh/en/fr)
 * @returns Audio URL and cost
 */
async function generateTTS(
  text: string,
  language: "zh" | "en" | "fr",
): Promise<{ audioUrl: string; cost: number; duration: number }> {
  console.log(`🎤 Generating TTS for ${text.length} characters (${language})...`);

  const characterCount = text.length;
  const cost = (characterCount / 1000) * 0.15;

  // Get voice ID for language
  const voiceId = getVoiceId(language);

  // Get ElevenLabs API key
  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");

  if (!apiKey || apiKey === "") {
    console.log("⚠️ ElevenLabs API key not found, using placeholder audio");

    // Generate silent audio file as fallback
    const uploadsDir = "./uploads";
    await Deno.mkdir(uploadsDir, { recursive: true });
    const audioPath = `${uploadsDir}/audio_${Date.now()}.mp3`;

    // Create a 30-second silent audio file using FFmpeg
    const command = new Deno.Command("ffmpeg", {
      args: [
        "-f", "lavfi",
        "-i", "anullsrc=r=44100:cl=stereo",
        "-t", "30",
        "-q:a", "9",
        "-acodec", "libmp3lame",
        audioPath
      ],
      stdout: "piped",
      stderr: "piped",
    });

    await command.output();

    return {
      audioUrl: audioPath,
      cost,
      duration: 30,
    };
  }

  try {
    // Call ElevenLabs API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Accept": "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    // Save audio file
    const uploadsDir = "./uploads";
    await Deno.mkdir(uploadsDir, { recursive: true });
    const audioPath = `${uploadsDir}/audio_${Date.now()}.mp3`;

    const audioData = await response.arrayBuffer();
    await Deno.writeFile(audioPath, new Uint8Array(audioData));

    // Get audio duration using FFmpeg
    const probeCommand = new Deno.Command("ffprobe", {
      args: [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        audioPath
      ],
      stdout: "piped",
    });

    const { stdout } = await probeCommand.output();
    const duration = parseFloat(new TextDecoder().decode(stdout).trim());

    console.log(`✅ TTS generated: ${Math.ceil(duration)}s, cost=$${cost.toFixed(4)}`);

    return {
      audioUrl: audioPath,
      cost,
      duration: Math.ceil(duration),
    };
  } catch (error) {
    console.error("Error generating TTS:", error);

    // Fallback to silent audio
    const uploadsDir = "./uploads";
    await Deno.mkdir(uploadsDir, { recursive: true });
    const audioPath = `${uploadsDir}/audio_${Date.now()}.mp3`;

    const command = new Deno.Command("ffmpeg", {
      args: [
        "-f", "lavfi",
        "-i", "anullsrc=r=44100:cl=stereo",
        "-t", "30",
        "-q:a", "9",
        "-acodec", "libmp3lame",
        audioPath
      ],
      stdout: "piped",
      stderr: "piped",
    });

    await command.output();

    return {
      audioUrl: audioPath,
      cost,
      duration: 30,
    };
  }
}

/**
 * Select ElevenLabs voice ID based on language
 */
function getVoiceId(language: "zh" | "en" | "fr"): string {
  const voiceMap = {
    zh: "pNInz6obpgDQGcFmaJgB", // Chinese voice - Adam
    en: "21m00Tcm4TlvDq8ikWAM", // English voice - Rachel
    fr: "ThT5KcBeYPX3keUQqHPh", // French voice - Dorothy
  };

  return voiceMap[language];
}

// ============================================================================
// Subtitle Generation (SRT Format)
// ============================================================================

/**
 * Generate SRT subtitle file from scenes
 *
 * @param scenes - Video scenes with narration and timestamps
 * @returns SRT file content
 */
function generateSubtitles(scenes: VideoScene[]): string {
  let srt = "";

  scenes.forEach((scene, index) => {
    const sequence = index + 1;
    const startTime = formatSRTTime(scene.startTime);
    const endTime = formatSRTTime(scene.endTime);

    srt += `${sequence}\n`;
    srt += `${startTime} --> ${endTime}\n`;
    srt += `${scene.narration}\n\n`;
  });

  return srt.trim();
}

/**
 * Format seconds to SRT timestamp (HH:MM:SS,mmm)
 */
function formatSRTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${
    String(secs).padStart(2, "0")
  },${String(milliseconds).padStart(3, "0")}`;
}

// ============================================================================
// FFmpeg Video Assembly
// ============================================================================

/**
 * Generate FFmpeg command for video assembly
 *
 * This creates a complex FFmpeg command that:
 * 1. Applies Ken Burns effect to each image (zoom + pan)
 * 2. Adds fade transitions between scenes
 * 3. Overlays audio narration
 * 4. Burns in subtitles
 * 5. Outputs vertical video (1080x1920)
 *
 * @param scenes - Video scenes with assets
 * @param audioUrl - TTS audio file path
 * @param subtitlesPath - SRT file path
 * @returns FFmpeg command string
 */
function generateFFmpegCommand(
  scenes: VideoScene[],
  audioUrl: string,
  subtitlesPath?: string,
): string {
  // NOTE: This is a simplified example. Production FFmpeg commands are much more complex.
  //
  // Full implementation would:
  // 1. Download all assets locally
  // 2. Create complex filter graph for Ken Burns effects
  // 3. Add crossfade transitions between scenes
  // 4. Overlay audio with proper sync
  // 5. Burn in subtitles with styling
  // 6. Export with optimal encoding settings

  const inputFiles = scenes.map((s) => `-i "${s.assetUrl}"`).join(" ");
  const outputFile = "output_vertical.mp4";

  // Simplified FFmpeg command (placeholder)
  const command = `ffmpeg ${inputFiles} -i "${audioUrl}" \\
    -filter_complex "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0015,1.5)':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920[v0]; \\
    [v0]fade=t=in:st=0:d=0.5,fade=t=out:st=4.5:d=0.5[v0_fade]" \\
    -map "[v0_fade]" -map 1:a \\
    -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k \\
    -movflags +faststart \\
    -r 30 -pix_fmt yuv420p \\
    ${outputFile}`;

  return command;
}

/**
 * Assemble video with FFmpeg (placeholder)
 *
 * NOTE: This is a placeholder. Real implementation requires:
 * 1. FFmpeg installed on system
 * 2. Asset download from URLs
 * 3. Temporary file management
 * 4. Command execution with error handling
 * 5. Video upload to storage
 *
 * @param scenes - Video scenes
 * @param audioUrl - Audio file URL
 * @param subtitlesPath - Subtitles file path
 * @returns Video URL and metadata
 */
async function assembleVideoWithFFmpeg(
  scenes: VideoScene[],
  audioUrl: string,
  subtitlesPath?: string,
): Promise<{
  videoUrl: string;
  duration: number;
  fileSize: number;
  format: string;
  resolution: string;
}> {
  console.log(`🎬 Assembling video with ${scenes.length} scenes...`);

  // Create temporary directory for video assembly
  const tempDir = await Deno.makeTempDir({ prefix: "video_assembly_" });
  const outputFile = `${tempDir}/output.mp4`;

  try {
    // Download assets to temp directory and check dimensions
    const imageFiles: string[] = [];
    const imageDimensions: Array<{ width: number; height: number }> = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const imagePath = `${tempDir}/scene_${i}.jpg`;

      console.log(`  Downloading scene ${i + 1} from ${scene.assetUrl}...`);
      const response = await fetch(scene.assetUrl);
      const imageData = await response.arrayBuffer();
      await Deno.writeFile(imagePath, new Uint8Array(imageData));

      // Get image dimensions using ffprobe
      const probeCommand = new Deno.Command("ffprobe", {
        args: [
          "-v", "error",
          "-select_streams", "v:0",
          "-show_entries", "stream=width,height",
          "-of", "csv=s=x:p=0",
          imagePath
        ],
        stdout: "piped",
      });

      const { stdout } = await probeCommand.output();
      const dimensions = new TextDecoder().decode(stdout).trim().split("x");
      const width = parseInt(dimensions[0]);
      const height = parseInt(dimensions[1]);

      imageDimensions.push({ width, height });
      imageFiles.push(imagePath);

      console.log(`  Scene ${i + 1} dimensions: ${width}x${height} (${width > height ? 'horizontal' : 'vertical'})`);
    }

    // Build FFmpeg input arguments for all images
    const inputArgs: string[] = [];
    const filterParts: string[] = [];

    // Add all image inputs
    for (let i = 0; i < imageFiles.length; i++) {
      inputArgs.push(
        "-loop", "1",
        "-t", scenes[i].endTime.toString(),
        "-i", imageFiles[i]
      );
    }

    // Add audio input
    inputArgs.push("-i", audioUrl);

    // Create filter complex for each image with Ken Burns effect
    // Target: 1080x1920 output (vertical TikTok/Reels format)
    for (let i = 0; i < imageFiles.length; i++) {
      const duration = scenes[i].endTime - scenes[i].startTime;
      const frames = Math.floor(duration * 30); // 30fps
      const dims = imageDimensions[i];
      const isHorizontal = dims.width > dims.height;

      // Build filter chain
      let filter = `[${i}:v]`;

      // Step 1: Rotate horizontal images to vertical (90 degrees clockwise)
      if (isHorizontal) {
        filter += `transpose=1,`; // 1 = 90 degrees clockwise
        console.log(`  Rotating scene ${i + 1} from horizontal to vertical`);
      }

      // Step 2: Scale to fit vertical canvas (maintain aspect ratio)
      filter += `scale=1080:1920:force_original_aspect_ratio=decrease,`;

      // Step 3: Pad to exact size with black bars if needed
      filter += `pad=1080:1920:(ow-iw)/2:(oh-ih)/2,`;

      // Step 4: Apply Ken Burns effect (slow zoom from 1.0x to 1.3x with subtle pan)
      filter += `zoompan=` +
        `z='min(1.0+0.3*on/${frames},1.3)':` + // Gradual zoom from 1.0 to 1.3
        `x='iw/2-(iw/zoom/2)':` + // Center X
        `y='ih/2-(ih/zoom/2)+sin(on/30)*20':` + // Subtle vertical pan
        `d=${frames}:` + // Duration in frames
        `s=1080x1920:` + // Output size (vertical)
        `fps=30`; // Frame rate

      filter += `[v${i}]`;

      filterParts.push(filter);
    }

    // Add fade transitions between scenes
    if (imageFiles.length === 1) {
      // Single scene: just use as-is
      filterParts.push(`[v0]copy[outv]`);
    } else {
      // Multiple scenes: add crossfade transitions
      // First scene
      filterParts.push(`[v0][v1]xfade=transition=fade:duration=0.5:offset=${scenes[0].endTime - 0.5}[vf0]`);

      // Middle scenes
      for (let i = 1; i < imageFiles.length - 1; i++) {
        const offset = scenes[i].endTime - 0.5;
        filterParts.push(`[vf${i-1}][v${i+1}]xfade=transition=fade:duration=0.5:offset=${offset}[vf${i}]`);
      }

      // Output the final faded video
      const lastIndex = imageFiles.length - 2;
      filterParts.push(`[vf${lastIndex}]copy[outv]`);
    }

    const filterComplex = filterParts.join(";");

    // Generate FFmpeg command
    const ffmpegArgs = [
      "-y", // Overwrite output file
      ...inputArgs,
      "-filter_complex", filterComplex,
      "-map", "[outv]",
      "-map", `${imageFiles.length}:a`, // Map audio (last input)
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "23",
      "-c:a", "aac",
      "-b:a", "128k",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-shortest", // End when shortest stream ends
      outputFile
    ];

    console.log(`  Executing FFmpeg with Ken Burns effect and transitions...`);
    console.log(`  Filter: ${filterComplex.substring(0, 200)}...`); // Log first 200 chars of filter

    const command = new Deno.Command("ffmpeg", {
      args: ffmpegArgs,
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await command.output();

    if (code !== 0) {
      const errorMsg = new TextDecoder().decode(stderr);
      console.error(`FFmpeg error: ${errorMsg}`);
      throw new Error(`FFmpeg failed with code ${code}`);
    }

    console.log(`✅ Video assembled: ${scenes[scenes.length - 1].endTime}s`);

    // Move output file to uploads directory
    const uploadsDir = "./uploads";
    await Deno.mkdir(uploadsDir, { recursive: true });

    const finalPath = `${uploadsDir}/video_${Date.now()}.mp4`;
    await Deno.rename(outputFile, finalPath);

    // Get file size
    const stat = await Deno.stat(finalPath);
    const fileSizeMB = (stat.size / (1024 * 1024)).toFixed(2);
    console.log(`✅ Video assembled: ${scenes[scenes.length - 1].endTime}s, ${fileSizeMB}MB`);

    // Clean up temp directory
    await Deno.remove(tempDir, { recursive: true });

    return {
      videoUrl: finalPath,
      duration: scenes[scenes.length - 1].endTime,
      fileSize: stat.size,
      format: "mp4",
      resolution: "1080x1920",
    };
  } catch (error) {
    // Clean up on error
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch (_) {
      // Ignore cleanup errors
    }
    throw error;
  }
}

// ============================================================================
// Main Video Assembly Function
// ============================================================================

/**
 * Assemble final video from scenes and assets
 *
 * This orchestrates the complete video assembly process:
 * 1. Generate TTS audio
 * 2. Generate subtitles
 * 3. Assemble video with FFmpeg
 * 4. Calculate total cost
 *
 * @param input - Video assembler input
 * @returns Video output with URLs and metadata
 */
export async function assembleVideo(
  input: VideoAssemblerInput,
): Promise<VideoAssemblerOutput> {
  // Validate input
  const validatedInput = VideoAssemblerInputSchema.parse(input);

  console.log(
    `🎥 Assembling video ${validatedInput.videoId} (${validatedInput.language}, ${validatedInput.duration}s)...`,
  );

  // Step 1: Generate TTS audio
  console.log(`\n1️⃣ Generating TTS audio...`);
  const fullNarration = validatedInput.scenes
    .map((s) => s.narration)
    .join(" ");

  const ttsResult = await generateTTS(fullNarration, validatedInput.language);
  console.log(`✅ TTS generated: ${ttsResult.duration}s, cost=$${ttsResult.cost.toFixed(4)}`);

  // Step 2: Generate subtitles
  console.log(`\n2️⃣ Generating subtitles...`);
  const srtContent = generateSubtitles(validatedInput.scenes);

  // Save subtitles to file
  const uploadsDir = "./uploads";
  await Deno.mkdir(uploadsDir, { recursive: true });
  const subtitlesPath = `${uploadsDir}/subtitles_${Date.now()}.srt`;
  await Deno.writeTextFile(subtitlesPath, srtContent);

  console.log(`✅ Subtitles generated (${srtContent.length} chars)`);

  // Step 3: Assemble video with FFmpeg
  console.log(`\n3️⃣ Assembling video with FFmpeg...`);
  const videoResult = await assembleVideoWithFFmpeg(
    validatedInput.scenes,
    ttsResult.audioUrl,
    subtitlesPath,
  );
  console.log(`✅ Video assembled: ${videoResult.duration}s, ${(videoResult.fileSize / 1024 / 1024).toFixed(2)}MB`);

  // Step 4: Calculate total cost
  const totalCost = ttsResult.cost; // FFmpeg is free
  console.log(`\n💰 Total cost: $${totalCost.toFixed(4)}`);

  return {
    videoUrl: videoResult.videoUrl,
    audioUrl: ttsResult.audioUrl,
    subtitlesUrl: subtitlesPath,
    duration: videoResult.duration,
    fileSize: videoResult.fileSize,
    cost: totalCost,
    format: videoResult.format,
    resolution: videoResult.resolution,
  };
}

// ============================================================================
// Cost Estimation
// ============================================================================

/**
 * Estimate cost for video assembly
 *
 * @param characterCount - Total narration character count
 * @returns Estimated cost in USD
 */
export function estimateAssemblyCost(characterCount: number): number {
  // TTS cost: ~$0.15 per 1000 characters (ElevenLabs)
  const ttsCost = (characterCount / 1000) * 0.15;

  // FFmpeg: Free (local processing)
  const ffmpegCost = 0;

  return ttsCost + ffmpegCost;
}

// ============================================================================
// Export
// ============================================================================

export default {
  assembleVideo,
  estimateAssemblyCost,
  generateSubtitles,
  VideoAssemblerInputSchema,
  VideoAssemblerOutputSchema,
  VideoSceneSchema,
};
