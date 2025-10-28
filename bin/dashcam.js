#!/usr/bin/env node
import { program } from 'commander';
import { auth } from '../lib/auth.js';
import { startRecording, stopRecording, getRecordingStatus } from '../lib/recorder.js';
import { upload } from '../lib/uploader.js';
import { logger } from '../lib/logger.js';
import { APP } from '../lib/config.js';
import { createPattern } from '../lib/tracking.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure config directory exists
if (!fs.existsSync(APP.configDir)) {
  fs.mkdirSync(APP.configDir, { recursive: true });
}

// Ensure recordings directory exists
if (!fs.existsSync(APP.recordingsDir)) {
  fs.mkdirSync(APP.recordingsDir, { recursive: true });
}

program
  .name('dashcam')
  .description('CLI version of Dashcam screen recorder')
  .version(APP.version);

program
  .command('auth')
  .description('Authenticate with TestDriver using an API key')
  .argument('<apiKey>', 'Your TestDriver API key')
  .action(async (apiKey) => {
    try {
      await auth.login(apiKey);
      console.log('Successfully authenticated with API key');
    } catch (error) {
      console.error('Authentication failed:', error.message);
      process.exit(1);
    }
  });

program
  .command('logout')
  .description('Logout from your Dashcam account')
  .action(async () => {
    try {
      await auth.logout();
      console.log('Successfully logged out');
    } catch (error) {
      logger.error('Logout failed:', error);
      process.exit(1);
    }
  });

program
  .command('record')
  .description('Start a screen recording')
  .option('-a, --audio', 'Include audio in the recording')
  .option('-f, --fps <fps>', 'Frames per second (default: 30)', '30')
  .option('-o, --output <path>', 'Custom output path')
  .option('-t, --title <title>', 'Title for the recording')
  .option('-d, --description <description>', 'Description for the recording (supports markdown)')
  .option('-p, --project <project>', 'Project ID to upload the recording to')
  .action(async (options) => {
    try {
      // Check authentication
      if (!await auth.isAuthenticated()) {
        console.log('You need to login first. Run: dashcam login');
        process.exit(1);
      }

      // Start recording
      const { outputPath } = await startRecording({
        fps: parseInt(options.fps),
        includeAudio: options.audio,
        customOutputPath: options.output
      });

      console.log('Recording started successfully');
      console.log('Press Ctrl+C to stop recording');

      // Handle graceful shutdown
      let shutdownStarted = false;

      async function handleShutdown() {
        if (shutdownStarted) return;
        shutdownStarted = true;
        
        console.log('\nStopping recording...');
        try {
          const result = await stopRecording();
          console.log('Recording saved:', result.outputPath);
          console.log('Duration:', (result.duration / 1000).toFixed(1), 'seconds');
          console.log('File size:', (result.fileSize / (1024 * 1024)).toFixed(2), 'MB');
          
          console.log('Uploading assets...');
          await upload(result.outputPath, {
            title: options.title,
            description: options.description,
            project: options.project,
            duration: result.duration,
            gifPath: result.gifPath,
            snapshotPath: result.snapshotPath
          });
          console.log('Upload complete!');
          
          process.exit(0);
        } catch (error) {
          logger.error('Error stopping recording:', error);
          process.exit(1);
        }
      }

      process.on('SIGINT', handleShutdown);
      process.on('SIGTERM', handleShutdown);

    } catch (error) {
      logger.error('Recording failed:', error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show current recording status')
  .action(() => {
    const status = getRecordingStatus();
    if (status.isRecording) {
      console.log('Recording in progress');
      console.log('Duration:', (status.duration / 1000).toFixed(1), 'seconds');
      console.log('Output path:', status.outputPath);
    } else {
      console.log('No active recording');
    }
  });

program
  .command('track')
  .description('Track logs from web URLs or application files')
  .option('--web <pattern>', 'Web URL pattern to track (can use wildcards like *)')
  .option('--app <pattern>', 'Application file pattern to track (can use wildcards like *)')
  .option('--name <name>', 'Name for the tracking configuration')
  .action(async (options) => {
    try {
      // Validate that at least one pattern is provided
      if (!options.web && !options.app) {
        console.error('Error: Must provide either --web or --app pattern');
        process.exit(1);
      }

      if (options.web) {
        const config = {
          name: options.name || 'Web Pattern',
          type: 'web',
          patterns: [options.web],
          enabled: true
        };
        
        await createPattern(config);
        console.log('Web tracking pattern added successfully:', options.web);
      }

      if (options.app) {
        const config = {
          name: options.name || 'App Pattern',
          type: 'application',
          patterns: [options.app],
          enabled: true
        };
        
        await createPattern(config);
        console.log('Application tracking pattern added successfully:', options.app);
      }
      process.exit(0);
    } catch (error) {
      console.error('Failed to add tracking pattern:', error.message);
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('Stop the current recording and upload it')
  .option('-t, --title <title>', 'Title for the recording')
  .option('-d, --description <description>', 'Description for the recording (supports markdown)')
  .option('-p, --project <project>', 'Project ID to upload the recording to')
  .action(async (options) => {
    try {
      console.log('Stopping recording...');
      const result = await stopRecording();
      console.log('Recording saved:', result.outputPath);
      console.log('Duration:', (result.duration / 1000).toFixed(1), 'seconds');
      console.log('File size:', (result.fileSize / (1024 * 1024)).toFixed(2), 'MB');
      console.log('Generated GIF:', result.gifPath);
      console.log('Generated snapshot:', result.snapshotPath);
      
      console.log('Uploading assets...');
      await upload(result.outputPath, {
        title: options.title,
        description: options.description,
        project: options.project,
        duration: result.duration,
        gifPath: result.gifPath,
        snapshotPath: result.snapshotPath
      });
      console.log('Upload complete!');
    } catch (error) {
      if (error.message === 'No recording in progress') {
        console.error('No recording is currently in progress');
      } else {
        logger.error('Error stopping recording:', error);
      }
      process.exit(1);
    }
  });

program.parse();
