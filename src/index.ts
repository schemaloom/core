import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import extract from './api/routes/extract.js';
import { configDotenv } from 'dotenv';

configDotenv();

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.route("/extract", extract)


serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
