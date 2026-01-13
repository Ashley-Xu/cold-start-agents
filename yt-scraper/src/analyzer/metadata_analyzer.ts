// Metadata-based Difficulty Analyzer
// Parses video titles and descriptions for difficulty level indicators

import type {
  Language,
  DifficultyLevel,
  DifficultyResult,
  VideoMetadata,
  DifficultyConfig,
} from "../lib/types.ts";

export class MetadataAnalyzer {
  private config: DifficultyConfig;
  private confidenceThreshold: number;

  constructor(config: DifficultyConfig, confidenceThreshold: number = 0.7) {
    this.config = config;
    this.confidenceThreshold = confidenceThreshold;
  }

  /**
   * Analyze video metadata to determine difficulty level
   * Returns null level if no patterns match
   */
  analyze(
    video: VideoMetadata,
    language: Language
  ): DifficultyResult {
    const text = `${video.title} ${video.description}`.toLowerCase();

    // Get patterns for the specified language
    const languagePatterns = this.config[language];
    if (!languagePatterns) {
      throw new Error(`No difficulty patterns configured for language: ${language}`);
    }

    // Check each difficulty level's patterns
    for (const [level, patternConfig] of Object.entries(languagePatterns)) {
      const { patterns } = patternConfig;

      for (const pattern of patterns) {
        const regex = new RegExp(pattern, "i"); // Case-insensitive

        if (regex.test(text)) {
          // Explicit match found!
          console.log(
            `[Metadata] Video "${video.title.substring(0, 50)}..." ` +
              `matched pattern "${pattern}" → ${level}`
          );

          return {
            level: level as DifficultyLevel,
            confidence: 0.9, // High confidence for explicit mentions
            source: "metadata",
          };
        }
      }
    }

    // No pattern matched
    console.log(`[Metadata] No difficulty pattern found in: "${video.title.substring(0, 50)}..."`);

    return {
      level: null,
      confidence: 0,
      source: "metadata",
    };
  }

  /**
   * Check if metadata confidence meets threshold for skipping AI analysis
   */
  shouldSkipAI(result: DifficultyResult): boolean {
    return result.confidence >= this.confidenceThreshold;
  }

  /**
   * Load difficulty patterns from config file
   */
  static async loadConfig(
    configPath: string = "./config/difficulty_patterns.json"
  ): Promise<DifficultyConfig> {
    try {
      const text = await Deno.readTextFile(configPath);
      const config: DifficultyConfig = JSON.parse(text);

      console.log("[Metadata] Loaded difficulty patterns from config");

      return config;
    } catch (error) {
      throw new Error(`Failed to load difficulty patterns config: ${error.message}`);
    }
  }
}
