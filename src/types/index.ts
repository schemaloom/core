import { z } from 'zod';

export interface ExtractionOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  temperature?: number;
  model?: string;
}

export interface ExtractionResult<T = any> {
  data: T;
  chunks: number;
  processingTime: number;
  errors?: string[];
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