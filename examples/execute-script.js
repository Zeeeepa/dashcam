#!/usr/bin/env node

/**
 * Example: Execute JavaScript on a webpage through the Chrome extension
 * 
 * This demonstrates how to:
 * 1. Connect to the Chrome extension via WebSocket
 * 2. Send JavaScript code to execute on the active tab
 * 3. Receive the execution results back
 */

import { server } from '../lib/websocket/server.js';
import { WebTrackerManager } from '../lib/extension-logs/manager.js';
import { logger } from '../lib/logger.js';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Chrome Extension Script Execution Example                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log('📋 Prerequisites:');
  console.log('  1. Chrome extension must be installed and loaded');
  console.log('  2. Have a regular webpage open (NOT chrome:// or chrome-extension://)');
  console.log('  3. For best results, navigate to a simple page like example.com\n');
  
  console.log('Starting WebSocket server...');
  
  // Start the WebSocket server
  await server.start();
  console.log('✓ WebSocket server started on port:', server.port);
  
  // Create the WebTrackerManager
  const manager = new WebTrackerManager(server);
  
  // Wait for the Chrome extension to connect
  console.log('\nWaiting for Chrome extension to connect...');
  const connected = await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log('⏱️  Timeout waiting for connection');
      resolve(false);
    }, 10000);
    
    const cleanup = server.on('connection', (client) => {
      console.log('✓ Chrome extension connected!');
      clearTimeout(timeout);
      cleanup();
      resolve(true);
    });
  });
  
  if (!connected) {
    console.error('\n❌ Chrome extension did not connect.');
    console.error('   Make sure the extension is installed and running.');
    console.error('   Check chrome://extensions to verify it\'s loaded.');
    process.exit(1);
  }
  
  // Give it a moment to fully initialize
  await new Promise(resolve => setTimeout(resolve, 500));
  
  console.log('\n--- Example 1: Get page title ---');
  try {
    const result = await manager.executeScript({
      code: 'return document.title;'
    });
    console.log('✓ Page title:', result);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  console.log('\n--- Example 2: Get current URL ---');
  try {
    const result = await manager.executeScript({
      code: 'return window.location.href;'
    });
    console.log('Current URL:', result);
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  console.log('\n--- Example 3: Change page background color ---');
  try {
    const result = await manager.executeScript({
      code: `
        document.body.style.backgroundColor = '#ffcccc';
        return 'Background color changed!';
      `
    });
    console.log('Result:', result);
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  console.log('\n--- Example 4: Insert a message on the page ---');
  try {
    const result = await manager.executeScript({
      code: `
        const div = document.createElement('div');
        div.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #4CAF50; color: white; padding: 20px; border-radius: 8px; font-family: Arial; z-index: 10000; box-shadow: 0 4px 6px rgba(0,0,0,0.1);';
        div.textContent = 'Hello from CLI! 👋';
        document.body.appendChild(div);
        
        // Remove after 5 seconds
        setTimeout(() => div.remove(), 5000);
        
        return 'Message inserted successfully!';
      `
    });
    console.log('Result:', result);
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  console.log('\n--- Example 5: Get all links on the page ---');
  try {
    const result = await manager.executeScript({
      code: `
        const links = Array.from(document.querySelectorAll('a'))
          .map(a => ({ text: a.textContent.trim().substring(0, 50), href: a.href }))
          .slice(0, 5);
        return links;
      `
    });
    console.log('First 5 links:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  console.log('\n--- Example 6: Execute with error handling ---');
  try {
    const result = await manager.executeScript({
      code: `
        // This will cause an error
        nonExistentVariable.doSomething();
        return 'This will not be returned';
      `
    });
    console.log('Result:', result);
  } catch (error) {
    console.error('Expected error caught:', error.message);
  }
  
  console.log('\n--- All examples completed! ---');
  
  // Clean up
  await server.stop();
  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
