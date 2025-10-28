const { logger, logFunctionCall } = require("../logger.js");

// Simple idle tracker for CLI (without Electron powerMonitor)
// This is a simplified version that doesn't track system idle time
// since that requires platform-specific system calls

class IdleTracker {
  constructor() {
    this.stopped = true;
    this.interval = null;
    this.callbacks = [];
  }

  start() {
    const logExit = logFunctionCall('IdleTracker.start');
    
    logger.debug("idle.js starting idle tracker");

    if (this.stopped) {
      // For CLI, we'll just emit 0 idle time since we don't have system access
      // This could be enhanced with platform-specific idle detection in the future
      this.interval = setInterval(() => {
        if (!this.stopped) {
          // Always report 0 idle time for CLI
          const idleTimeMs = 0;
          
          // Call any registered callbacks
          this.callbacks.forEach(callback => {
            try {
              callback(idleTimeMs);
            } catch (error) {
              logger.warn("Error in idle callback", { error: error.message });
            }
          });
        } else {
          clearInterval(this.interval);
        }
      }, 1000);
      
      this.stopped = false;
      logger.debug("Idle tracker started");
    } else {
      logger.debug("idle.js idle already started");
    }
    
    logExit();
  }

  stop() {
    const logExit = logFunctionCall('IdleTracker.stop');
    
    logger.debug("idle.js stopping idle tracker");
    
    clearInterval(this.interval);
    this.stopped = true;
    this.callbacks = [];
    
    logExit();
  }

  onIdleTime(callback) {
    this.callbacks.push(callback);
  }

  removeCallback(callback) {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
  }
}

// Create singleton instance
const idleTracker = new IdleTracker();

module.exports = () => {
  return {
    start: () => idleTracker.start(),
    stop: () => idleTracker.stop(),
    onIdleTime: (callback) => idleTracker.onIdleTime(callback)
  };
};
