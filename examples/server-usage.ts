import { startServer } from '../src/server/index.js';

async function main() {
  console.log('Starting SchemaLoom server...');
  
  // Start the server with custom options
  const app = startServer({
    port: 3000,
    host: 'localhost'
  });

  console.log('Server started successfully!');
  console.log('Available endpoints:');
  console.log('  GET  /health - Health check');
  console.log('  POST /extract - Data extraction (expects file upload)');
  console.log('');
  console.log('Server running on http://localhost:3000');
  console.log('Press Ctrl+C to stop');
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
