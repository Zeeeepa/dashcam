#!/usr/bin/env node

/**
 * Linux-specific performance tracking test
 * Tests each component individually to identify issues
 */

import { performanceTracker } from './lib/performanceTracker.js';
import { getTopProcesses } from './lib/topProcesses.js';
import { logger, setVerbose } from './lib/logger.js';
import pidusage from 'pidusage';
import os from 'os';
import fs from 'fs';

// Enable verbose logging
setVerbose(true);

async function testPidUsage() {
  logger.info('=== Testing pidusage ===');
  try {
    const stats = await pidusage(process.pid);
    logger.info('pidusage SUCCESS', {
      cpu: stats.cpu?.toFixed(2),
      memory: (stats.memory / (1024 * 1024)).toFixed(1) + ' MB',
      pid: stats.pid,
      ppid: stats.ppid
    });
    return true;
  } catch (error) {
    logger.error('pidusage FAILED', { error: error.message, stack: error.stack });
    return false;
  }
}

async function testTopProcesses() {
  logger.info('=== Testing getTopProcesses ===');
  try {
    const topProcs = await getTopProcesses(5);
    logger.info('getTopProcesses SUCCESS', {
      count: topProcs.length,
      processes: topProcs.map(p => `${p.name} (PID: ${p.pid}, CPU: ${p.cpu}%)`)
    });
    return topProcs.length > 0;
  } catch (error) {
    logger.error('getTopProcesses FAILED', { error: error.message, stack: error.stack });
    return false;
  }
}

async function testNetworkMetrics() {
  logger.info('=== Testing Network Metrics ===');
  try {
    if (process.platform === 'linux') {
      // Test /proc/net/dev reading
      if (fs.existsSync('/proc/net/dev')) {
        const content = fs.readFileSync('/proc/net/dev', 'utf8');
        const lines = content.split('\n');
        let totalRx = 0;
        let totalTx = 0;
        
        logger.info('/proc/net/dev file found');
        logger.debug('First few lines:', lines.slice(0, 5));
        
        for (const line of lines) {
          if (line.includes(':')) {
            const parts = line.split(':')[1].trim().split(/\s+/);
            if (parts.length >= 9) {
              const rx = parseInt(parts[0]) || 0;
              const tx = parseInt(parts[8]) || 0;
              totalRx += rx;
              totalTx += tx;
            }
          }
        }
        
        logger.info('Network stats parsed', {
          totalRx: (totalRx / (1024 * 1024)).toFixed(2) + ' MB',
          totalTx: (totalTx / (1024 * 1024)).toFixed(2) + ' MB'
        });
        return true;
      } else {
        logger.warn('/proc/net/dev not found - running in container?');
        return false;
      }
    } else {
      logger.info('Skipping network test (not Linux)');
      return true;
    }
  } catch (error) {
    logger.error('Network metrics FAILED', { error: error.message, stack: error.stack });
    return false;
  }
}

async function testSystemMetrics() {
  logger.info('=== Testing System Metrics ===');
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpus = os.cpus();
    
    logger.info('System metrics SUCCESS', {
      totalMemory: (totalMem / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
      freeMemory: (freeMem / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
      usedMemory: (usedMem / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
      memoryUsagePercent: ((usedMem / totalMem) * 100).toFixed(1) + '%',
      cpuCount: cpus.length,
      platform: os.platform(),
      arch: os.arch()
    });
    return true;
  } catch (error) {
    logger.error('System metrics FAILED', { error: error.message });
    return false;
  }
}

async function testPerformanceTracker() {
  logger.info('=== Testing PerformanceTracker ===');
  try {
    logger.info('Starting performance tracker for 10 seconds...');
    
    // Use temp directory for performance file
    const tmpDir = os.tmpdir();
    performanceTracker.start(tmpDir);
    
    // Wait 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Stop tracking
    const result = performanceTracker.stop();
    
    logger.info('PerformanceTracker stopped', {
      sampleCount: result.samples?.length || 0,
      hasSummary: !!result.summary
    });
    
    if (result.summary) {
      logger.info('Performance Summary', {
        duration: (result.summary.durationMs / 1000).toFixed(1) + 's',
        avgCPU: result.summary.avgProcessCPU?.toFixed(1) + '%',
        maxCPU: result.summary.maxProcessCPU?.toFixed(1) + '%',
        avgMemory: result.summary.avgProcessMemoryMB?.toFixed(1) + ' MB',
        maxMemory: result.summary.maxProcessMemoryMB?.toFixed(1) + ' MB'
      });
    }
    
    if (result.samples && result.samples.length > 0) {
      const lastSample = result.samples[result.samples.length - 1];
      logger.info('Last sample data', {
        hasSystem: !!lastSample.system,
        hasProcess: !!lastSample.process,
        hasNetwork: !!lastSample.network,
        hasTopProcesses: !!lastSample.topProcesses,
        topProcessesCount: lastSample.topProcesses?.length || 0
      });
      
      if (lastSample.topProcesses && lastSample.topProcesses.length > 0) {
        logger.info('Top 3 processes from last sample:');
        lastSample.topProcesses.slice(0, 3).forEach((proc, i) => {
          logger.info(`  ${i + 1}. ${proc.name} - CPU: ${proc.cpu?.toFixed(1)}%, Mem: ${(proc.memory / (1024 * 1024)).toFixed(1)} MB`);
        });
      }
    }
    
    // Clean up
    performanceTracker.cleanup();
    
    return result.samples && result.samples.length > 0;
  } catch (error) {
    logger.error('PerformanceTracker FAILED', { error: error.message, stack: error.stack });
    return false;
  }
}

async function runAllTests() {
  logger.info('Starting Linux Performance Tracking Tests');
  logger.info('Platform:', os.platform());
  logger.info('Architecture:', os.arch());
  logger.info('Node version:', process.version);
  logger.info('');
  
  const results = {
    pidusage: await testPidUsage(),
    topProcesses: await testTopProcesses(),
    networkMetrics: await testNetworkMetrics(),
    systemMetrics: await testSystemMetrics(),
    performanceTracker: await testPerformanceTracker()
  };
  
  logger.info('');
  logger.info('=== Test Results Summary ===');
  Object.entries(results).forEach(([test, passed]) => {
    logger.info(`${test}: ${passed ? '✓ PASS' : '✗ FAIL'}`);
  });
  
  const allPassed = Object.values(results).every(r => r);
  logger.info('');
  logger.info(`Overall: ${allPassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}`);
  
  process.exit(allPassed ? 0 : 1);
}

runAllTests().catch(error => {
  logger.error('Test suite failed', { error: error.message, stack: error.stack });
  process.exit(1);
});
