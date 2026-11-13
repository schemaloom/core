import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { ExtractionOptions } from "../../types/index.js";

export class GeminiProvider {
  private llm: ChatGoogleGenerativeAI | null = null;
  private currentModel: string;
  private currentTemperature: number;

  constructor(options: Partial<ExtractionOptions> = {}) {
    this.currentModel = options.model || "gemini-3-flash-preview";
    this.currentTemperature = options.temperature || 0;
  }

  /**
   * Get the underlying LLM instance (lazy initialization)
   */
  getLLM(): ChatGoogleGenerativeAI {
    if (!this.llm) {
      this.llm = new ChatGoogleGenerativeAI({
        model: this.currentModel,
        temperature: this.currentTemperature,
        // Fail fast on 503/429 instead of silently retrying until the caller times out
        maxRetries: 2,
      });
    }
    return this.llm;
  }

  /**
   * Update provider configuration
   */
  updateConfig(options: Partial<ExtractionOptions>): void {
    if (options.model || options.temperature !== undefined) {
      this.currentModel = options.model || this.currentModel;
      this.currentTemperature = options.temperature ?? this.currentTemperature;
      
      // Reset LLM instance so it gets recreated with new config
      this.llm = null;
    }
  }
}

// Default instance for backward compatibility
export default new GeminiProvider();