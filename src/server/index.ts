import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import extract from '../api/routes/extract.js';
import { configDotenv } from 'dotenv';
import type { ServerOptions } from '../types/index.js';

configDotenv();

export const createPipeline = () => {
  const pipeline = new Hono()
  pipeline.get("/health", c => c.text('ok'))
  pipeline.route("/extract", extract)
  return pipeline
}

export const startServer = (options: ServerOptions = {}) => {
  const app = createPipeline()
  const port = options.port || 3000
  const host = options.host || 'localhost'

  serve({
    fetch: app.fetch,
    port,
    hostname: host
  }, (info) => {
    console.log(`SchemaLoom server is running on http://${host}:${info.port}`)
    console.log('Available endpoints:')
    console.log('  GET  /health - Health check')
    console.log('  POST /extract - Data extraction (expects file upload)')
  })

  return app
}

// Export the Hono app type for advanced usage
export type { Hono } from 'hono'
