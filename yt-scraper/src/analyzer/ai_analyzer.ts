// AI-Powered Difficulty Analyzer
// Uses GPT-4o-mini to analyze video transcripts and determine difficulty level

import { z } from "zod";
import type {
  Language,
  DifficultyLevel,
  DifficultyResult,
  AIAnalysisResult,
} from "../lib/types.ts";
import { OpenAIClient } from "../openai/client.ts";

// Zod schemas for validating AI responses
const ChineseAnalysisSchema = z.object({
  level: z.enum(["HSK1", "HSK2", "HSK3", "HSK4", "HSK5", "HSK6"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

const FrenchAnalysisSchema = z.object({
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

const JapaneseAnalysisSchema = z.object({
  level: z.enum(["N5", "N4", "N3", "N2", "N1"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export class AIAnalyzer {
  private openai: OpenAIClient;
  private aiConfidenceThreshold: number;

  constructor(openai: OpenAIClient, aiConfidenceThreshold: number = 0.7) {
    this.openai = openai;
    this.aiConfidenceThreshold = aiConfidenceThreshold;
  }

  /**
   * Analyze transcript using AI to determine difficulty level
   */
  async analyze(
    transcript: string,
    language: Language
  ): Promise<DifficultyResult> {
    if (!transcript || transcript.trim().length === 0) {
      return {
        level: null,
        confidence: 0,
        source: "ai",
        reasoning: "No transcript available",
      };
    }

    try {
      console.log(
        `[AI] Analyzing ${transcript.length} characters of ${language} transcript...`
      );

      const prompt = this.buildPrompt(language);
      const responseText = await this.openai.chat(prompt, transcript);

      // Parse and validate AI response
      const result = this.parseResponse(responseText, language);

      console.log(
        `[AI] Analysis complete: ${result.level} (confidence: ${(result.confidence * 100).toFixed(0)}%)`
      );

      return {
        level: result.level,
        confidence: result.confidence,
        source: "ai",
        reasoning: result.reasoning,
      };
    } catch (error) {
      console.error(`[AI] Analysis failed: ${error.message}`);

      return {
        level: null,
        confidence: 0,
        source: "ai",
        reasoning: `AI analysis failed: ${error.message}`,
      };
    }
  }

  /**
   * Check if AI confidence meets threshold
   */
  isTrusted(result: DifficultyResult): boolean {
    return result.source === "ai" && result.confidence >= this.aiConfidenceThreshold;
  }

  /**
   * Build language-specific prompt for AI analysis
   */
  private buildPrompt(language: Language): string {
    if (language === "chinese") {
      return `You are a Chinese language expert. Analyze this transcript sample and determine the HSK level (1-6).

Consider:
- Vocabulary complexity (HSK1: 150 words, HSK2: 300 words, HSK3: 600 words, HSK4: 1200 words, HSK5: 2500 words, HSK6: 5000 words)
- Grammar structures (HSK1: basic 句型, HSK2: 了/过/着, HSK3: 把字句, HSK4: complex structures, HSK5: advanced idioms, HSK6: native-level expressions)
- Sentence length and complexity
- Speaking speed (estimate based on content density)

Return JSON with this exact format:
{
  "level": "HSK1" | "HSK2" | "HSK3" | "HSK4" | "HSK5" | "HSK6",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of assessment (1-2 sentences)"
}`;
    } else if (language === "french") {
      return `You are a French language expert. Analyze this transcript and determine the CEFR level (A1, A2, B1, B2, C1, C2).

Consider:
- Vocabulary complexity (A1: ~500 words, A2: ~1000 words, B1: ~2000 words, B2: ~4000 words, C1: ~8000 words, C2: native-level)
- Grammar structures (A1: présent, A2: passé composé/imparfait, B1: subjonctif, B2: complex tenses, C1: advanced structures, C2: literary forms)
- Sentence complexity and length
- Speaking speed and clarity
- Idiomatic expressions and cultural references

Return JSON with this exact format:
{
  "level": "A1" | "A2" | "B1" | "B2" | "C1" | "C2",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of assessment (1-2 sentences)"
}`;
    } else if (language === "japanese") {
      return `You are a Japanese language expert. Analyze this transcript and determine the JLPT level (N5, N4, N3, N2, N1).

Consider:
- Vocabulary complexity (N5: 800 words, N4: 1500 words, N3: 3000 words, N2: 6000 words, N1: 10000 words)
- Kanji usage (N5: 100 kanji, N4: 300 kanji, N3: 650 kanji, N2: 1000 kanji, N1: 2000 kanji)
- Grammar structures (N5: basic particles, N4: ~て form, N3: conditional, N2: advanced grammar, N1: literary forms)
- Speaking speed and formality level
- Idiomatic expressions

Return JSON with this exact format:
{
  "level": "N5" | "N4" | "N3" | "N2" | "N1",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of assessment (1-2 sentences)"
}`;
    } else {
      throw new Error(`Unsupported language for AI analysis: ${language}`);
    }
  }

  /**
   * Parse and validate AI response
   */
  private parseResponse(
    responseText: string,
    language: Language
  ): AIAnalysisResult {
    try {
      const json = JSON.parse(responseText);

      // Validate against language-specific schema
      let validated: z.infer<
        | typeof ChineseAnalysisSchema
        | typeof FrenchAnalysisSchema
        | typeof JapaneseAnalysisSchema
      >;

      if (language === "chinese") {
        validated = ChineseAnalysisSchema.parse(json);
      } else if (language === "french") {
        validated = FrenchAnalysisSchema.parse(json);
      } else if (language === "japanese") {
        validated = JapaneseAnalysisSchema.parse(json);
      } else {
        throw new Error(`Unsupported language: ${language}`);
      }

      return {
        level: validated.level as DifficultyLevel,
        confidence: validated.confidence,
        reasoning: validated.reasoning,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid AI response format: ${error.message}`);
      }
      throw new Error(`Failed to parse AI response: ${error.message}`);
    }
  }
}
