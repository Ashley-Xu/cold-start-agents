// Topic Classifier
// Classifies videos into predefined topics using keyword matching and AI fallback

import type {
  TopicId,
  TopicResult,
  VideoMetadata,
  TopicConfig,
  Topic,
} from "../lib/types.ts";
import { OpenAIClient } from "../openai/client.ts";
import { z } from "zod";

const TopicAnalysisSchema = z.object({
  topic: z.enum([
    "cooking",
    "grwm",
    "sports",
    "mukbang",
    "vlog",
    "travel",
    "education",
    "entertainment",
    "other",
  ]),
  confidence: z.number().min(0).max(1),
});

export class TopicClassifier {
  private topics: Topic[];
  private openai?: OpenAIClient;
  private useAIFallback: boolean;

  constructor(topics: Topic[], openai?: OpenAIClient, useAIFallback: boolean = true) {
    this.topics = topics;
    this.openai = openai;
    this.useAIFallback = useAIFallback && !!openai;
  }

  /**
   * Classify video topic using keyword matching + AI fallback
   */
  async classify(video: VideoMetadata): Promise<TopicResult> {
    // First try: metadata keyword matching
    const metadataResult = this.classifyByMetadata(video);

    if (metadataResult.confidence >= 0.7) {
      // High confidence from metadata, no need for AI
      return metadataResult;
    }

    // Second try: AI analysis (if available and enabled)
    if (this.useAIFallback && this.openai) {
      console.log(
        `[Topic] Metadata confidence too low (${(metadataResult.confidence * 100).toFixed(0)}%), using AI...`
      );

      const aiResult = await this.classifyByAI(video);
      if (aiResult.confidence >= 0.7) {
        return aiResult;
      }
    }

    // Fallback: return metadata result or "other"
    if (metadataResult.topic !== "other") {
      return metadataResult;
    }

    console.log(`[Topic] Could not classify: "${video.title.substring(0, 50)}..."`);

    return {
      topic: "other",
      confidence: 0.3,
      source: "metadata",
    };
  }

  /**
   * Classify by keyword matching in title and description
   */
  private classifyByMetadata(video: VideoMetadata): TopicResult {
    const text = `${video.title} ${video.description}`.toLowerCase();

    // Count keyword matches for each topic
    const scores: Record<TopicId, number> = {
      cooking: 0,
      grwm: 0,
      sports: 0,
      mukbang: 0,
      vlog: 0,
      travel: 0,
      education: 0,
      entertainment: 0,
      other: 0,
    };

    for (const topic of this.topics) {
      for (const keyword of topic.keywords) {
        const regex = new RegExp(`\\b${keyword.toLowerCase()}\\b`, "i");
        if (regex.test(text)) {
          scores[topic.id]++;
        }
      }
    }

    // Find topic with highest score
    let maxScore = 0;
    let bestTopic: TopicId = "other";

    for (const [topic, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        bestTopic = topic as TopicId;
      }
    }

    // Calculate confidence based on score
    const confidence = maxScore > 0 ? Math.min(0.3 + maxScore * 0.2, 1.0) : 0.1;

    if (bestTopic !== "other") {
      console.log(
        `[Topic] Metadata matched: ${bestTopic} (${maxScore} keywords, confidence: ${(confidence * 100).toFixed(0)}%)`
      );
    }

    return {
      topic: bestTopic,
      confidence,
      source: "metadata",
    };
  }

  /**
   * Classify by AI analysis
   */
  private async classifyByAI(video: VideoMetadata): Promise<TopicResult> {
    if (!this.openai) {
      return { topic: "other", confidence: 0, source: "ai" };
    }

    try {
      const prompt = `You are a video content classifier. Analyze this YouTube video and determine its primary topic category.

Available categories:
- cooking: Cooking, recipes, food preparation, baking
- grwm: Get ready with me, morning routines, makeup tutorials
- sports: Sports, workouts, fitness, exercise
- mukbang: Mukbang, eating shows, food eating challenges
- vlog: Daily life vlogs, lifestyle content
- travel: Travel, trips, tourism, destinations
- education: Tutorials, lessons, educational content, how-to guides
- entertainment: Entertainment, comedy, funny videos, general amusement
- other: Doesn't fit the above categories

Return JSON with this exact format:
{
  "topic": "cooking" | "grwm" | "sports" | "mukbang" | "vlog" | "travel" | "education" | "entertainment" | "other",
  "confidence": 0.0-1.0
}`;

      const message = `Title: ${video.title}\n\nDescription: ${video.description.substring(0, 500)}`;

      const responseText = await this.openai.chat(prompt, message);
      const json = JSON.parse(responseText);
      const validated = TopicAnalysisSchema.parse(json);

      console.log(
        `[Topic] AI classified: ${validated.topic} (confidence: ${(validated.confidence * 100).toFixed(0)}%)`
      );

      return {
        topic: validated.topic,
        confidence: validated.confidence,
        source: "ai",
      };
    } catch (error) {
      console.error(`[Topic] AI classification failed: ${error.message}`);

      return {
        topic: "other",
        confidence: 0,
        source: "ai",
      };
    }
  }

  /**
   * Load topics from config file
   */
  static async loadConfig(
    configPath: string = "./config/topics.json"
  ): Promise<Topic[]> {
    try {
      const text = await Deno.readTextFile(configPath);
      const config: TopicConfig = JSON.parse(text);

      console.log(`[Topic] Loaded ${config.topics.length} topics from config`);

      return config.topics;
    } catch (error) {
      throw new Error(`Failed to load topics config: ${error.message}`);
    }
  }
}
