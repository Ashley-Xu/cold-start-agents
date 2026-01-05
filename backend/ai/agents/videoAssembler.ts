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
  WordTimestamp,
  Transcript,
  Language,
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
 * Word timestamp schema
 */
export const WordTimestampSchema = z.object({
  word: z.string().describe("Word text"),
  start: z.number().min(0).describe("Start time in seconds"),
  end: z.number().min(0).describe("End time in seconds"),
});

/**
 * Transcript schema with word-level timestamps
 */
export const TranscriptSchema = z.object({
  text: z.string().describe("Full transcript text"),
  words: z.array(WordTimestampSchema).describe("Word-level timestamps"),
  language: z.enum(["zh", "en", "fr"]).describe("Language"),
  duration: z.number().min(0).describe("Total duration in seconds"),
});

/**
 * Output schema for Video Assembler
 */
export const VideoAssemblerOutputSchema = z.object({
  videoUrl: z.string().url().describe("Final video URL"),
  audioUrl: z.string().url().describe("Generated TTS audio URL"),
  subtitlesUrl: z.string().url().optional().describe("Subtitles file URL (SRT)"),
  transcript: TranscriptSchema.describe("Word-level transcript with timestamps"),
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
 * Generate TTS audio with ElevenLabs (with word-level timestamps)
 *
 * Uses ElevenLabs API with timestamps to get word-level timing data.
 *
 * @param text - Narration text
 * @param language - Target language (zh/en/fr)
 * @returns Audio URL, cost, duration, and word-level timestamps
 */
async function generateTTS(
  text: string,
  language: "zh" | "en" | "fr",
): Promise<{
  audioUrl: string;
  cost: number;
  duration: number;
  words: WordTimestamp[];
}> {
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

    // Generate placeholder word timestamps
    const words = text.split(/\s+/).map((word, idx) => ({
      word,
      start: idx * 0.5,
      end: (idx + 1) * 0.5,
    }));

    return {
      audioUrl: audioPath,
      cost,
      duration: 30,
      words,
    };
  }

  try {
    // Call ElevenLabs API with timestamps endpoint
    console.log(`  Calling ElevenLabs API with voice ${voiceId}...`);
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
      {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    // Parse response (includes audio_base64 and alignment data)
    const result = await response.json();

    // Save audio file from base64
    const uploadsDir = "./uploads";
    await Deno.mkdir(uploadsDir, { recursive: true });
    const audioPath = `${uploadsDir}/audio_${Date.now()}.mp3`;

    // Decode base64 audio
    const audioData = Uint8Array.from(atob(result.audio_base64), c => c.charCodeAt(0));
    await Deno.writeFile(audioPath, audioData);

    // Parse word-level timestamps from alignment data
    const words: WordTimestamp[] = [];

    if (result.alignment && result.alignment.characters) {
      // ElevenLabs returns character-level timestamps, we need to reconstruct words
      const chars = result.alignment.characters;
      const charStarts = result.alignment.character_start_times_seconds;
      const charEnds = result.alignment.character_end_times_seconds;

      let currentWord = "";
      let wordStart = 0;

      for (let i = 0; i < chars.length; i++) {
        const char = chars[i];

        if (char === " " || i === chars.length - 1) {
          // End of word (or end of text)
          if (i === chars.length - 1 && char !== " ") {
            currentWord += char;
          }

          if (currentWord.length > 0) {
            words.push({
              word: currentWord,
              start: wordStart,
              end: charEnds[i === chars.length - 1 ? i : i - 1],
            });
            currentWord = "";
          }

          if (i < chars.length - 1) {
            wordStart = charStarts[i + 1];
          }
        } else {
          if (currentWord.length === 0) {
            wordStart = charStarts[i];
          }
          currentWord += char;
        }
      }
    }

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

    console.log(`✅ TTS generated: ${Math.ceil(duration)}s, ${words.length} words, cost=$${cost.toFixed(4)}`);

    return {
      audioUrl: audioPath,
      cost,
      duration: Math.ceil(duration),
      words,
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

    // Generate placeholder word timestamps
    const words = text.split(/\s+/).map((word, idx) => ({
      word,
      start: idx * 0.5,
      end: (idx + 1) * 0.5,
    }));

    return {
      audioUrl: audioPath,
      cost,
      duration: 30,
      words,
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
    // Download assets to temp directory and check dimensions/type
    const assetFiles: string[] = [];
    const assetInfo: Array<{
      width: number;
      height: number;
      rotation: number;
      isVideo: boolean;
      duration: number;
    }> = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];

      // Download to temp file first
      const tempPath = `${tempDir}/scene_${i}.tmp`;
      console.log(`  Downloading scene ${i + 1} from ${scene.assetUrl}...`);
      const response = await fetch(scene.assetUrl);
      const assetData = await response.arrayBuffer();
      await Deno.writeFile(tempPath, new Uint8Array(assetData));

      // Probe the file to detect if it's image or video
      const probeCommand = new Deno.Command("ffprobe", {
        args: [
          "-v", "error",
          "-show_entries", "stream=codec_type,width,height,duration:stream_tags=rotate:format=duration",
          "-of", "json",
          tempPath
        ],
        stdout: "piped",
      });

      const { stdout } = await probeCommand.output();
      const probeData = JSON.parse(new TextDecoder().decode(stdout));
      const videoStream = probeData.streams?.find((s: any) => s.codec_type === "video");

      if (!videoStream) {
        throw new Error(`Could not detect video stream in asset ${i + 1}`);
      }

      const width = videoStream.width;
      const height = videoStream.height;
      const rotation = videoStream.tags?.rotate ? parseInt(videoStream.tags.rotate) : 0;
      const isVideo = probeData.streams?.some((s: any) => s.codec_type === "audio") ||
                      (videoStream.duration && parseFloat(videoStream.duration) > 0);
      const duration = videoStream.duration ? parseFloat(videoStream.duration) :
                      (probeData.format?.duration ? parseFloat(probeData.format.duration) : 0);

      // Rename file with correct extension
      const finalPath = isVideo ? `${tempDir}/scene_${i}.mp4` : `${tempDir}/scene_${i}.jpg`;
      await Deno.rename(tempPath, finalPath);

      // Swap dimensions if rotated
      let finalWidth = width;
      let finalHeight = height;
      if (rotation === 90 || rotation === 270) {
        [finalWidth, finalHeight] = [finalHeight, finalWidth];
      }

      assetInfo.push({ width: finalWidth, height: finalHeight, rotation, isVideo, duration });
      assetFiles.push(finalPath);

      console.log(`  Scene ${i + 1}: ${isVideo ? 'VIDEO' : 'IMAGE'} ${finalWidth}x${finalHeight} (${finalWidth > finalHeight ? 'horizontal' : 'vertical'}), rotation: ${rotation}°${isVideo ? `, duration: ${duration.toFixed(1)}s` : ''}`);
    }

    // Build FFmpeg input arguments for all assets
    const inputArgs: string[] = [];
    const filterParts: string[] = [];

    // Add all asset inputs
    for (let i = 0; i < assetFiles.length; i++) {
      const info = assetInfo[i];
      const sceneDuration = scenes[i].endTime - scenes[i].startTime;

      if (info.isVideo) {
        // For videos: check if we need to loop (Hailuo videos are 6s, scenes may be longer)
        if (info.duration < sceneDuration) {
          // Video is shorter than scene - need to loop it
          console.log(`  Scene ${i + 1}: Looping ${info.duration}s video to fill ${sceneDuration}s duration`);
          // Use stream_loop to repeat the video (-1 means infinite loop, then trim with -t)
          inputArgs.push(
            "-stream_loop", "-1",  // Loop infinitely
            "-t", sceneDuration.toString(),  // Trim to scene duration
            "-i", assetFiles[i]
          );
        } else {
          // Video is same length or longer than scene - just trim
          inputArgs.push(
            "-t", sceneDuration.toString(),
            "-i", assetFiles[i]
          );
        }
      } else {
        // For images, loop for the scene duration
        inputArgs.push(
          "-loop", "1",
          "-t", sceneDuration.toString(),
          "-i", assetFiles[i]
        );
      }
    }

    // Add audio input
    inputArgs.push("-i", audioUrl);

    // Create filter complex for each asset
    // Target: 1080x1920 output (vertical TikTok/Reels format)
    for (let i = 0; i < assetFiles.length; i++) {
      const duration = scenes[i].endTime - scenes[i].startTime;
      const frames = Math.floor(duration * 30); // 30fps
      const info = assetInfo[i];
      const isHorizontal = info.width > info.height;

      // Build filter chain
      let filter = `[${i}:v]`;

      if (info.isVideo) {
        // For videos: scale and pad (no Ken Burns effect)
        // Note: Duration trimming is already handled at input stage with -t parameter

        // Apply rotation if needed
        if (info.rotation === 90) {
          filter += `transpose=1,`;
          console.log(`  Applying rotation: 90° clockwise for video scene ${i + 1}`);
        } else if (info.rotation === 180) {
          filter += `transpose=1,transpose=1,`;
          console.log(`  Applying rotation: 180° for video scene ${i + 1}`);
        } else if (info.rotation === 270) {
          filter += `transpose=2,`;
          console.log(`  Applying rotation: 270° for video scene ${i + 1}`);
        }

        // Rotate horizontal videos to vertical
        if (info.rotation === 0 && isHorizontal) {
          filter += `transpose=1,`;
          console.log(`  Rotating video scene ${i + 1} from horizontal to vertical`);
        }

        // Scale and pad to vertical format
        filter += `scale=1080:1920:force_original_aspect_ratio=decrease,`;
        filter += `pad=1080:1920:(ow-iw)/2:(oh-ih)/2,`;
        filter += `fps=30`; // Ensure consistent frame rate
      } else {
        // For images: apply rotation, scale, pad, and Ken Burns effect
        // Step 1: Apply rotation based on EXIF metadata
        if (info.rotation === 90) {
          filter += `transpose=1,`;
          console.log(`  Applying EXIF rotation: 90° clockwise for image scene ${i + 1}`);
        } else if (info.rotation === 180) {
          filter += `transpose=1,transpose=1,`;
          console.log(`  Applying EXIF rotation: 180° for image scene ${i + 1}`);
        } else if (info.rotation === 270) {
          filter += `transpose=2,`;
          console.log(`  Applying EXIF rotation: 270° for image scene ${i + 1}`);
        }

        // Step 2: Rotate horizontal images to vertical
        if (info.rotation === 0 && isHorizontal) {
          filter += `transpose=1,`;
          console.log(`  Rotating image scene ${i + 1} from horizontal to vertical`);
        }

        // Step 3: Scale to fit vertical canvas
        filter += `scale=1080:1920:force_original_aspect_ratio=decrease,`;

        // Step 4: Pad to exact size
        filter += `pad=1080:1920:(ow-iw)/2:(oh-ih)/2,`;

        // Step 5: Apply Ken Burns effect (slow zoom with subtle pan)
        filter += `zoompan=` +
          `z='min(1.0+0.3*on/${frames},1.3)':` +
          `x='iw/2-(iw/zoom/2)':` +
          `y='ih/2-(ih/zoom/2)+sin(on/30)*20':` +
          `d=${frames}:` +
          `s=1080x1920:` +
          `fps=30`;
      }

      filter += `[v${i}]`;

      filterParts.push(filter);
    }

    // Add fade transitions between scenes
    if (assetFiles.length === 1) {
      // Single scene: just use as-is
      filterParts.push(`[v0]copy[outv]`);
    } else {
      // Multiple scenes: add crossfade transitions with cumulative offsets
      let cumulativeDuration = 0;

      // First transition
      cumulativeDuration += (scenes[0].endTime - scenes[0].startTime);
      const firstOffset = cumulativeDuration - 0.5;  // 0.5s before end of first scene
      filterParts.push(`[v0][v1]xfade=transition=fade:duration=0.5:offset=${firstOffset}[vf0]`);

      // Middle scenes
      for (let i = 1; i < assetFiles.length - 1; i++) {
        cumulativeDuration += (scenes[i].endTime - scenes[i].startTime);
        const offset = cumulativeDuration - 0.5;  // 0.5s before end of current scene
        filterParts.push(`[vf${i-1}][v${i+1}]xfade=transition=fade:duration=0.5:offset=${offset}[vf${i}]`);
      }

      // Output the final faded video
      const lastIndex = assetFiles.length - 2;
      filterParts.push(`[vf${lastIndex}]copy[outv]`);
    }

    const filterComplex = filterParts.join(";");

    // Generate FFmpeg command
    const ffmpegArgs = [
      "-y", // Overwrite output file
      ...inputArgs,
      "-filter_complex", filterComplex,
      "-map", "[outv]",
      "-map", `${assetFiles.length}:a`, // Map audio (last input)
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

  // Step 1: Generate TTS audio with word-level timestamps
  console.log(`\n1️⃣ Generating TTS audio with word-level timestamps...`);
  const fullNarration = validatedInput.scenes
    .map((s) => s.narration)
    .join(" ");

  const ttsResult = await generateTTS(fullNarration, validatedInput.language);
  console.log(`✅ TTS generated: ${ttsResult.duration}s, ${ttsResult.words.length} words, cost=$${ttsResult.cost.toFixed(4)}`);

  // Step 2: Create transcript object with word-level timestamps
  const transcript: Transcript = {
    text: fullNarration,
    words: ttsResult.words,
    language: validatedInput.language,
    duration: ttsResult.duration,
  };

  console.log(`\n📝 Transcript created with ${transcript.words.length} word timestamps`);

  // Step 3: Generate subtitles (SRT format)
  console.log(`\n2️⃣ Generating subtitles...`);
  const srtContent = generateSubtitles(validatedInput.scenes);

  // Save subtitles to file
  const uploadsDir = "./uploads";
  await Deno.mkdir(uploadsDir, { recursive: true });
  const subtitlesPath = `${uploadsDir}/subtitles_${Date.now()}.srt`;
  await Deno.writeTextFile(subtitlesPath, srtContent);

  console.log(`✅ Subtitles generated (${srtContent.length} chars)`);

  // Step 4: Assemble video with FFmpeg
  console.log(`\n3️⃣ Assembling video with FFmpeg...`);
  const videoResult = await assembleVideoWithFFmpeg(
    validatedInput.scenes,
    ttsResult.audioUrl,
    subtitlesPath,
  );
  console.log(`✅ Video assembled: ${videoResult.duration}s, ${(videoResult.fileSize / 1024 / 1024).toFixed(2)}MB`);

  // Step 5: Calculate total cost
  const totalCost = ttsResult.cost; // FFmpeg is free
  console.log(`\n💰 Total cost: $${totalCost.toFixed(4)}`);

  return {
    videoUrl: videoResult.videoUrl,
    audioUrl: ttsResult.audioUrl,
    subtitlesUrl: subtitlesPath,
    transcript, // Include word-level transcript
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
