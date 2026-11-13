import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { z } from "zod";
import type { ExtractionOptions, ExtractionResult, ExtractOptions, TextChunk, TokenUsage } from "../types/index.js";

/**
 * Bump whenever the extraction prompt changes. The eval harness includes it in
 * its cache key so stale cached model responses are never replayed.
 */
export const PROMPT_VERSION = "1";

export class SchemaLoomExtractor {
  private promptTemplate: ChatPromptTemplate;
  private contentSplitter: RecursiveCharacterTextSplitter;
  private options: ExtractionOptions;

  constructor(options: ExtractionOptions = {}) {
    this.options = {
      chunkSize: 100000,
      chunkOverlap: 0,
      temperature: 0,
      model: "gemini-3-flash-preview",
      ...options
    };

    this.promptTemplate = ChatPromptTemplate.fromMessages([
      [
        "system",
        `You are an expert extraction algorithm.
Only extract relevant information from the text.
If you do not know the value of an attribute asked to extract,
return null for the attribute's value.`,
      ],
      ["human", "{text}"],
    ]);

    this.contentSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.options.chunkSize!,
      chunkOverlap: this.options.chunkOverlap!
    });
  }

  /**
   * Extract structured data from text using a schema
   */
  async extract<T>(
    text: string, 
    schema: z.ZodSchema<T>,
    provider: any,
    hooks: ExtractOptions<T> = {}
  ): Promise<ExtractionResult<T>> {
    const startTime = Date.now();
    
    try {
      // Split the content
      const splitContent = await this.contentSplitter.splitText(text);
      
      // Process each chunk
      const responseArr: T[] = [];
      const errors: string[] = [];
      const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
      
      for (let i = 0; i < splitContent.length; i++) {
        try {
          console.log(`Processing chunk ${i + 1}/${splitContent.length}: ${splitContent[i].substring(0, 100)}...`);
          
          const prompt = await this.promptTemplate.invoke({ text: splitContent[i] });
          // includeRaw returns the raw message (which carries usage_metadata) alongside the parsed object
          const structured_llm = provider.withStructuredOutput(schema, { includeRaw: true });
          const { raw, parsed } = await structured_llm.invoke(prompt);
          usage.inputTokens += raw?.usage_metadata?.input_tokens ?? 0;
          usage.outputTokens += raw?.usage_metadata?.output_tokens ?? 0;
          if (parsed == null) throw new Error("Model output did not match the schema");
          
          responseArr.push(parsed);
        } catch (error) {
          const errorMsg = `Error processing chunk ${i + 1}: ${error instanceof Error ? error.message : String(error)}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      // Combine results (schema-specific merge, or flatten arrays by default)
      const combinedData = hooks.merge
        ? hooks.merge(responseArr)
        : (responseArr.flat() as T);

      // Whole-result validation runs on the merged data against the full text
      const validation = hooks.postValidate
        ? hooks.postValidate(combinedData, text)
        : undefined;
      
      return {
        data: combinedData,
        validation,
        chunks: splitContent.length,
        processingTime: Date.now() - startTime,
        errors: errors.length > 0 ? errors : undefined,
        usage
      };
      
    } catch (error) {
      return {
        data: [] as T,
        chunks: 0,
        processingTime: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * Extract data from multiple text chunks
   */
  async extractBatch<T>(
    chunks: TextChunk[],
    schema: z.ZodSchema<T>,
    provider: any
  ): Promise<ExtractionResult<T[]>> {
    const startTime = Date.now();
    
    try {
      const results: T[] = [];
      const errors: string[] = [];
      
      for (const chunk of chunks) {
        try {
          const prompt = await this.promptTemplate.invoke({ text: chunk.content });
          const structured_llm = provider.withStructuredOutput(schema);
          const result = await structured_llm.invoke(prompt);
          results.push(result);
        } catch (error) {
          const errorMsg = `Error processing chunk ${chunk.index}: ${error instanceof Error ? error.message : String(error)}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        }
      }
      
      return {
        data: results,
        chunks: chunks.length,
        processingTime: Date.now() - startTime,
        errors: errors.length > 0 ? errors : undefined
      };
      
    } catch (error) {
      return {
        data: [],
        chunks: 0,
        processingTime: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * Get the current options
   */
  getOptions(): ExtractionOptions {
    return { ...this.options };
  }

  /**
   * Update extraction options
   */
  updateOptions(newOptions: Partial<ExtractionOptions>): void {
    this.options = { ...this.options, ...newOptions };
    
    // Update splitter if chunk options changed
    if (newOptions.chunkSize || newOptions.chunkOverlap) {
      this.contentSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: this.options.chunkSize!,
        chunkOverlap: this.options.chunkOverlap!
      });
    }
  }
}
