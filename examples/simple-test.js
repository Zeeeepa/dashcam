#!/usr/bin/env node

import { server } from '../lib/websocket/server.js';
import { WebTrackerManager } from '../lib/extension-logs/manager.js';

async function main() {
  console.log('Simple test - make sure you have example.com or any webpage open\n');
  
  await server.start();
  console.log('Server started on port:', server.port);
  
  const manager = new WebTrackerManager(server);
  
  console.log('Waiting for extension...');
  await new Promise((resolve) => {
    const cleanup = server.on('connection', () => {
      console.log('Connected!\n');
      cleanup();
      resolve();
    });
  });
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  console.log('Test: Get page DOM');
  const result = await manager.getPageDOM();
  console.log('Title:', result.title);
  console.log('URL:', result.url);
  console.log('HTML length:', result.html.length, 'characters\n');
  
  console.log(result.html)

  await server.stop();
  process.exit(0);
}

main().catch(console.error);
