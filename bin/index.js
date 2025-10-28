#!/usr/bin/env node

import { program } from 'commander';
import { login } from '../lib/auth.js';
import { startRecording, stopRecording } from '../lib/recorder.js';
import { uploadRecording } from '../lib/uploader.js';
import { logger } from '../lib/logger.js';

program
  .name('dashcam')
  .description('CLI screen recorder with automatic upload')
  .version('1.0.0');

program
  .command('login')
  .description('Authenticate with Auth0')
  .action(async () => {
    try {
      await login();
      logger.info('Successfully logged in');
    } catch (error) {
      logger.error('Login failed:', error);
      process.exit(1);
    }
  });

program
  .command('record')
  .description('Start recording the screen')
  .option('-d, --duration <seconds>', 'Recording duration in seconds')
  .action(async (options) => {
    try {
      await startRecording(options);
      logger.info('Recording started');

      if (options.duration) {
        setTimeout(async () => {
          const recordingPath = await stopRecording();
          logger.info('Recording stopped');
          await uploadRecording(recordingPath);
        }, options.duration * 1000);
      }
    } catch (error) {
      logger.error('Recording failed:', error);
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('Stop the current recording and upload it')
  .action(async () => {
    try {
      const recordingPath = await stopRecording();
      logger.info('Recording stopped');
      await uploadRecording(recordingPath);
    } catch (error) {
      logger.error('Failed to stop recording:', error);
      process.exit(1);
    }
  });

program.parse();
