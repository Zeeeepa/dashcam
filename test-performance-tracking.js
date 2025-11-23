#!/usr/bin/env node

/**
 * Test script to verify performance tracking during recording
 */

import { startRecording, stopRecording } from './lib/recorder.js';
import { logger, setVerbose } from './lib/logger.js';
import fs from 'fs';

// Enable verbose logging
setVerbose(true);

async function testPerformanceTracking() {
  try {
    logger.info('Starting performance tracking test...');
    
    // Start recording
    logger.info('Starting recording...');
    const startResult = await startRecording({
      fps: 10,
      includeAudio: false
    });
    
    logger.info('Recording started', {
      outputPath: startResult.outputPath,
      startTime: startResult.startTime
    });
    
    // Record for 10 seconds
    logger.info('Recording for 10 seconds...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Stop recording
    logger.info('Stopping recording...');
    const result = await stopRecording();
    
    logger.info('Recording stopped successfully');
    
    // Display performance results
    if (result.performance) {
      logger.info('=== Performance Tracking Results ===');
      
      if (result.performance.summary) {
        const summary = result.performance.summary;
        logger.info('Summary Statistics:');
        logger.info(`  Duration: ${(summary.durationMs / 1000).toFixed(1)}s`);
        logger.info(`  Sample Count: ${summary.sampleCount}`);
        logger.info(`  Monitor Interval: ${summary.monitorInterval}ms`);
        logger.info('');
        logger.info('Process Metrics:');
        logger.info(`  Average CPU: ${summary.avgProcessCPU.toFixed(1)}%`);
        logger.info(`  Max CPU: ${summary.maxProcessCPU.toFixed(1)}%`);
        logger.info(`  Average Memory: ${summary.avgProcessMemoryMB.toFixed(1)} MB`);
        logger.info(`  Max Memory: ${summary.maxProcessMemoryMB.toFixed(1)} MB`);
        logger.info('');
        logger.info('System Metrics:');
        logger.info(`  Average System Memory Usage: ${summary.avgSystemMemoryUsagePercent.toFixed(1)}%`);
        logger.info(`  Max System Memory Usage: ${summary.maxSystemMemoryUsagePercent.toFixed(1)}%`);
        logger.info(`  Total System Memory: ${summary.totalSystemMemoryGB.toFixed(2)} GB`);
      }
      
      if (result.performance.samples && result.performance.samples.length > 0) {
        logger.info('');
        logger.info(`Collected ${result.performance.samples.length} performance samples`);
        
        // Show top processes from the last sample
        const lastSample = result.performance.samples[result.performance.samples.length - 1];
        if (lastSample.topProcesses && lastSample.topProcesses.length > 0) {
          logger.info('');
          logger.info('Top 10 Processes (from last sample):');
          lastSample.topProcesses.forEach((proc, index) => {
            logger.info(`  ${index + 1}. ${proc.name} (PID: ${proc.pid})`);
            logger.info(`     CPU: ${proc.cpu.toFixed(1)}%, Memory: ${(proc.memory / (1024 * 1024)).toFixed(1)} MB`);
          });
          logger.info(`Total processes on system: ${lastSample.totalProcesses}`);
        }
      }
    } else {
      logger.warn('No performance data in result');
    }
    
    // Display other results
    logger.info('');
    logger.info('=== Recording Results ===');
    logger.info(`Output: ${result.outputPath}`);
    logger.info(`Duration: ${result.duration}ms`);
    logger.info(`File Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
    logger.info(`Apps Tracked: ${result.apps?.length || 0}`);
    logger.info(`Log Events: ${result.logs?.reduce((sum, log) => sum + log.count, 0) || 0}`);
    
    // Verify file exists
    if (fs.existsSync(result.outputPath)) {
      logger.info('Recording file created successfully');
    } else {
      logger.error('Recording file not found!');
    }
    
    logger.info('Test completed successfully!');
    
  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testPerformanceTracking();
