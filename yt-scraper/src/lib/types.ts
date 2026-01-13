// YouTube API Types
export interface VideoSearchResult {
  videoId: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string;
}

export interface VideoMetadata {
  videoId: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  durationSeconds: number;
  viewCount: number;
  publishedAt: string;
  thumbnailUrl: string;
  tags?: string[];
}

// Difficulty Analysis Types
export type Language = "chinese" | "french" | "japanese";

export type DifficultyLevel =
  // Chinese HSK levels
  | "HSK1"
  | "HSK2"
  | "HSK3"
  | "HSK4"
  | "HSK5"
  | "HSK6"
  // French CEFR levels
  | "A1"
  | "A2"
  | "B1"
  | "B2"
  | "C1"
  | "C2"
  // Japanese JLPT levels
  | "N5"
  | "N4"
  | "N3"
  | "N2"
  | "N1";

export interface DifficultyResult {
  level: DifficultyLevel | null;
  confidence: number; // 0.0 to 1.0
  source: "metadata" | "ai" | "unknown";
  reasoning?: string; // AI explanation (if applicable)
}

// Topic Classification Types
export type TopicId =
  | "cooking"
  | "grwm"
  | "sports"
  | "mukbang"
  | "vlog"
  | "travel"
  | "education"
  | "entertainment"
  | "other";

export interface TopicResult {
  topic: TopicId;
  confidence: number; // 0.0 to 1.0
  source: "metadata" | "ai";
}

export interface Topic {
  id: TopicId;
  keywords: string[];
  emoji: string;
}

// Transcript Types
export interface TranscriptSegment {
  text: string;
  duration: number;
  offset: number;
}

// Config Types
export interface DifficultyPattern {
  patterns: string[]; // Regex patterns
  vocabulary_hints?: string[];
}

export interface DifficultyConfig {
  chinese: Record<string, DifficultyPattern>;
  french: Record<string, DifficultyPattern>;
  japanese: Record<string, DifficultyPattern>;
}

export interface TopicConfig {
  topics: Topic[];
}

// Duration Filter Types
export type DurationFilter =
  | "shorts" // YouTube Shorts (< 60 seconds)
  | "short" // < 4 minutes
  | "medium" // 4-20 minutes
  | "long" // > 20 minutes
  | { min: number; max: number }; // Custom range in minutes

// CLI Types
export interface CLIArgs {
  language?: Language;
  level?: DifficultyLevel;
  topic?: TopicId;
  maxResults?: number;
  output?: string;
  duration?: DurationFilter;
  aiOnly?: boolean;
  noCache?: boolean;
  quotaCheck?: boolean;
  help?: boolean;
  version?: boolean;
}

// Database Types
export interface CachedVideo {
  video_id: string;
  title: string;
  channel_id: string;
  channel_name: string;
  duration_seconds: number;
  view_count: number;
  published_date: string;
  language: Language;
  difficulty_level: DifficultyLevel | null;
  difficulty_confidence: number;
  difficulty_source: "metadata" | "ai" | "unknown";
  topic: TopicId;
  transcript_available: boolean;
  transcript_sample: string | null;
  analyzed_date: string;
  ai_reasoning: string | null;
}

export interface APIUsage {
  date: string;
  youtube_quota_used: number;
  openai_tokens_used: number;
}

// CSV Export Types
export interface VideoCSVRow {
  video_id: string;
  title: string;
  url: string;
  channel_name: string;
  channel_url: string;
  duration_seconds: number;
  view_count: number;
  published_date: string;
  language: Language;
  difficulty_level: DifficultyLevel | null;
  difficulty_confidence: number;
  difficulty_source: "metadata" | "ai" | "unknown";
  topic: TopicId;
  transcript_available: boolean;
  transcript_sample: string;
  analyzed_date: string;
}

// AI Response Types (Zod schemas will be defined in ai_analyzer.ts)
export interface AIAnalysisResult {
  level: DifficultyLevel;
  confidence: number;
  reasoning: string;
}
