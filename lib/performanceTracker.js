import os from 'os';
import { logger } from './logger.js';
import pidusage from 'pidusage';
import psList from 'ps-list';
import fs from 'fs';
import path from 'path';

/**
 * Tracks CPU and memory usage during recording
 */
class PerformanceTracker {
  constructor() {
    this.interval = null;
    this.samples = [];
    this.startTime = null;
    this.pid = process.pid;
    this.monitorInterval = 5000; // Sample every 5 seconds
    this.lastNetworkStats = null; // Track previous network stats for delta calculation
    this.performanceFile = null; // Path to performance data file
  }

  /**
   * Get network I/O statistics
   */
  async getNetworkMetrics() {
    try {
      const networkInterfaces = os.networkInterfaces();
      
      // Get network stats using os module (basic approach)
      // On macOS/Linux we can read from /proc/net/dev or use system commands
      let totalBytesReceived = 0;
      let totalBytesSent = 0;
      
      if (process.platform === 'darwin') {
        // macOS - use netstat command
        const { execSync } = await import('child_process');
        try {
          const output = execSync('netstat -ib', { encoding: 'utf8', timeout: 1000 });
          const lines = output.split('\n');
          
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 7 && parts[0] !== 'Name') {
              const ibytes = parseInt(parts[6]) || 0;
              const obytes = parseInt(parts[9]) || 0;
              totalBytesReceived += ibytes;
              totalBytesSent += obytes;
            }
          }
        } catch (error) {
          logger.debug('Failed to get network stats from netstat', { error: error.message });
        }
      } else if (process.platform === 'linux') {
        // Linux - read from /proc/net/dev
        const fs = await import('fs');
        try {
          const netDev = fs.readFileSync('/proc/net/dev', 'utf8');
          const lines = netDev.split('\n');
          
          for (const line of lines) {
            if (line.includes(':')) {
              const parts = line.split(':')[1].trim().split(/\s+/);
              if (parts.length >= 9) {
                totalBytesReceived += parseInt(parts[0]) || 0;
                totalBytesSent += parseInt(parts[8]) || 0;
              }
            }
          }
        } catch (error) {
          logger.debug('Failed to read /proc/net/dev', { error: error.message });
        }
      }
      
      const currentStats = {
        bytesReceived: totalBytesReceived,
        bytesSent: totalBytesSent,
        timestamp: Date.now()
      };
      
      // Calculate deltas (bytes per second)
      let bytesReceivedPerSec = 0;
      let bytesSentPerSec = 0;
      
      if (this.lastNetworkStats) {
        const timeDelta = (currentStats.timestamp - this.lastNetworkStats.timestamp) / 1000; // seconds
        if (timeDelta > 0) {
          bytesReceivedPerSec = (currentStats.bytesReceived - this.lastNetworkStats.bytesReceived) / timeDelta;
          bytesSentPerSec = (currentStats.bytesSent - this.lastNetworkStats.bytesSent) / timeDelta;
        }
      }
      
      this.lastNetworkStats = currentStats;
      
      return {
        network: {
          bytesReceived: currentStats.bytesReceived,
          bytesSent: currentStats.bytesSent,
          bytesReceivedPerSec,
          bytesSentPerSec,
          mbReceivedPerSec: bytesReceivedPerSec / (1024 * 1024),
          mbSentPerSec: bytesSentPerSec / (1024 * 1024)
        }
      };
    } catch (error) {
      logger.warn('Failed to get network metrics', { error: error.message });
      return {
        network: {
          bytesReceived: 0,
          bytesSent: 0,
          bytesReceivedPerSec: 0,
          bytesSentPerSec: 0,
          mbReceivedPerSec: 0,
          mbSentPerSec: 0
        }
      };
    }
  }

  /**
   * Get current system-wide CPU and memory metrics
   */
  async getSystemMetrics() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    // Get CPU info
    const cpus = os.cpus();
    
    // Calculate average CPU usage across all cores
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });
    
    return {
      system: {
        totalMemory: totalMem,
        freeMemory: freeMem,
        usedMemory: usedMem,
        memoryUsagePercent: (usedMem / totalMem) * 100,
        cpuCount: cpus.length,
        totalIdle,
        totalTick
      }
    };
  }

  /**
   * Get process-specific CPU and memory metrics
   */
  async getProcessMetrics() {
    try {
      const stats = await pidusage(this.pid);
      return {
        process: {
          cpu: stats.cpu, // CPU usage percentage
          memory: stats.memory, // Memory in bytes
          ppid: stats.ppid,
          pid: stats.pid,
          ctime: stats.ctime,
          elapsed: stats.elapsed,
          timestamp: stats.timestamp
        }
      };
    } catch (error) {
      logger.warn('Failed to get process metrics', { error: error.message });
      return {
        process: {
          cpu: 0,
          memory: 0,
          pid: this.pid
        }
      };
    }
  }

  /**
   * Get top processes by CPU and memory usage (lightweight version)
   */
  async getTopProcesses() {
    // Skip this expensive operation to reduce overhead
    // Getting all processes and detailed stats is too CPU intensive during recording
    return {
      topProcesses: [],
      totalProcesses: 0
    };
  }

  /**
   * Collect a performance sample (lightweight version)
   */
  async collectSample() {
    const timestamp = Date.now();
    const elapsedMs = this.startTime ? timestamp - this.startTime : 0;
    
    try {
      // Only collect essential metrics to minimize overhead
      const [systemMetrics, processMetrics, networkMetrics] = await Promise.all([
        this.getSystemMetrics(),
        this.getProcessMetrics(),
        this.getNetworkMetrics()
      ]);
      
      const sample = {
        timestamp,
        elapsedMs,
        ...systemMetrics,
        ...processMetrics,
        ...networkMetrics,
        topProcesses: [], // Skip expensive process enumeration
        totalProcesses: 0
      };
      
      this.samples.push(sample);
      
      // Save sample to file immediately
      if (this.performanceFile) {
        try {
          fs.appendFileSync(this.performanceFile, JSON.stringify(sample) + '\n');
        } catch (error) {
          logger.warn('Failed to write performance sample to file', { error: error.message });
        }
      }
      
      // Log sample in verbose mode
      logger.verbose('Performance sample collected', {
        elapsedSeconds: (elapsedMs / 1000).toFixed(1),
        systemMemoryUsage: `${sample.system.memoryUsagePercent.toFixed(1)}%`,
        processMemoryMB: (sample.process.memory / (1024 * 1024)).toFixed(1),
        processCPU: `${sample.process.cpu.toFixed(1)}%`,
        networkIn: `${sample.network.mbReceivedPerSec.toFixed(2)} MB/s`,
        networkOut: `${sample.network.mbSentPerSec.toFixed(2)} MB/s`
      });
      
    } catch (error) {
      logger.warn('Failed to collect performance sample', { error: error.message });
    }
  }

  /**
   * Start tracking performance - lightweight version with system metrics only
   */
  start(outputDir = null) {
    if (this.interval) {
      logger.warn('Performance tracking already started');
      return;
    }
    
    this.startTime = Date.now();
    this.samples = [];
    
    // Set up performance data file
    if (outputDir) {
      this.performanceFile = path.join(outputDir, 'performance.jsonl');
      // Clear any existing file
      try {
        if (fs.existsSync(this.performanceFile)) {
          fs.unlinkSync(this.performanceFile);
        }
      } catch (error) {
        logger.warn('Failed to clear performance file', { error: error.message });
      }
    }
    
    logger.info('Starting performance tracking (system metrics only)', { 
      pid: this.pid,
      monitorInterval: this.monitorInterval,
      performanceFile: this.performanceFile
    });
    
    // Collect initial sample
    this.collectSample();
    
    // Start periodic collection every 5 seconds
    this.interval = setInterval(() => {
      this.collectSample();
    }, this.monitorInterval);
  }

  /**
   * Stop tracking and return summary
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    // If we have a performance file, read all samples from it
    if (this.performanceFile && fs.existsSync(this.performanceFile)) {
      try {
        const fileContent = fs.readFileSync(this.performanceFile, 'utf8');
        const lines = fileContent.trim().split('\n').filter(line => line.length > 0);
        this.samples = lines.map(line => JSON.parse(line));
        logger.info('Loaded performance samples from file', { 
          sampleCount: this.samples.length,
          file: this.performanceFile
        });
      } catch (error) {
        logger.warn('Failed to read performance samples from file', { error: error.message });
      }
    }
    
    if (this.samples.length === 0) {
      logger.warn('No performance samples collected');
      return {
        samples: [],
        summary: null
      };
    }
    
    // Calculate summary statistics
    const summary = this.calculateSummary();
    
    logger.info('Performance tracking stopped', {
      totalSamples: this.samples.length,
      duration: summary.durationMs,
      avgProcessCPU: `${summary.avgProcessCPU.toFixed(1)}%`,
      avgProcessMemoryMB: summary.avgProcessMemoryMB.toFixed(1),
      maxProcessCPU: `${summary.maxProcessCPU.toFixed(1)}%`,
      maxProcessMemoryMB: summary.maxProcessMemoryMB.toFixed(1)
    });
    
    const result = {
      samples: this.samples,
      summary
    };
    
    // Clean up performance file
    if (this.performanceFile && fs.existsSync(this.performanceFile)) {
      try {
        fs.unlinkSync(this.performanceFile);
      } catch (error) {
        logger.debug('Failed to delete performance file', { error: error.message });
      }
    }
    
    // Reset
    this.samples = [];
    this.startTime = null;
    this.performanceFile = null;
    
    return result;
  }

  /**
   * Calculate summary statistics from samples
   */
  calculateSummary() {
    if (this.samples.length === 0) {
      return null;
    }
    
    const firstSample = this.samples[0];
    const lastSample = this.samples[this.samples.length - 1];
    
    // Calculate averages and max values
    let totalProcessCPU = 0;
    let totalProcessMemory = 0;
    let totalSystemMemoryUsage = 0;
    let maxProcessCPU = 0;
    let maxProcessMemory = 0;
    let maxSystemMemoryUsage = 0;
    
    this.samples.forEach(sample => {
      const processCPU = sample.process.cpu || 0;
      const processMemory = sample.process.memory || 0;
      const systemMemoryUsage = sample.system.memoryUsagePercent || 0;
      
      totalProcessCPU += processCPU;
      totalProcessMemory += processMemory;
      totalSystemMemoryUsage += systemMemoryUsage;
      
      maxProcessCPU = Math.max(maxProcessCPU, processCPU);
      maxProcessMemory = Math.max(maxProcessMemory, processMemory);
      maxSystemMemoryUsage = Math.max(maxSystemMemoryUsage, systemMemoryUsage);
    });
    
    const count = this.samples.length;
    
    // Calculate network totals from last sample
    const finalSample = this.samples[this.samples.length - 1];
    const totalBytesReceived = finalSample.network?.bytesReceived || 0;
    const totalBytesSent = finalSample.network?.bytesSent || 0;
    
    return {
      durationMs: lastSample.timestamp - firstSample.timestamp,
      sampleCount: count,
      monitorInterval: this.monitorInterval,
      // Process metrics
      avgProcessCPU: totalProcessCPU / count,
      maxProcessCPU,
      avgProcessMemoryBytes: totalProcessMemory / count,
      avgProcessMemoryMB: (totalProcessMemory / count) / (1024 * 1024),
      maxProcessMemoryBytes: maxProcessMemory,
      maxProcessMemoryMB: maxProcessMemory / (1024 * 1024),
      // System metrics
      avgSystemMemoryUsagePercent: totalSystemMemoryUsage / count,
      maxSystemMemoryUsagePercent: maxSystemMemoryUsage,
      totalSystemMemoryBytes: firstSample.system.totalMemory,
      totalSystemMemoryGB: firstSample.system.totalMemory / (1024 * 1024 * 1024),
      // Network metrics
      totalBytesReceived,
      totalBytesSent,
      totalMBReceived: totalBytesReceived / (1024 * 1024),
      totalMBSent: totalBytesSent / (1024 * 1024)
    };
  }

  /**
   * Check if tracking is active
   */
  isTracking() {
    return this.interval !== null;
  }
}

// Create singleton instance
const performanceTracker = new PerformanceTracker();

export { performanceTracker, PerformanceTracker };
