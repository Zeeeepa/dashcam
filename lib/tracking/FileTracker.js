import { Tail } from 'tail';
import { logger } from '../logger.js';

export class FileTracker {
  constructor(trackedFile, callback) {
    this.trackedFile = trackedFile;
    this.callback = callback;
    this.tail = null;
    this.eventTimes = [];
    this.startTracking();
  }

  startTracking() {
    try {
      this.tail = new Tail(this.trackedFile);

      this.tail.on('line', (data) => {
        try {
          const event = JSON.parse(data);
          this.eventTimes.push(Date.now());
          this.callback(event);
        } catch (error) {
          logger.error(
            `Error parsing log line from "${this.trackedFile}": ${error.message}`,
            { data }
          );
        }
      });

      this.tail.on('error', (error) => {
        logger.error(
          `Error in file tracker for file "${this.trackedFile}": ${error.message}`
        );
      });

    } catch (error) {
      logger.error(`Failed to start tracking ${this.trackedFile}:`, error);
    }
  }

  getStats() {
    // Clean up old events (older than 1 minute)
    const now = Date.now();
    this.eventTimes = this.eventTimes.filter(time => (now - time) <= 60000);

    return {
      item: this.trackedFile,
      count: this.eventTimes.length
    };
  }

  destroy() {
    try {
      if (this.tail) {
        this.tail.unwatch();
        this.tail = null;
      }
      this.eventTimes = [];
    } catch (error) {
      logger.error(`Error destroying file tracker for ${this.trackedFile}:`, error);
    }
  }
}
