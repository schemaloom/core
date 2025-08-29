import { SchemaLoomExtractor, GeminiProvider, EventListSchema } from '../src/index.js';

async function main() {
  // Create an extractor instance
  const extractor = new SchemaLoomExtractor({
    chunkSize: 50000,  // Smaller chunks for faster processing
    chunkOverlap: 1000, // Some overlap to maintain context
    temperature: 0
  });

  // Create a provider instance
  const provider = new GeminiProvider({
    model: "gemini-2.5-flash",
    temperature: 0
  });

  // Sample text content
  const sampleText = `
    Event: Tech Conference 2024
    Date: March 15-17, 2024
    Place: San Francisco Convention Center
    
    Event: Startup Meetup
    Date: March 20, 2024
    Place: Silicon Valley Innovation Hub
    
    Event: AI Workshop
    Date: March 25, 2024
    Place: Stanford University
  `;

  try {
    console.log('Starting extraction...');
    
    // Extract data using the schema
    const result = await extractor.extract(
      sampleText,
      EventListSchema,
      provider.getLLM()
    );

    console.log('Extraction completed!');
    console.log('Extracted data:', result.data);
    console.log('Metadata:', {
      chunks: result.chunks,
      processingTime: `${result.processingTime}ms`,
      errors: result.errors
    });

  } catch (error) {
    console.error('Extraction failed:', error);
  }
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
