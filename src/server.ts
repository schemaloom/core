#!/usr/bin/env node

import { startServer } from './server/index.js';

// Start the server when this file is run directly
startServer({
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || 'localhost'
});
