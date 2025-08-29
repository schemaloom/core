import { Hono } from "hono";
import { SchemaLoomExtractor } from "../../extraction/schemaLoomExtractor.js";
import { SchemaRegistry } from "../../schemas/index.js";
import GeminiProvider from "../../extraction/providers/gemini.js";
import type { ExtractionOptions } from "../../types/index.js";
import { z } from "zod";

const extract = new Hono();

// Helper function to create a Zod schema from a JSON definition
function createSchemaFromDefinition(schemaDef: any): z.ZodSchema {
  try {
    if (typeof schemaDef === 'string') {
      // Try to parse as JSON string
      schemaDef = JSON.parse(schemaDef);
    }
    
    // Basic schema type detection and creation
    if (schemaDef.type === 'object' && schemaDef.properties) {
      const shape: Record<string, z.ZodSchema> = {};
      
      for (const [key, prop] of Object.entries(schemaDef.properties)) {
        const propDef = prop as any;
        
        if (propDef.type === 'string') {
          shape[key] = z.string();
        } else if (propDef.type === 'number') {
          shape[key] = z.number();
        } else if (propDef.type === 'boolean') {
          shape[key] = z.boolean();
        } else if (propDef.type === 'array') {
          if (propDef.items && propDef.items.type === 'object') {
            shape[key] = z.array(createSchemaFromDefinition(propDef.items));
          } else {
            shape[key] = z.array(z.any());
          }
        } else if (propDef.type === 'object') {
          shape[key] = createSchemaFromDefinition(propDef);
        } else {
          shape[key] = z.any();
        }
        
        // Handle optional properties
        if (propDef.required === false) {
          shape[key] = shape[key].optional();
        }
      }
      
      return z.object(shape);
    } else if (schemaDef.type === 'array') {
      if (schemaDef.items) {
        return z.array(createSchemaFromDefinition(schemaDef.items));
      } else {
        return z.array(z.any());
      }
    } else {
      // Fallback to any for unknown types
      return z.any();
    }
  } catch (error) {
    throw new Error(`Failed to create schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

extract.post("/", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.file;
    
    if (!file || typeof file === 'string') {
      return c.json({
        success: false,
        error: "File is required"
      }, 400);
    }

    // Get extraction options from query parameters or body
    const chunkSize = parseInt(c.req.query('chunkSize') || String(body.chunkSize || '100000'));
    const chunkOverlap = parseInt(c.req.query('chunkOverlap') || String(body.chunkOverlap || '0'));
    const temperature = parseFloat(c.req.query('temperature') || String(body.temperature || '0'));
    const model = c.req.query('model') || String(body.model || 'gemini-2.5-flash');

    // Validate parameters
    if (chunkSize < 1000 || chunkSize > 1000000) {
      return c.json({
        success: false,
        error: "chunkSize must be between 1000 and 1000000"
      }, 400);
    }

    if (chunkOverlap < 0 || chunkOverlap >= chunkSize) {
      return c.json({
        success: false,
        error: "chunkOverlap must be >= 0 and < chunkSize"
      }, 400);
    }

    if (temperature < 0 || temperature > 2) {
      return c.json({
        success: false,
        error: "temperature must be between 0 and 2"
      }, 400);
    }

    // Handle custom schema if provided
    let schema: z.ZodSchema = SchemaRegistry.event;
    let schemaName = "event";
    
    if (body.schema) {
      try {
        // If schema is provided as a string, try to find it in the registry
        if (typeof body.schema === 'string') {
          const schemaKey = body.schema as keyof typeof SchemaRegistry;
          if (SchemaRegistry[schemaKey]) {
            schema = SchemaRegistry[schemaKey];
            schemaName = body.schema;
          } else {
            return c.json({
              success: false,
              error: `Unknown predefined schema: ${body.schema}. Available schemas: ${Object.keys(SchemaRegistry).join(', ')}`
            }, 400);
          }
        }
      } catch (error) {
        return c.json({
          success: false,
          error: `Invalid schema: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 400);
      }
    }

    const content = await file.text();

    // Create extractor instance with custom options
    const extractor = new SchemaLoomExtractor({
      chunkSize,
      chunkOverlap,
      temperature,
      model
    });

    // Use the default provider instance
    const provider = GeminiProvider;

    // Extract data using the schema
    const result = await extractor.extract(
      content,
      schema,
      provider.getLLM()
    );

    // Return the extracted data with metadata
    return c.json({
      success: true,
      data: result.data,
      metadata: {
        chunks: result.chunks,
        processingTime: result.processingTime,
        errors: result.errors,
        schema: schemaName,
        options: {
          chunkSize,
          chunkOverlap,
          temperature,
          model
        }
      }
    });

  } catch (error) {
    console.error("Extraction error:", error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    }, 500);
  }
});

// New endpoint for custom schema extraction
extract.post("/custom", async (c) => {
  try {
    const body = await c.req.json();
    const { content, schemaDefinition, ...options } = body;
    
    if (!content) {
      return c.json({
        success: false,
        error: "Content is required"
      }, 400);
    }
    
    if (!schemaDefinition) {
      return c.json({
        success: false,
        error: "Schema definition is required"
      }, 400);
    }

    // Get extraction options
    const chunkSize = parseInt(options.chunkSize || '100000');
    const chunkOverlap = parseInt(options.chunkOverlap || '0');
    const temperature = parseFloat(options.temperature || '0');
    const model = options.model || 'gemini-2.5-flash';

    // Validate parameters
    if (chunkSize < 1000 || chunkSize > 1000000) {
      return c.json({
        success: false,
        error: "chunkSize must be between 1000 and 1000000"
      }, 400);
    }

    if (chunkOverlap < 0 || chunkOverlap >= chunkSize) {
      return c.json({
        success: false,
        error: "chunkOverlap must be >= 0 and < chunkSize"
      }, 400);
    }

    if (temperature < 0 || temperature > 2) {
      return c.json({
        success: false,
        error: "temperature must be between 0 and 2"
      }, 400);
    }

    // Create custom schema from definition
    let schema: z.ZodSchema;
    try {
      schema = createSchemaFromDefinition(schemaDefinition);
    } catch (error) {
      return c.json({
        success: false,
        error: `Invalid schema definition: ${error instanceof Error ? error.message : 'Unknown error'}`
      }, 400);
    }

    // Create extractor instance with custom options
    const extractor = new SchemaLoomExtractor({
      chunkSize,
      chunkOverlap,
      temperature,
      model
    });

    // Use the default provider instance
    const provider = GeminiProvider;

    // Extract data using the custom schema
    const result = await extractor.extract(
      content,
      schema,
      provider.getLLM()
    );

    // Return the extracted data with metadata
    return c.json({
      success: true,
      data: result.data,
      metadata: {
        chunks: result.chunks,
        processingTime: result.processingTime,
        errors: result.errors,
        schema: "Custom Schema",
        options: {
          chunkSize,
          chunkOverlap,
          temperature,
          model
        }
      }
    });

  } catch (error) {
    console.error("Custom extraction error:", error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    }, 500);
  }
});

// Add a GET endpoint to show available options
extract.get("/", (c) => {
  return c.json({
    message: "SchemaLoom Extraction API",
    endpoints: {
      "POST /extract": "Extract using predefined schemas",
      "POST /extract/custom": "Extract using custom schema definition"
    },
    parameters: {
      chunkSize: "Number (1000-1000000, default: 100000) - Size of text chunks",
      chunkOverlap: "Number (0 to < chunkSize, default: 0) - Overlap between chunks",
      temperature: "Number (0-2, default: 0) - AI model creativity/randomness",
      model: "String (default: gemini-2.5-flash) - AI model to use",
      schema: `String (default: event) - Predefined schema to use. Available: ${Object.keys(SchemaRegistry).join(', ')}`
    },
    examples: {
      "Predefined schema": "POST /extract?chunkSize=50000&chunkOverlap=1000&temperature=0.1&schema=event",
      "Custom schema": "POST /extract/custom with JSON body containing content and schemaDefinition"
    },
    availableSchemas: Object.keys(SchemaRegistry)
  });
});

export default extract;
