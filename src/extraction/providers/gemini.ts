import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { ExtractionOptions } from "../../types/index.js";

export class GeminiProvider {
  private llm: ChatGoogleGenerativeAI | null = null;
  private currentModel: string;
  private currentTemperature: number;

  constructor(options: Partial<ExtractionOptions> = {}) {
    this.currentModel = options.model || "gemini-2.5-flash";
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