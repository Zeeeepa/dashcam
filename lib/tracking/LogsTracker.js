import path from 'path';
import fs from 'fs';
import { logger } from '../logger.js';
import { FileTrackerManager } from './FileTrackerManager.js';

export class LogsTracker {
  constructor() {
    this.fileTrackerManager = new FileTrackerManager();
    this.trackedFiles = new Map();
    this.recordingPath = null;
    this.trackedFilesIndex = 0;
    this.fileToIndex = {};
  }

  startTracking(filePath) {
    if (this.trackedFiles.has(filePath)) return;

    const index = ++this.trackedFilesIndex;
    this.fileToIndex[filePath] = index;

    const stats = {
      item: index,
      count: 0
    };

    const callback = (event) => {
      if (!this.recordingPath) return;
      
      try {
        fs.appendFileSync(
          this.recordingPath,
          JSON.stringify({
            ...event,
            logFile: index
          }) + '\\n',
          'utf8'
        );
        stats.count++;
      } catch (error) {
        logger.error('Failed to append to recording:', error);
      }
    };

    const unsubscribe = this.fileTrackerManager.subscribe(filePath, callback);
    this.trackedFiles.set(filePath, { stats, unsubscribe });
    logger.info(`Started tracking logs for ${filePath}`);
  }

  stopTracking(filePath) {
    const tracked = this.trackedFiles.get(filePath);
    if (tracked) {
      tracked.unsubscribe();
      delete this.fileToIndex[filePath];
      this.trackedFiles.delete(filePath);
      logger.info(`Stopped tracking logs for ${filePath}`);
    }
  }

  startRecording(recordingPath) {
    this.recordingPath = recordingPath;
    logger.info(`Started recording to ${recordingPath}`);
  }

  stopRecording() {
    this.recordingPath = null;
    logger.info('Stopped recording');
  }

  getStats() {
    const items = [];
    for (const [filePath, { stats }] of this.trackedFiles.entries()) {
      items.push({
        ...this.fileTrackerManager.getStats(filePath),
        item: stats.item,
        count: stats.count
      });
    }

    const totalCount = items.reduce((acc, status) => acc + status.count, 0);

    return {
      id: 'CLI',
      name: 'CLI',
      type: 'cli',
      fileLocation: this.recordingPath,
      items,
      count: totalCount
    };
  }

  destroy() {
    for (const filePath of this.trackedFiles.keys()) {
      this.stopTracking(filePath);
    }
    this.fileTrackerManager.destroy();
    this.recordingPath = null;
    logger.info('Destroyed log tracker');
  }
}
