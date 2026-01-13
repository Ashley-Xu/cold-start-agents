// OpenAI API Client Wrapper
// For AI-powered difficulty analysis using GPT-4o-mini

import OpenAI from "openai";

export class OpenAIClient {
  private client: OpenAI;
  private model: string = "gpt-4o-mini";
  private tokensUsed: number = 0;

  constructor(apiKey: string) {
    if (!apiKey || apiKey === "your_openai_api_key_here") {
      throw new Error(
        "OpenAI API key not configured. Please set OPENAI_API_KEY in .env file"
      );
    }

    this.client = new OpenAI({ apiKey });
  }

  /**
   * Chat completion with structured output (JSON mode)
   */
  async chat(
    systemPrompt: string,
    userMessage: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: options?.temperature ?? 0.3, // Lower temperature for more consistent results
        max_tokens: options?.maxTokens ?? 300,
        response_format: { type: "json_object" }, // Force JSON response
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI");
      }

      // Track token usage
      if (response.usage) {
        this.tokensUsed += response.usage.total_tokens;
      }

      return content;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`OpenAI API error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get total tokens used in this session
   */
  getTokensUsed(): number {
    return this.tokensUsed;
  }

  /**
   * Reset token counter
   */
  resetTokens(): void {
    this.tokensUsed = 0;
  }

  /**
   * Estimate cost based on tokens used
   * GPT-4o-mini pricing: $0.150/1M input tokens, $0.600/1M output tokens
   * Average assumption: 70% input, 30% output
   */
  estimateCost(): number {
    const inputTokens = this.tokensUsed * 0.7;
    const outputTokens = this.tokensUsed * 0.3;

    const inputCost = (inputTokens / 1_000_000) * 0.15;
    const outputCost = (outputTokens / 1_000_000) * 0.6;

    return inputCost + outputCost;
  }
}
