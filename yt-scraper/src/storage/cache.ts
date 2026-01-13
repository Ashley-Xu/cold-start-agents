// SQLite Cache for Analyzed Videos
// Avoids re-analyzing the same videos and tracks API quota usage

import { DB } from "db";
import type { CachedVideo, APIUsage, DifficultyResult, TopicResult } from "../lib/types.ts";

export class VideoCache {
  private db: DB;

  constructor(dbPath: string = "./cache/video_cache.db") {
    // Ensure cache directory exists
    try {
      Deno.mkdirSync("./cache", { recursive: true });
    } catch {
      // Directory already exists
    }

    this.db = new DB(dbPath);
    this.initializeSchema();

    console.log(`[Cache] Initialized SQLite cache at ${dbPath}`);
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    this.db.query(`
      CREATE TABLE IF NOT EXISTS videos (
        video_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        channel_id TEXT,
        channel_name TEXT,
        duration_seconds INTEGER,
        view_count INTEGER,
        published_date TEXT,
        language TEXT NOT NULL,
        difficulty_level TEXT,
        difficulty_confidence REAL,
        difficulty_source TEXT,
        topic TEXT,
        transcript_available INTEGER,
        transcript_sample TEXT,
        analyzed_date TEXT NOT NULL,
        ai_reasoning TEXT
      )
    `);

    this.db.query(`
      CREATE TABLE IF NOT EXISTS api_usage (
        date TEXT PRIMARY KEY,
        youtube_quota_used INTEGER DEFAULT 0,
        openai_tokens_used INTEGER DEFAULT 0
      )
    `);

    this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_language_level ON videos(language, difficulty_level)
    `);

    this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_topic ON videos(topic)
    `);
  }

  /**
   * Check if video is already cached
   */
  has(videoId: string): boolean {
    const result = this.db.query(
      "SELECT video_id FROM videos WHERE video_id = ?",
      [videoId]
    );

    return result.length > 0;
  }

  /**
   * Get cached video
   */
  get(videoId: string): CachedVideo | null {
    const result = this.db.query(
      "SELECT * FROM videos WHERE video_id = ?",
      [videoId]
    );

    if (result.length === 0) {
      return null;
    }

    const row = result[0];

    return {
      video_id: row[0] as string,
      title: row[1] as string,
      channel_id: row[2] as string,
      channel_name: row[3] as string,
      duration_seconds: row[4] as number,
      view_count: row[5] as number,
      published_date: row[6] as string,
      language: row[7] as string,
      difficulty_level: row[8] as string | null,
      difficulty_confidence: row[9] as number,
      difficulty_source: row[10] as string,
      topic: row[11] as string,
      transcript_available: row[12] === 1,
      transcript_sample: row[13] as string | null,
      analyzed_date: row[14] as string,
      ai_reasoning: row[15] as string | null,
    };
  }

  /**
   * Save analyzed video to cache
   */
  save(
    videoId: string,
    metadata: {
      title: string;
      channelId: string;
      channelName: string;
      durationSeconds: number;
      viewCount: number;
      publishedAt: string;
    },
    language: string,
    difficulty: DifficultyResult,
    topic: TopicResult,
    transcriptSample: string | null
  ): void {
    this.db.query(
      `INSERT OR REPLACE INTO videos (
        video_id, title, channel_id, channel_name, duration_seconds, view_count,
        published_date, language, difficulty_level, difficulty_confidence,
        difficulty_source, topic, transcript_available, transcript_sample,
        analyzed_date, ai_reasoning
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        videoId,
        metadata.title,
        metadata.channelId,
        metadata.channelName,
        metadata.durationSeconds,
        metadata.viewCount,
        metadata.publishedAt,
        language,
        difficulty.level,
        difficulty.confidence,
        difficulty.source,
        topic.topic,
        transcriptSample ? 1 : 0,
        transcriptSample,
        new Date().toISOString(),
        difficulty.reasoning || null,
      ]
    );

    console.log(`[Cache] Saved video: ${videoId} (${difficulty.level}, ${topic.topic})`);
  }

  /**
   * Track YouTube API quota usage
   */
  addYouTubeQuota(units: number): void {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    this.db.query(
      `INSERT INTO api_usage (date, youtube_quota_used, openai_tokens_used)
       VALUES (?, ?, 0)
       ON CONFLICT(date) DO UPDATE SET youtube_quota_used = youtube_quota_used + ?`,
      [today, units, units]
    );
  }

  /**
   * Track OpenAI token usage
   */
  addOpenAITokens(tokens: number): void {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    this.db.query(
      `INSERT INTO api_usage (date, youtube_quota_used, openai_tokens_used)
       VALUES (?, 0, ?)
       ON CONFLICT(date) DO UPDATE SET openai_tokens_used = openai_tokens_used + ?`,
      [today, tokens, tokens]
    );
  }

  /**
   * Get API usage for today
   */
  getUsageToday(): APIUsage {
    const today = new Date().toISOString().split("T")[0];

    const result = this.db.query(
      "SELECT * FROM api_usage WHERE date = ?",
      [today]
    );

    if (result.length === 0) {
      return {
        date: today,
        youtube_quota_used: 0,
        openai_tokens_used: 0,
      };
    }

    const row = result[0];

    return {
      date: row[0] as string,
      youtube_quota_used: row[1] as number,
      openai_tokens_used: row[2] as number,
    };
  }

  /**
   * Get all cached videos for a language/level/topic combination
   */
  query(filters: {
    language?: string;
    difficulty_level?: string;
    topic?: string;
  }): CachedVideo[] {
    const conditions: string[] = [];
    const params: (string | null)[] = [];

    if (filters.language) {
      conditions.push("language = ?");
      params.push(filters.language);
    }

    if (filters.difficulty_level) {
      conditions.push("difficulty_level = ?");
      params.push(filters.difficulty_level);
    }

    if (filters.topic) {
      conditions.push("topic = ?");
      params.push(filters.topic);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = this.db.query(
      `SELECT * FROM videos ${whereClause}`,
      params
    );

    return result.map((row) => ({
      video_id: row[0] as string,
      title: row[1] as string,
      channel_id: row[2] as string,
      channel_name: row[3] as string,
      duration_seconds: row[4] as number,
      view_count: row[5] as number,
      published_date: row[6] as string,
      language: row[7] as string,
      difficulty_level: row[8] as string | null,
      difficulty_confidence: row[9] as number,
      difficulty_source: row[10] as string,
      topic: row[11] as string,
      transcript_available: row[12] === 1,
      transcript_sample: row[13] as string | null,
      analyzed_date: row[14] as string,
      ai_reasoning: row[15] as string | null,
    }));
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    console.log("[Cache] Closed database connection");
  }
}
