import { logger } from './logger.js';
import { logTracker } from './logTracker.js';

export async function createPattern(config) {
  try {
    logger.info('Adding tracking pattern', config);
    
    if (config.patterns) {
      for (const pattern of config.patterns) {
        logTracker.startTracking(pattern);
      }
    } else if (typeof config === 'string') {
      logTracker.startTracking(config);
    } else {
      throw new Error('Invalid tracking pattern configuration');
    }
    
    return Promise.resolve();
  } catch (error) {
    logger.error('Failed to create tracking pattern:', error);
    throw error;
  }
}
