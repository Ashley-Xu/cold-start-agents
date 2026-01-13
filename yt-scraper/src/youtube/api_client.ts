// YouTube Data API v3 Client
// Official API for searching videos and fetching metadata

import type { VideoSearchResult, VideoMetadata } from "../lib/types.ts";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const RATE_LIMIT_DELAY_MS = 100; // 100ms delay between requests

export class YouTubeClient {
  private apiKey: string;
  private quotaUsed: number = 0;
  private readonly QUOTA_LIMIT = 10000;
  private readonly QUOTA_WARNING_THRESHOLD = 0.8; // Warn at 80%

  constructor(apiKey: string) {
    if (!apiKey || apiKey === "your_youtube_api_key_here") {
      throw new Error(
        "YouTube API key not configured. Please set YOUTUBE_API_KEY in .env file"
      );
    }
    this.apiKey = apiKey;
  }

  /**
   * Search for videos matching a query
   * Cost: 100 quota units per request
   */
  async searchVideos(
    query: string,
    maxResults: number = 50,
    options?: {
      relevanceLanguage?: string; // e.g., "zh" for Chinese, "fr" for French, "ja" for Japanese
      videoDuration?: "short" | "medium" | "long"; // short: <4min, medium: 4-20min, long: >20min
      order?: "relevance" | "viewCount" | "date";
    }
  ): Promise<VideoSearchResult[]> {
    // Check quota before making request
    this.checkQuota(100);

    const params = new URLSearchParams({
      key: this.apiKey,
      part: "snippet",
      type: "video",
      q: query,
      maxResults: Math.min(maxResults, 50).toString(), // YouTube API max is 50 per request
      ...(options?.relevanceLanguage && { relevanceLanguage: options.relevanceLanguage }),
      ...(options?.videoDuration && { videoDuration: options.videoDuration }),
      order: options?.order || "relevance",
    });

    const url = `${YOUTUBE_API_BASE}/search?${params}`;

    console.log(`[YouTube API] Searching: "${query}" (max: ${maxResults} results)`);

    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`YouTube API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();

    // Update quota usage (search costs 100 units)
    this.quotaUsed += 100;
    this.warnIfQuotaHigh();

    // Rate limiting
    await this.delay(RATE_LIMIT_DELAY_MS);

    // Transform response to our VideoSearchResult format
    const results: VideoSearchResult[] = (data.items || []).map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      channelId: item.snippet.channelId,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      thumbnailUrl: item.snippet.thumbnails?.medium?.url || "",
    }));

    console.log(`[YouTube API] Found ${results.length} videos`);

    return results;
  }

  /**
   * Get detailed metadata for videos (batch request)
   * Cost: 1 quota unit per video
   *
   * @param customDurationFilter - Optional filter to exclude videos outside duration range (in minutes)
   */
  async getVideoDetails(
    videoIds: string[],
    customDurationFilter?: { min: number; max: number }
  ): Promise<VideoMetadata[]> {
    if (videoIds.length === 0) return [];

    // YouTube API allows up to 50 IDs per request
    const batchSize = 50;
    const allMetadata: VideoMetadata[] = [];

    for (let i = 0; i < videoIds.length; i += batchSize) {
      const batch = videoIds.slice(i, i + batchSize);

      // Check quota (1 unit per video in batch)
      this.checkQuota(batch.length);

      const params = new URLSearchParams({
        key: this.apiKey,
        part: "snippet,contentDetails,statistics",
        id: batch.join(","),
      });

      const url = `${YOUTUBE_API_BASE}/videos?${params}`;

      console.log(`[YouTube API] Fetching details for ${batch.length} videos...`);

      const response = await fetch(url);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`YouTube API error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();

      // Update quota usage (1 unit per video)
      this.quotaUsed += batch.length;
      this.warnIfQuotaHigh();

      // Rate limiting
      await this.delay(RATE_LIMIT_DELAY_MS);

      // Transform response to our VideoMetadata format
      let metadata: VideoMetadata[] = (data.items || []).map((item: any) => ({
        videoId: item.id,
        title: item.snippet.title,
        description: item.snippet.description,
        channelId: item.snippet.channelId,
        channelTitle: item.snippet.channelTitle,
        durationSeconds: this.parseDuration(item.contentDetails.duration),
        viewCount: parseInt(item.statistics.viewCount || "0", 10),
        publishedAt: item.snippet.publishedAt,
        thumbnailUrl: item.snippet.thumbnails?.medium?.url || "",
        tags: item.snippet.tags || [],
      }));

      // Apply custom duration filter if specified
      if (customDurationFilter) {
        const minSeconds = customDurationFilter.min * 60;
        const maxSeconds = customDurationFilter.max * 60;

        metadata = metadata.filter(
          (video) =>
            video.durationSeconds >= minSeconds && video.durationSeconds <= maxSeconds
        );

        console.log(
          `[YouTube API] Filtered to ${metadata.length} videos within ${customDurationFilter.min}-${customDurationFilter.max} minutes`
        );
      }

      allMetadata.push(...metadata);
    }

    console.log(`[YouTube API] Retrieved metadata for ${allMetadata.length} videos`);

    return allMetadata;
  }

  /**
   * Get current quota usage
   */
  getQuotaUsage(): { used: number; limit: number; remaining: number; percentage: number } {
    return {
      used: this.quotaUsed,
      limit: this.QUOTA_LIMIT,
      remaining: this.QUOTA_LIMIT - this.quotaUsed,
      percentage: (this.quotaUsed / this.QUOTA_LIMIT) * 100,
    };
  }

  /**
   * Reset quota counter (call this at midnight UTC)
   */
  resetQuota(): void {
    this.quotaUsed = 0;
    console.log("[YouTube API] Quota reset to 0");
  }

  /**
   * Parse ISO 8601 duration to seconds
   * Example: "PT15M51S" → 951 seconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || "0", 10);
    const minutes = parseInt(match[2] || "0", 10);
    const seconds = parseInt(match[3] || "0", 10);

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Check if quota limit would be exceeded
   */
  private checkQuota(cost: number): void {
    if (this.quotaUsed + cost > this.QUOTA_LIMIT) {
      throw new Error(
        `YouTube API quota would be exceeded! ` +
          `Current: ${this.quotaUsed}, Cost: ${cost}, Limit: ${this.QUOTA_LIMIT}. ` +
          `Wait 24 hours for quota to reset.`
      );
    }
  }

  /**
   * Warn if quota usage is high
   */
  private warnIfQuotaHigh(): void {
    const percentage = this.quotaUsed / this.QUOTA_LIMIT;
    if (percentage >= this.QUOTA_WARNING_THRESHOLD && percentage < 1) {
      console.warn(
        `⚠️  [YouTube API] Quota usage: ${(percentage * 100).toFixed(1)}% ` +
          `(${this.quotaUsed}/${this.QUOTA_LIMIT} units)`
      );
    }
  }

  /**
   * Delay for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
