# SchemaLoom

A TypeScript library for AI-powered data extraction and schema validation with integrated web server capabilities.

## Overview

SchemaLoom provides a robust framework for extracting structured data from unstructured text using AI models. The library combines the power of LangChain and Google Gemini with flexible schema validation through Zod, offering both programmatic and web-based interfaces.

## Features

- **AI-Powered Extraction**: Leverage Google Gemini models for intelligent data extraction
- **Schema Validation**: Comprehensive schema definition and validation using Zod
- **Flexible Chunking**: Configurable text chunking with overlap control
- **Multiple Interfaces**: Use as a library or deploy as a web service
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Extensible Architecture**: Support for custom schemas and extraction logic
- **Production Ready**: Built-in error handling, validation, and monitoring

## Installation

```bash
npm install schemaloom
```

## Quick Start

### Library Usage

```typescript
import { SchemaLoomExtractor, GeminiProvider, EventListSchema } from 'schemaloom';

// Initialize extractor with custom configuration
const extractor = new SchemaLoomExtractor({
  chunkSize: 100000,
  chunkOverlap: 0,
  temperature: 0
});

// Configure AI provider
const provider = new GeminiProvider({
  model: "gemini-2.5-flash",
  temperature: 0
});

// Extract structured data
const result = await extractor.extract(
  "Your text content here...",
  EventListSchema,
  provider.getLLM()
);

console.log(result.data);        // Extracted data
console.log(result.metadata);    // Processing information
```

### Web Server Deployment

```typescript
import { startServer } from 'schemaloom/server';

// Start server with custom configuration
startServer({
  port: 3000,
  host: 'localhost'
});
```

## Core Components

### SchemaLoomExtractor

The primary extraction engine that handles text processing, chunking, and AI model interaction.

#### Configuration Options

```typescript
interface ExtractionOptions {
  chunkSize?: number;        // Default: 100000
  chunkOverlap?: number;     // Default: 0
  temperature?: number;       // Default: 0
  model?: string;            // Default: "gemini-2.5-flash"
}
```

#### Methods

- `extract<T>(text: string, schema: z.ZodSchema<T>, provider: any): Promise<ExtractionResult<T>>`
- `extractBatch<T>(chunks: TextChunk[], schema: z.ZodSchema<T>, provider: any): Promise<ExtractionResult<T[]>>`
- `getOptions(): ExtractionOptions`
- `updateOptions(newOptions: Partial<ExtractionOptions>): void`

### GeminiProvider

Manages Google Gemini AI model interactions with configurable parameters.

#### Configuration

```typescript
interface GeminiOptions {
  model?: string;            // Default: "gemini-2.5-flash"
  temperature?: number;       // Default: 0
}
```

#### Methods

- `getLLM(): ChatGoogleGenerativeAI`
- `updateConfig(options: Partial<GeminiOptions>): void`

## Predefined Schemas

The library includes several pre-built schemas for common use cases:

### Event Schema
```typescript
const EventSchema = z.object({
  name: z.string(),
  date: z.string(),
  place: z.string()
});
```

### Product Schema
```typescript
const ProductSchema = z.object({
  name: z.string(),
  price: z.number(),
  category: z.string(),
  description: z.string().optional(),
  brand: z.string().optional(),
  sku: z.string().optional()
});
```

### Article Schema
```typescript
const ArticleSchema = z.object({
  title: z.string(),
  author: z.string().optional(),
  publishDate: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  summary: z.string().optional()
});
```

### Contact Schema
```typescript
const ContactSchema = z.object({
  name: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  position: z.string().optional(),
  address: z.string().optional()
});
```

### Invoice Schema
```typescript
const InvoiceSchema = z.object({
  invoiceNumber: z.string(),
  date: z.string(),
  dueDate: z.string().optional(),
  customer: z.string(),
  items: z.array(z.object({
    description: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
    total: z.number()
  })),
  subtotal: z.number(),
  tax: z.number().optional(),
  total: z.number()
});
```

## Web Server API

### Endpoints

- `GET /health` - Health check endpoint
- `GET /extract` - Schema and parameter documentation
- `POST /extract` - Data extraction using predefined schemas
- `POST /extract/custom` - Data extraction using custom schema definitions

### Predefined Schema Extraction

```bash
POST /extract?schema=product&chunkSize=50000&chunkOverlap=1000&temperature=0.1
Content-Type: multipart/form-data

file: [your-file]
```

### Custom Schema Extraction

```bash
POST /extract/custom
Content-Type: application/json

{
  "content": "Your text content here...",
  "schemaDefinition": {
    "type": "object",
    "properties": {
      "name": {"type": "string"},
      "value": {"type": "number"},
      "active": {"type": "boolean"}
    }
  },
  "chunkSize": 50000,
  "temperature": 0
}
```

## Advanced Usage

### Custom Pipeline Creation

```typescript
import { createPipeline } from 'schemaloom/server';
import { Hono } from 'hono';

// Create base pipeline
const baseApp = createPipeline();

// Extend with custom functionality
const customApp = new Hono();

// Add custom routes
customApp.get('/status', (c) => c.json({ status: 'healthy' }));

// Mount extraction routes
customApp.route('/api', baseApp);

// Add middleware
customApp.use('*', async (c, next) => {
  console.log(`${c.req.method} ${c.req.url}`);
  await next();
});
```

### Batch Processing

```typescript
const chunks = [
  { content: "Text chunk 1", index: 0 },
  { content: "Text chunk 2", index: 1 }
];

const result = await extractor.extractBatch(
  chunks,
  CustomSchema,
  provider.getLLM()
);
```

### Schema Registry Access

```typescript
import { SchemaRegistry } from 'schemaloom';

// Access predefined schemas
const productSchema = SchemaRegistry.product;
const articleSchema = SchemaRegistry.article;

// Use in extraction
const result = await extractor.extract(
  content,
  productSchema,
  provider.getLLM()
);
```

## Configuration

### Environment Variables

```bash
GOOGLE_API_KEY=your_google_api_key_here
```

### Server Options

```typescript
interface ServerOptions {
  port?: number;      // Default: 3000
  host?: string;      // Default: 'localhost'
  cors?: boolean;     // Default: false
}
```

## Error Handling

The library provides comprehensive error handling with detailed error messages and metadata:

```typescript
interface ExtractionResult<T> {
  data: T;
  chunks: number;
  processingTime: number;
  errors?: string[];
}
```

## Performance Considerations

- **Chunk Size**: Larger chunks reduce API calls but may impact accuracy
- **Chunk Overlap**: Overlap preserves context between chunks
- **Temperature**: Lower values (0-0.3) for factual extraction, higher (0.7-1.0) for creative tasks
- **Model Selection**: Choose models based on accuracy vs. speed requirements

## Development

```bash
# Install dependencies
npm install

# Build library
npm run build

# Development mode with watch
npm run dev

# Start server
npm start
```

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import type { 
  ExtractionOptions, 
  ExtractionResult, 
  TextChunk, 
  ExtractionProvider, 
  ServerOptions 
} from 'schemaloom';
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions, please use the GitHub issue tracker or refer to the documentation.
