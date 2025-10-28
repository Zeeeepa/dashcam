import { logger } from '../logger.js';
import { FileTracker } from './FileTracker.js';

export class FileTrackerManager {
  constructor() {
    this.byFilePath = {};
  }

  getStats(filePath) {
    if (!this.byFilePath[filePath]) {
      return { item: filePath, count: 0 };
    }
    return this.byFilePath[filePath].tracker.getStats();
  }

  subscribe(filePath, callback) {
    if (!this.byFilePath[filePath]) {
      this.byFilePath[filePath] = {
        callbacks: [],
        tracker: new FileTracker(filePath, (event) => {
          this.#sendEvent(filePath, event);
        })
      };
    }
    this.byFilePath[filePath].callbacks.push(callback);
    return () => this.unsubscribe(filePath, callback);
  }

  unsubscribe(filePath, callback) {
    if (!this.byFilePath[filePath]) return;
    
    this.byFilePath[filePath].callbacks = this.byFilePath[filePath].callbacks
      .filter(cb => cb !== callback);

    if (this.byFilePath[filePath].callbacks.length === 0) {
      this.byFilePath[filePath].tracker.destroy();
      delete this.byFilePath[filePath];
    }
  }

  #sendEvent(filePath, event) {
    if (!this.byFilePath[filePath]) return;

    for (const callback of this.byFilePath[filePath].callbacks) {
      try {
        callback(event);
      } catch (error) {
        logger.error(
          "Failed sending FileTracker event",
          { event, filePath, error }
        );
      }
    }
  }

  destroy() {
    for (const filePath of Object.keys(this.byFilePath)) {
      this.byFilePath[filePath].tracker.destroy();
    }
    this.byFilePath = {};
  }
}
