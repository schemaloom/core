import { z } from 'zod';

export interface ExtractionOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  temperature?: number;
  model?: string;
}

export interface ValidationIssue {
  type: string;
  severity: "error" | "warning";
  /** Written so it can be sent back to the model in a retry prompt. */
  message: string;
  ids: string[];
}

export interface ValidationResult {
  /** true if there are no error-severity issues */
  valid: boolean;
  issues: ValidationIssue[];
  stats?: Record<string, number>;
}

/** Optional per-schema hooks; schemas that don't need them pass nothing. */
export interface ExtractOptions<T> {
  /** Whole-result validation that Zod can't express. Runs after merging. */
  postValidate?: (data: T, sourceText: string) => ValidationResult;
  /** Combine per-chunk results. Defaults to Array.prototype.flat(). */
  merge?: (parts: T[]) => T;
}

export interface ExtractionResult<T = any> {
  data: T;
  chunks: number;
  processingTime: number;
  errors?: string[];
  validation?: ValidationResult;
}

export interface TextChunk {
  content: string;
  index: number;
  metadata?: Record<string, any>;
}

export interface ExtractionProvider {
  extract<T>(text: string, schema: z.ZodSchema<T>): Promise<T>;
  extractBatch<T>(chunks: TextChunk[], schema: z.ZodSchema<T>): Promise<T[]>;
}

export interface ServerOptions {
  port?: number;
  host?: string;
  cors?: boolean;
} 