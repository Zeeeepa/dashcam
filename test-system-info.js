#!/usr/bin/env node
/**
 * Test script to verify system information collection
 */

import { getSystemInfo } from './lib/systemInfo.js';
import { logger } from './lib/logger.js';

async function testSystemInfo() {
  console.log('Testing system information collection...\n');
  
  try {
    const systemInfo = await getSystemInfo();
    
    console.log('✓ System information collected successfully\n');
    console.log('System Information:');
    console.log('==================\n');
    
    console.log('CPU:');
    console.log(`  Brand: ${systemInfo.cpu.brand}`);
    console.log(`  Cores: ${systemInfo.cpu.cores}`);
    console.log(`  Speed: ${systemInfo.cpu.speed} GHz`);
    console.log();
    
    console.log('Memory:');
    console.log(`  Total: ${(systemInfo.mem.total / (1024 ** 3)).toFixed(2)} GB`);
    console.log(`  Free: ${(systemInfo.mem.free / (1024 ** 3)).toFixed(2)} GB`);
    console.log(`  Used: ${(systemInfo.mem.used / (1024 ** 3)).toFixed(2)} GB`);
    console.log();
    
    console.log('Operating System:');
    console.log(`  Platform: ${systemInfo.os.platform}`);
    console.log(`  Distribution: ${systemInfo.os.distro}`);
    console.log(`  Release: ${systemInfo.os.release}`);
    console.log(`  Architecture: ${systemInfo.os.arch}`);
    console.log(`  Hostname: ${systemInfo.os.hostname}`);
    console.log();
    
    console.log('Graphics:');
    console.log(`  Controllers: ${systemInfo.graphics.controllers?.length || 0}`);
    if (systemInfo.graphics.controllers?.length > 0) {
      systemInfo.graphics.controllers.forEach((controller, index) => {
        console.log(`    ${index + 1}. ${controller.vendor} ${controller.model}`);
        if (controller.vram) {
          console.log(`       VRAM: ${controller.vram} MB`);
        }
      });
    }
    console.log(`  Displays: ${systemInfo.graphics.displays?.length || 0}`);
    if (systemInfo.graphics.displays?.length > 0) {
      systemInfo.graphics.displays.forEach((display, index) => {
        console.log(`    ${index + 1}. ${display.model || 'Unknown'}`);
        console.log(`       Resolution: ${display.currentResX}x${display.currentResY}`);
        console.log(`       Refresh Rate: ${display.currentRefreshRate} Hz`);
      });
    }
    console.log();
    
    console.log('System:');
    console.log(`  Manufacturer: ${systemInfo.system.manufacturer}`);
    console.log(`  Model: ${systemInfo.system.model}`);
    console.log(`  Virtual: ${systemInfo.system.virtual ? 'Yes' : 'No'}`);
    console.log();
    
    // Verify all required fields are present
    console.log('Validation:');
    console.log('===========\n');
    
    const validations = [
      { name: 'CPU info', valid: !!systemInfo.cpu && !!systemInfo.cpu.brand },
      { name: 'Memory info', valid: !!systemInfo.mem && systemInfo.mem.total > 0 },
      { name: 'OS info', valid: !!systemInfo.os && !!systemInfo.os.platform },
      { name: 'Graphics info', valid: !!systemInfo.graphics },
      { name: 'System info', valid: !!systemInfo.system }
    ];
    
    let allValid = true;
    validations.forEach(v => {
      const status = v.valid ? '✓' : '✗';
      console.log(`${status} ${v.name}: ${v.valid ? 'OK' : 'MISSING'}`);
      if (!v.valid) allValid = false;
    });
    
    console.log();
    
    if (allValid) {
      console.log('✓ All system information fields are properly populated');
      console.log('✓ System information is ready to be uploaded to the API');
    } else {
      console.log('✗ Some system information is missing');
    }
    
    // Show the JSON structure that would be sent to the API
    console.log('\nJSON Structure for API:');
    console.log('======================\n');
    console.log(JSON.stringify(systemInfo, null, 2));
    
  } catch (error) {
    console.error('✗ Failed to collect system information:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testSystemInfo();
