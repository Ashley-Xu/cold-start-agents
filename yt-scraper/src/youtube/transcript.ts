// Transcript Fetcher using unofficial API
// Fetches YouTube video transcripts/captions without OAuth requirements

import { YoutubeTranscript } from "youtube-transcript";
import type { Language, TranscriptSegment } from "../lib/types.ts";

const TRANSCRIPT_MINUTES_DEFAULT = 5; // Extract first 5 minutes by default

export class TranscriptFetcher {
  private transcriptMinutes: number;

  constructor(transcriptMinutes?: number) {
    this.transcriptMinutes = transcriptMinutes || TRANSCRIPT_MINUTES_DEFAULT;
  }

  /**
   * Fetch transcript for a video in the specified language
   * Returns null if transcript is unavailable
   */
  async getTranscript(
    videoId: string,
    language: Language
  ): Promise<string | null> {
    try {
      const languageCode = this.getLanguageCode(language);

      console.log(`[Transcript] Fetching transcript for video: ${videoId} (language: ${languageCode})`);

      // Fetch transcript (tries auto-generated if manual not available)
      const transcriptData = await YoutubeTranscript.fetchTranscript(videoId, {
        lang: languageCode,
      });

      if (!transcriptData || transcriptData.length === 0) {
        console.log(`[Transcript] No transcript found for video: ${videoId}`);
        return null;
      }

      // Extract first N minutes
      const sample = this.extractSample(
        transcriptData as TranscriptSegment[],
        this.transcriptMinutes
      );

      console.log(`[Transcript] Extracted ${sample.length} characters from ${videoId}`);

      return sample;
    } catch (error) {
      console.warn(`[Transcript] Failed to fetch transcript for ${videoId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract first N minutes of transcript
   */
  extractSample(
    transcript: TranscriptSegment[],
    minutes: number
  ): string {
    const maxDurationMs = minutes * 60 * 1000; // Convert minutes to milliseconds
    const segments: string[] = [];
    let totalDuration = 0;

    for (const segment of transcript) {
      if (totalDuration >= maxDurationMs) {
        break;
      }

      segments.push(segment.text);
      totalDuration += segment.duration;
    }

    return segments.join(" ");
  }

  /**
   * Get language code for transcript API
   */
  private getLanguageCode(language: Language): string {
    const codes: Record<Language, string> = {
      chinese: "zh", // Simplified Chinese (zh-Hans also works)
      french: "fr",
      japanese: "ja",
    };
    return codes[language];
  }

  /**
   * Check if transcript is available (without fetching full transcript)
   * Returns true if any transcript is available
   */
  async isAvailable(videoId: string): Promise<boolean> {
    try {
      const transcripts = await YoutubeTranscript.fetchTranscript(videoId);
      return transcripts && transcripts.length > 0;
    } catch {
      return false;
    }
  }
}
