import path from "path";
import fs from "fs";
import { logger, logFunctionCall } from "../../logger.js";

// Simple JSONL utilities for CLI
const jsonl = {
  append: (filePath, data) => {
    const line = JSON.stringify(data) + '\n';
    fs.appendFileSync(filePath, line);
  },
  write: (directory, filename, data) => {
    const filePath = path.join(directory, filename);
    const content = data.map(item => JSON.stringify(item)).join('\n');
    fs.writeFileSync(filePath, content);
    return filePath;
  }
};

const namespace = 'dashcam_cli_logs';
const filename = `${namespace}.jsonl`;

class CLILogsTracker {
  constructor({ config, directory, fileTrackerManager }) {
    this.files = {};
    this.fileIndex = 0;
    this.fileToIndex = {};
    this.config = config || {};
    this.isWatchOnly = !directory;
    this.fileTrackerManager = fileTrackerManager;
    this.fileLocation = this.isWatchOnly ? "" : path.join(directory, filename);
    
    logger.debug('CLI logs tracker initialized', {
      isWatchOnly: this.isWatchOnly,
      fileLocation: this.fileLocation,
      configuredFiles: Object.keys(this.config).length
    });
    
    this.startTracking();
  }

  startTracking() {
    const logExit = logFunctionCall('CLILogsTracker.startTracking');
    
    const filePaths = Object.keys(this.config);
    logger.debug('Starting CLI log tracking', { filePaths });
    
    filePaths.forEach((filePath) => this.#startFileTracker(filePath));
    
    logExit();
  }

  #startFileTracker(filePath) {
    const logExit = logFunctionCall('CLILogsTracker.#startFileTracker');
    
    if (this.files[filePath]) {
      logger.debug('File tracker already exists', { filePath });
      logExit();
      return;
    }

    // Check if file exists before tracking
    if (!fs.existsSync(filePath)) {
      logger.warn('Log file does not exist, skipping', { filePath });
      logExit();
      return;
    }

    const index = ++this.fileIndex;
    this.fileToIndex[filePath] = index;
    
    const status = {
      item: index,
      count: 0,
    };
    
    const callback = (event) => {
      if (!this.fileLocation) return;
      
      // Add CLI-specific metadata
      const cliEvent = {
        ...event,
        logFile: index,
        originalFile: filePath,
        trackedAt: Date.now()
      };
      
      jsonl.append(this.fileLocation, cliEvent);
      status.count++;
      
      logger.silly('CLI log event tracked', { 
        filePath, 
        index, 
        eventType: event.type || 'unknown' 
      });
    };

    logger.debug('Starting file tracker for CLI log', { filePath, index });

    this.files[filePath] = {
      status,
      unsubscribe: this.fileTrackerManager.subscribe(filePath, callback),
    };
    
    logExit();
  }

  #stopFileTracker(filePath) {
    const logExit = logFunctionCall('CLILogsTracker.#stopFileTracker');
    
    const unsubscribe = this.files[filePath]?.unsubscribe;
    if (unsubscribe) {
      logger.debug('Stopping file tracker for CLI log', { filePath });
      
      delete this.fileToIndex[filePath];
      unsubscribe();
      delete this.files[filePath];
    }
    
    logExit();
  }

  /**
   * Add a new file to track
   */
  addFile(filePath) {
    const logExit = logFunctionCall('CLILogsTracker.addFile');
    
    logger.debug('Adding file to CLI log tracking', { filePath });
    
    this.config[filePath] = true;
    this.#startFileTracker(filePath);
    
    logExit();
  }

  /**
   * Remove a file from tracking
   */
  removeFile(filePath) {
    const logExit = logFunctionCall('CLILogsTracker.removeFile');
    
    logger.debug('Removing file from CLI log tracking', { filePath });
    
    if (this.config[filePath]) {
      delete this.config[filePath];
    }
    this.#stopFileTracker(filePath);
    
    logExit();
  }

  getStatus() {
    const logExit = logFunctionCall('CLILogsTracker.getStatus');
    
    let items = [];
    if (this.isWatchOnly) {
      items = Object.keys(this.files).map((filePath) => ({
        ...this.fileTrackerManager.getStats(filePath),
        item: this.fileToIndex[filePath],
      }));
    } else {
      items = Object.values(this.files).map(({ status }) => status);
    }

    const totalCount = items.reduce((acc, status) => acc + status.count, 0);

    const status = [
      {
        id: "CLI",
        name: "CLI Logs",
        type: "cli",
        fileLocation: this.fileLocation,
        items: items,
        count: totalCount,
        trackedFiles: Object.keys(this.files).length
      },
    ];
    
    logger.debug('CLI logs tracker status', { 
      totalCount, 
      trackedFiles: Object.keys(this.files).length 
    });
    
    logExit();
    return status;
  }

  destroy() {
    const logExit = logFunctionCall('CLILogsTracker.destroy');
    
    logger.info('Destroying CLI logs tracker');
    
    const status = this.getStatus();
    for (const filePath of Object.keys(this.files)) {
      this.#stopFileTracker(filePath);
    }
    
    logger.debug('CLI logs tracker destroyed', { 
      finalStatus: status[0]?.count || 0 
    });
    
    logExit();
    return status;
  }
}

export default CLILogsTracker;
