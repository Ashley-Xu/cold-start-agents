// Search Query Builder for YouTube
// Constructs optimized search queries for different languages, difficulty levels, and topics

import type { Language, DifficultyLevel, TopicId, DurationFilter } from "../lib/types.ts";

export interface SearchQuery {
  query: string;
  relevanceLanguage: string; // ISO 639-1 language code for YouTube API
  videoDuration: "short" | "medium" | "long";
  customDurationFilter?: { min: number; max: number }; // For custom ranges and YouTube Shorts
}

/**
 * Build search query for YouTube based on language, difficulty, topic, and duration
 */
export function buildSearchQuery(
  language: Language,
  level?: DifficultyLevel,
  topic?: TopicId,
  duration?: DurationFilter
): SearchQuery {
  const languageCode = getLanguageCode(language);
  let query = "";

  // Construct query based on language + difficulty + topic
  if (language === "chinese") {
    query = buildChineseQuery(level, topic);
  } else if (language === "french") {
    query = buildFrenchQuery(level, topic);
  } else if (language === "japanese") {
    query = buildJapaneseQuery(level, topic);
  } else {
    throw new Error(`Unsupported language: ${language}`);
  }

  // Parse duration filter
  let videoDuration: "short" | "medium" | "long" = "medium"; // Default
  let customDurationFilter: { min: number; max: number } | undefined;

  if (duration) {
    if (duration === "shorts") {
      // YouTube Shorts: < 60 seconds
      videoDuration = "short"; // Use API's "short" filter first
      customDurationFilter = { min: 0, max: 1 }; // Then filter to < 1 minute
    } else if (duration === "short") {
      videoDuration = "short"; // < 4 minutes
    } else if (duration === "medium") {
      videoDuration = "medium"; // 4-20 minutes
    } else if (duration === "long") {
      videoDuration = "long"; // > 20 minutes
    } else {
      // Custom range (e.g., { min: 5, max: 10 })
      customDurationFilter = duration;

      // Choose best YouTube API duration filter based on range
      if (duration.max <= 4) {
        videoDuration = "short";
      } else if (duration.min >= 20) {
        videoDuration = "long";
      } else {
        videoDuration = "medium";
      }
    }
  }

  return {
    query,
    relevanceLanguage: languageCode,
    videoDuration,
    customDurationFilter,
  };
}

/**
 * Build Chinese search query
 */
function buildChineseQuery(level?: DifficultyLevel, topic?: TopicId): string {
  const parts: string[] = [];

  // Add difficulty level
  if (level) {
    if (level === "HSK1") {
      parts.push("HSK1 中文");
    } else if (level === "HSK2") {
      parts.push("HSK2 中文");
    } else if (level === "HSK3") {
      parts.push("HSK3 中文");
    } else if (level === "HSK4") {
      parts.push("HSK4 中文");
    } else if (level === "HSK5") {
      parts.push("HSK5 中文");
    } else if (level === "HSK6") {
      parts.push("HSK6 中文");
    }
  } else {
    parts.push("中文"); // Generic Chinese
  }

  // Add topic
  if (topic) {
    const topicTerm = getChineseTopic(topic);
    if (topicTerm) {
      parts.push(topicTerm);
    }
  }

  return parts.join(" ");
}

/**
 * Build French search query
 */
function buildFrenchQuery(level?: DifficultyLevel, topic?: TopicId): string {
  const parts: string[] = [];

  // Add difficulty level
  if (level) {
    if (level === "A1") {
      parts.push("français A1");
    } else if (level === "A2") {
      parts.push("français A2");
    } else if (level === "B1") {
      parts.push("français B1");
    } else if (level === "B2") {
      parts.push("français B2");
    } else if (level === "C1") {
      parts.push("français C1");
    } else if (level === "C2") {
      parts.push("français C2");
    }
  } else {
    parts.push("français"); // Generic French
  }

  // Add topic
  if (topic) {
    const topicTerm = getFrenchTopic(topic);
    if (topicTerm) {
      parts.push(topicTerm);
    }
  }

  return parts.join(" ");
}

/**
 * Build Japanese search query
 */
function buildJapaneseQuery(level?: DifficultyLevel, topic?: TopicId): string {
  const parts: string[] = [];

  // Add difficulty level
  if (level) {
    if (level === "N5") {
      parts.push("JLPT N5 日本語");
    } else if (level === "N4") {
      parts.push("JLPT N4 日本語");
    } else if (level === "N3") {
      parts.push("JLPT N3 日本語");
    } else if (level === "N2") {
      parts.push("JLPT N2 日本語");
    } else if (level === "N1") {
      parts.push("JLPT N1 日本語");
    }
  } else {
    parts.push("日本語"); // Generic Japanese
  }

  // Add topic
  if (topic) {
    const topicTerm = getJapaneseTopic(topic);
    if (topicTerm) {
      parts.push(topicTerm);
    }
  }

  return parts.join(" ");
}

/**
 * Get ISO 639-1 language code for YouTube API
 */
function getLanguageCode(language: Language): string {
  const codes: Record<Language, string> = {
    chinese: "zh",
    french: "fr",
    japanese: "ja",
  };
  return codes[language];
}

/**
 * Get Chinese topic term
 */
function getChineseTopic(topic: TopicId): string | null {
  const topics: Record<TopicId, string> = {
    cooking: "美食",
    grwm: "化妆",
    sports: "运动",
    mukbang: "吃播",
    vlog: "日常",
    travel: "旅行",
    education: "教学",
    entertainment: "娱乐",
    other: "",
  };
  return topics[topic] || null;
}

/**
 * Get French topic term
 */
function getFrenchTopic(topic: TopicId): string | null {
  const topics: Record<TopicId, string> = {
    cooking: "cuisine",
    grwm: "maquillage",
    sports: "sport",
    mukbang: "mukbang",
    vlog: "quotidien",
    travel: "voyage",
    education: "cours",
    entertainment: "divertissement",
    other: "",
  };
  return topics[topic] || null;
}

/**
 * Get Japanese topic term
 */
function getJapaneseTopic(topic: TopicId): string | null {
  const topics: Record<TopicId, string> = {
    cooking: "料理",
    grwm: "メイク",
    sports: "スポーツ",
    mukbang: "モッパン",
    vlog: "日常",
    travel: "旅行",
    education: "レッスン",
    entertainment: "エンタメ",
    other: "",
  };
  return topics[topic] || null;
}
