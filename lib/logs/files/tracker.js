import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { Tail } from "tail";
import { logger, logFunctionCall } from "../../logger.js";

class FileTracker {
  constructor(trackedFile, callback) {
    this.trackedFile = trackedFile;
    this.callback = callback;
    this.tail = null;
    this.eventTimes = [];
    this.totalEvents = 0;
    this.startTracking();
  }

  startTracking() {
    const logExit = logFunctionCall('FileTracker.startTracking');
    
    try {
      logger.debug('Starting file tracking', { file: this.trackedFile });
      
      this.tail = new Tail(this.trackedFile, {
        follow: true,
        logger: logger
      });

      this.tail.on('line', (data) => {
        try {
          // Try to parse as JSON first
          let event;
          try {
            event = JSON.parse(data);
          } catch {
            // If not JSON, create a simple event object
            event = {
              message: data,
              timestamp: Date.now(),
              raw: true
            };
          }
          
          // Add tracking metadata
          event.trackedFile = this.trackedFile;
          event.time = event.time || Date.now();
          
          this.eventTimes.push(Date.now());
          this.totalEvents++;
          this.callback(event);
          
          logger.silly('File event processed', { 
            file: this.trackedFile,
            eventType: event.type || 'unknown',
            totalEvents: this.totalEvents
          });
        } catch (error) {
          logger.error('Error processing log line', {
            file: this.trackedFile,
            error: error.message,
            data: data?.substring(0, 100) // Log first 100 chars for debugging
          });
        }
      });

      this.tail.on('error', (error) => {
        logger.error('File tracker error', {
          file: this.trackedFile,
          error: error.message
        });
      });

      logger.debug('File tracking started successfully', { file: this.trackedFile });
    } catch (error) {
      logger.error('Failed to start file tracking', { 
        file: this.trackedFile,
        error: error.message 
      });
    }
    
    logExit();
  }

  getStats() {
    // Clean up old events (older than 1 minute)
    const now = Date.now();
    this.eventTimes = this.eventTimes.filter(time => (now - time) <= 60000);

    return {
      item: this.trackedFile,
      count: this.eventTimes.length, // Events in last minute
      totalEvents: this.totalEvents,  // Total events since start
      isActive: !!this.tail
    };
  }

  destroy() {
    const logExit = logFunctionCall('FileTracker.destroy');
    
    try {
      logger.debug('Destroying file tracker', { file: this.trackedFile });
      
      if (this.tail) {
        this.tail.unwatch();
        this.tail = null;
      }
      this.eventTimes = [];
      
      logger.debug('File tracker destroyed', { 
        file: this.trackedFile,
        totalEventsProcessed: this.totalEvents
      });
    } catch (error) {
      logger.error('Error destroying file tracker', { 
        file: this.trackedFile,
        error: error.message 
      });
    }
    
    logExit();
  }
}

export default FileTracker;
