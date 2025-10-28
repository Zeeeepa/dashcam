const FileTracker = require("./tracker.cjs");
const { logger, logFunctionCall } = require("../../logger.js");

class FileTrackerManager {
  constructor() {
    this.byFilePath = {};
  }

  getStats(filePath) {
    const logExit = logFunctionCall('FileTrackerManager.getStats');
    
    if (!this.byFilePath[filePath]) {
      logExit();
      return { item: filePath, count: 0 };
    }
    
    const stats = this.byFilePath[filePath].tracker.getStats();
    logExit();
    return stats;
  }

  subscribe(filePath, callback) {
    const logExit = logFunctionCall('FileTrackerManager.subscribe');
    
    logger.debug('Subscribing to file tracking', { filePath });
    
    if (!this.byFilePath[filePath]) {
      logger.debug('Creating new file tracker', { filePath });
      
      this.byFilePath[filePath] = {
        callbacks: [],
        tracker: new FileTracker(filePath, (event) => {
          this.#sendEvent(filePath, event);
        }),
      };
    }
    
    this.byFilePath[filePath].callbacks.push(callback);
    
    logger.debug('File tracking subscription added', { 
      filePath, 
      totalCallbacks: this.byFilePath[filePath].callbacks.length 
    });
    
    logExit();
    return () => this.unsubscribe(filePath, callback);
  }

  unsubscribe(filePath, callback) {
    const logExit = logFunctionCall('FileTrackerManager.unsubscribe');
    
    if (!this.byFilePath[filePath]) {
      logger.debug('No tracker found for unsubscribe', { filePath });
      logExit();
      return;
    }
    
    this.byFilePath[filePath].callbacks = this.byFilePath[
      filePath
    ].callbacks.filter((cb) => cb !== callback);

    logger.debug('Callback removed from file tracker', { 
      filePath, 
      remainingCallbacks: this.byFilePath[filePath].callbacks.length 
    });

    if (this.byFilePath[filePath].callbacks.length === 0) {
      logger.debug('No more callbacks, destroying file tracker', { filePath });
      
      this.byFilePath[filePath].tracker.destroy();
      delete this.byFilePath[filePath];
    }
    
    logExit();
  }

  #sendEvent(filePath, event) {
    if (!this.byFilePath[filePath]) return;

    logger.silly('Sending file tracker event', { 
      filePath, 
      eventType: event.type || 'unknown',
      callbackCount: this.byFilePath[filePath].callbacks.length
    });

    for (const callback of this.byFilePath[filePath].callbacks) {
      try {
        callback(event);
      } catch (error) {
        logger.error('Failed sending FileTracker event', {
          filePath,
          event: event.type || 'unknown',
          error: error.message
        });
      }
    }
  }

  /**
   * Get status of all tracked files
   */
  getAllStats() {
    const logExit = logFunctionCall('FileTrackerManager.getAllStats');
    
    const stats = Object.keys(this.byFilePath).map(filePath => ({
      filePath,
      ...this.getStats(filePath),
      callbackCount: this.byFilePath[filePath].callbacks.length
    }));
    
    logger.debug('File tracker manager stats', { 
      totalFiles: stats.length,
      totalEvents: stats.reduce((sum, stat) => sum + stat.count, 0)
    });
    
    logExit();
    return stats;
  }

  /**
   * Cleanup all trackers
   */
  destroy() {
    const logExit = logFunctionCall('FileTrackerManager.destroy');
    
    logger.info('Destroying all file trackers');
    
    const filePaths = Object.keys(this.byFilePath);
    filePaths.forEach(filePath => {
      this.byFilePath[filePath].tracker.destroy();
      delete this.byFilePath[filePath];
    });
    
    logger.debug('All file trackers destroyed', { destroyedCount: filePaths.length });
    
    logExit();
  }
}

module.exports = FileTrackerManager;
