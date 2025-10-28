const path = require("path");
const fs = require("fs");
const { logger, logFunctionCall } = require("../logger.js");

const CLILogsTracker = require("./cli/index.cjs");
const FileTrackerManager = require("./files/manager.cjs");

// Simple JSONL utilities for CLI
const jsonl = {
  append: (filePath, data) => {
    const line = JSON.stringify(data) + '\n';
    fs.appendFileSync(filePath, line);
  },
  write: (directory, filename, data) => {
    const filePath = path.join(directory, filename);
    const content = data.map(item => JSON.stringify(item)).join('\n') + '\n';
    fs.writeFileSync(filePath, content);
    return filePath;
  }
};

/**
 * Trim logs to recording time range
 */
async function trimLogs(groupLogStatuses, startMS, endMS, clientStartDate, clipId) {
  const logExit = logFunctionCall('trimLogs');
  
  logger.debug("Trimming logs for recording", {
    clipId,
    startMS,
    endMS,
    clientStartDate,
    logsToTrim: groupLogStatuses.length
  });

  // Filter out logs with no events
  groupLogStatuses = groupLogStatuses.filter((status) => status.count > 0);

  for (const status of groupLogStatuses) {
    logger.debug("Processing log status", { 
      type: status.type,
      fileLocation: status.fileLocation,
      count: status.count 
    });

    if (!fs.existsSync(status.fileLocation)) {
      logger.warn("Log file not found, skipping", { fileLocation: status.fileLocation });
      continue;
    }

    const parsed = path.parse(status.fileLocation);
    const content = fs.readFileSync(status.fileLocation, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    const events = lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        logger.warn("Failed to parse log line", { line: line.substring(0, 100) });
        return null;
      }
    }).filter(Boolean);

    logger.debug("Parsed log events", { 
      originalLines: lines.length,
      parsedEvents: events.length,
      clientStartDate: typeof clientStartDate
    });

    // Convert to relative timestamps
    let relativeEvents = events.map((event) => {
      let eventTime = parseInt(event.time || event.timestamp || Date.now());
      
      // Convert to relative time
      eventTime = eventTime - startMS;
      
      // If timestamp is absolute, make it relative to recording start
      if (eventTime > 1_000_000_000_000) {
        eventTime = eventTime - clientStartDate;
      }
      
      return {
        ...event,
        time: eventTime
      };
    });

    const duration = endMS - startMS;
    
    // Filter events to recording duration
    let filteredEvents = relativeEvents;
    
    if (status.type === "cli") {
      // For CLI logs, filter by time range and anonymize file paths
      filteredEvents = relativeEvents.filter((event) => {
        return event.time >= 0 && event.time <= duration;
      });

      // Anonymize log file paths for privacy
      let fileMap = {};
      filteredEvents = filteredEvents.map((event) => {
        if (event.logFile) {
          let anonymizedName = fileMap[event.logFile] ?? Object.keys(fileMap).length + 1;
          if (!fileMap[event.logFile]) {
            fileMap[event.logFile] = anonymizedName;
          }
          return {
            ...event,
            logFile: anonymizedName,
          };
        }
        return event;
      });
    } else {
      // For other log types, just filter by time
      filteredEvents = relativeEvents.filter((event) => {
        return event.time >= 0 && event.time <= duration;
      });
    }

    logger.debug('Filtered events', {
      source: events.length,
      filtered: filteredEvents.length,
      difference: events.length - filteredEvents.length,
    });

    // Update status with filtered data
    status.count = filteredEvents.length;
    
    if (filteredEvents.length > 0) {
      // Create trimmed file in recording directory
      const trimmedFileName = `${clipId}_${parsed.base}`;
      const REPLAYS_DIR = path.dirname(status.fileLocation); // Use same directory
      status.trimmedFileLocation = jsonl.write(REPLAYS_DIR, trimmedFileName, filteredEvents);
      
      logger.debug("Created trimmed log file", {
        originalFile: status.fileLocation,
        trimmedFile: status.trimmedFileLocation,
        eventCount: filteredEvents.length
      });
    } else {
      logger.debug("No events in time range, no trimmed file created", {
        originalFile: status.fileLocation
      });
    }
  }

  logger.info("Log trimming completed", {
    clipId,
    processedLogs: groupLogStatuses.length,
    totalEvents: groupLogStatuses.reduce((sum, status) => sum + status.count, 0)
  });

  logExit();
  return groupLogStatuses;
}

class LogsTrackerManager {
  constructor() {
    this.instances = {};
    this.cliConfig = {};
    this.fileTrackerManager = new FileTrackerManager();
    
    logger.debug('Logs tracker manager initialized');
  }

  /**
   * Add a CLI log file to track
   */
  addCliLogFile(filePath) {
    const logExit = logFunctionCall('LogsTrackerManager.addCliLogFile');
    
    logger.info('Adding CLI log file to tracking', { filePath });
    
    if (!this.cliConfig[filePath]) {
      this.cliConfig[filePath] = true;
    }
    
    logExit();
  }

  /**
   * Remove a CLI log file from tracking
   */
  removeCliLogFile(filePath) {
    const logExit = logFunctionCall('LogsTrackerManager.removeCliLogFile');
    
    logger.info('Removing CLI log file from tracking', { filePath });
    
    if (this.cliConfig[filePath]) {
      delete this.cliConfig[filePath];
    }
    
    logExit();
  }

  /**
   * Start tracking for a new recording
   */
  async startNew({ recorderId, screenId, directory }) {
    const logExit = logFunctionCall('LogsTrackerManager.startNew');
    
    logger.info('Starting log tracking for recording', { 
      recorderId, 
      screenId, 
      directory,
      cliFiles: Object.keys(this.cliConfig).length
    });

    const cliTracker = new CLILogsTracker({
      directory,
      fileTrackerManager: this.fileTrackerManager,
      config: { ...this.cliConfig }, // Copy current config
    });

    this.instances[`${recorderId}_${screenId}`] = {
      recorderId,
      screenId,
      directory,
      trackers: {
        cli: cliTracker,
      },
      startTime: Date.now(),
      endTime: undefined,
    };

    logger.debug('Log tracking started', { 
      recorderId, 
      screenId,
      trackersCreated: Object.keys(this.instances[`${recorderId}_${screenId}`].trackers).length
    });
    
    logExit();
  }

  /**
   * Stop tracking for a recording
   */
  async stop({ recorderId, screenId }) {
    const logExit = logFunctionCall('LogsTrackerManager.stop');
    
    const instanceKey = `${recorderId}_${screenId}`;
    const instance = this.instances[instanceKey];
    
    if (!instance) {
      logger.warn('No log tracking instance found to stop', { recorderId, screenId });
      logExit();
      return [];
    }

    logger.info('Stopping log tracking for recording', { recorderId, screenId });

    delete this.instances[instanceKey];
    
    const results = Object.values(instance.trackers)
      .map((tracker) => tracker.destroy())
      .flat();

    logger.debug('Log tracking stopped', { 
      recorderId, 
      screenId,
      logsSummary: results.map(r => ({ type: r.type, count: r.count }))
    });
    
    logExit();
    return results;
  }

  /**
   * Stop all tracking instances
   */
  stopAll() {
    const logExit = logFunctionCall('LogsTrackerManager.stopAll');
    
    logger.info("Stopping all log tracking instances");
    
    const instanceKeys = Object.keys(this.instances);
    instanceKeys.forEach(key => {
      const [recorderId, screenId] = key.split('_');
      this.stop({ recorderId, screenId });
    });
    
    logExit();
  }

  /**
   * Get current tracking status
   */
  getStatus() {
    const logExit = logFunctionCall('LogsTrackerManager.getStatus');
    
    const activeInstances = Object.keys(this.instances).length;
    const cliFilesCount = Object.keys(this.cliConfig).length;
    const fileTrackerStats = this.fileTrackerManager.getAllStats();
    
    const status = {
      activeInstances,
      cliFilesCount,
      fileTrackerStats,
      totalEvents: fileTrackerStats.reduce((sum, stat) => sum + stat.count, 0)
    };
    
    logger.debug('Logs tracker manager status', status);
    
    logExit();
    return status;
  }

  /**
   * Cleanup all resources
   */
  destroy() {
    const logExit = logFunctionCall('LogsTrackerManager.destroy');
    
    logger.info('Destroying logs tracker manager');
    
    this.stopAll();
    this.fileTrackerManager.destroy();
    this.cliConfig = {};
    
    logExit();
  }
}

const logsTrackerManager = new LogsTrackerManager();

module.exports = {
  trimLogs,
  logsTrackerManager,
  CLILogsTracker,
  FileTrackerManager
};

// Also export as default for ES modules
module.exports.default = {
  trimLogs,
  logsTrackerManager,
  CLILogsTracker,
  FileTrackerManager
};
