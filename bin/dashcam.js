#!/usr/bin/env node
import { program } from 'commander';
import { auth } from '../lib/auth.js';
import { upload } from '../lib/uploader.js';
import { logger, setVerbose } from '../lib/logger.js';
import { APP } from '../lib/config.js';
import { createPattern } from '../lib/tracking.js';
import { startRecording, stopRecording, getRecordingStatus } from '../lib/recorder.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
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
  .description('Capture the steps to reproduce every bug.')
  .version(APP.version)
  .option('-v, --verbose', 'Enable verbose logging output')
  .hook('preAction', (thisCommand) => {
    // Enable verbose logging if the flag is set
    if (thisCommand.opts().verbose) {
      setVerbose(true);
      logger.info('Verbose logging enabled');
    }
  });

program
  .command('auth')
  .description("Authenticate the dashcam desktop using a team's apiKey")
  .argument('<api-key>', 'Your team API key')
  .action(async (apiKey, options, command) => {
    try {
      logger.verbose('Starting authentication process', { 
        apiKeyProvided: !!apiKey,
        globalOptions: command.parent.opts()
      });
      
      await auth.login(apiKey);
      console.log('Successfully authenticated with API key');
      process.exit(0);
    } catch (error) {
      console.error('Authentication failed:', error.message);
      logger.error('Authentication failed with details:', {
        error: error.message,
        stack: error.stack
      });
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
      process.exit(0);
    } catch (error) {
      logger.error('Logout failed:', error);
      process.exit(1);
    }
  });

// Shared recording action to avoid duplication
async function recordingAction(options, command) {
  try {
    const silent = options.silent;
    const log = (...args) => { if (!silent) console.log(...args); };
    const logError = (...args) => { if (!silent) console.error(...args); };
    
    // Check if recording is already active
    const status = getRecordingStatus();
    if (status.isRecording) {
      const duration = (status.duration / 1000).toFixed(1);
      log('Recording already in progress');
      log(`Duration: ${duration} seconds`);
      log('Stop the current recording before starting a new one');
      process.exit(1);
    }

    // Check authentication
    if (!await auth.isAuthenticated()) {
      log('You need to login first. Run: dashcam auth <api-key>');
      process.exit(1);
    }

    // Check for piped input (description from stdin) if description option not set
    let description = options.description;
    if (!description && !process.stdin.isTTY) {
      const chunks = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      description = Buffer.concat(chunks).toString('utf-8');
    }

    // Check screen recording permissions (macOS only)
    const { ensurePermissions } = await import('../lib/permissions.js');
    const hasPermissions = await ensurePermissions();
    if (!hasPermissions) {
      log('\n⚠️  Cannot start recording without screen recording permission.');
      process.exit(1);
    }

    // Start recording
    log('Starting recording...');
    
    try {
      const recordingOptions = {
        fps: parseInt(options.fps) || 30,
        includeAudio: options.audio || false,
        customOutputPath: options.output
      };
      
      const recordingMetadata = {
        title: options.title,
        description: description,
        project: options.project || options.k
      };

      await startRecording(recordingOptions);

      log(`✅ Recording started successfully`);
      log('');
      log('Press Ctrl+C to stop recording and upload');
      
      // Set up graceful shutdown handlers
      const handleShutdown = async (signal) => {
        log('\nStopping recording...');
        
        try {
          const result = await stopRecording();
          
          if (!result) {
            log('Failed to stop recording');
            process.exit(1);
          }

          log('Recording stopped successfully');
          
          // Upload the recording
          log('Uploading recording...');
          try {
            const uploadResult = await upload(result.outputPath, {
              title: recordingMetadata.title || 'Dashcam Recording',
              description: recordingMetadata.description,
              project: recordingMetadata.project,
              duration: result.duration,
              clientStartDate: result.clientStartDate,
              apps: result.apps,
              icons: result.icons,
              logs: result.logs,
              gifPath: result.gifPath,
              snapshotPath: result.snapshotPath
            });
            
            log('📹 Watch your recording:', uploadResult.shareLink);
            process.exit(0);
          } catch (uploadError) {
            logError('Upload failed:', uploadError.message);
            log('Recording saved locally:', result.outputPath);
            process.exit(1);
          }
        } catch (error) {
          logError('Failed to stop recording:', error.message);
          process.exit(1);
        }
      };
      
      process.on('SIGINT', () => handleShutdown('SIGINT'));
      process.on('SIGTERM', () => handleShutdown('SIGTERM'));
      
      // Keep process alive
      await new Promise(() => {});
      
    } catch (error) {
      logError('Failed to start recording:', error.message);
      process.exit(1);
    }
  } catch (error) {
    logger.error('Failed to start recording:', error);
    if (!options.silent) console.error('Failed to start recording:', error.message);
    process.exit(1);
  }
}

// 'record' command - the main recording command with all options
program
  .command('record')
  .description('Start a recording terminal to be included in your dashcam video recording')
  .option('-a, --audio', 'Include audio in the recording')
  .option('-f, --fps <fps>', 'Frames per second (default: 30)', '30')
  .option('-o, --output <path>', 'Custom output path')
  .option('-t, --title <title>', 'Title for the recording')
  .option('-d, --description <description>', 'Description for the recording (supports markdown)')
  .option('-p, --project <project>', 'Project ID to upload the recording to')
  .option('-s, --silent', 'Silent mode - suppress all output')
  .action(recordingAction);

program
  .command('logs')
  .description('Manage log tracking for recordings')
  .option('--add', 'Add a new log tracker')
  .option('--remove <id>', 'Remove a log tracker by ID')
  .option('--list', 'List all configured log trackers')
  .option('--status', 'Show log tracking status')
  .option('--name <name>', 'Name for the log tracker (required with --add)')
  .option('--type <type>', 'Type of tracker: "web" or "file" (required with --add)')
  .option('--pattern <pattern>', 'Pattern to track (can be used multiple times)', (value, previous) => {
    return previous ? previous.concat([value]) : [value];
  })
  .option('--file <file>', 'File path for file type trackers')
  .action(async (options) => {
    try {
      // Import logsTrackerManager only when needed to avoid unwanted initialization
      const { logsTrackerManager } = await import('../lib/logs/index.js');
      
      if (options.add) {
        // Validate required options for add
        if (!options.name) {
          console.error('Error: --name is required when adding a tracker');
          console.log('Example: dashcam logs --add --name=social --type=web --pattern="*facebook.com*"');
          process.exit(1);
        }
        if (!options.type) {
          console.error('Error: --type is required when adding a tracker (web or file)');
          process.exit(1);
        }
        if (options.type !== 'web' && options.type !== 'file') {
          console.error('Error: --type must be either "web" or "file"');
          process.exit(1);
        }

        if (options.type === 'web') {
          if (!options.pattern || options.pattern.length === 0) {
            console.error('Error: At least one --pattern is required for web trackers');
            console.log('Example: dashcam logs --add --name=social --type=web --pattern="*facebook.com*" --pattern="*twitter.com*"');
            process.exit(1);
          }
          
          const webConfig = {
            id: options.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            name: options.name,
            type: 'web',
            enabled: true,
            patterns: options.pattern
          };
          
          logsTrackerManager.addWebTracker(webConfig);
          console.log(`Added web tracker "${options.name}" with patterns:`, options.pattern);
        } else if (options.type === 'file') {
          if (!options.file) {
            console.error('Error: --file is required for file trackers');
            console.log('Example: dashcam logs --add --name=app-logs --type=file --file=/var/log/app.log');
            process.exit(1);
          }
          if (!fs.existsSync(options.file)) {
            console.error('Log file does not exist:', options.file);
            process.exit(1);
          }
          
          logsTrackerManager.addCliLogFile(options.file);
          console.log(`Added file tracker "${options.name}" for:`, options.file);
        }
      } else if (options.remove) {
        logsTrackerManager.removeTracker(options.remove);
        console.log('Removed tracker:', options.remove);
      } else if (options.list) {
        const status = logsTrackerManager.getStatus();
        console.log('Currently configured trackers:');
        
        if (status.cliFiles.length > 0) {
          console.log('\nFile trackers:');
          status.cliFiles.forEach((filePath, index) => {
            console.log(`  file-${index + 1}: ${filePath}`);
          });
        }
        
        if (status.webApps.length > 0) {
          console.log('\nWeb trackers:');
          status.webApps.forEach(app => {
            console.log(`  ${app.id}: ${app.name}`);
            console.log(`    Patterns: ${app.patterns.join(', ')}`);
          });
        }
        
        if (status.cliFiles.length === 0 && status.webApps.length === 0) {
          console.log('  (none configured)');
          console.log('\nExamples:');
          console.log('  dashcam logs --add --name=social --type=web --pattern="*facebook.com*" --pattern="*twitter.com*"');
          console.log('  dashcam logs --add --name=app-logs --type=file --file=/var/log/app.log');
        }
      } else if (options.status) {
        const status = logsTrackerManager.getStatus();
        console.log('Log tracking status:');
        console.log(`  Active recording instances: ${status.activeInstances}`);
        console.log(`  File trackers: ${status.cliFilesCount}`);
        console.log(`  Web trackers: ${status.webAppsCount}`);
        console.log(`  Total recent events: ${status.totalEvents}`);
        
        if (status.fileTrackerStats.length > 0) {
          console.log('\n  File tracker activity (last minute):');
          status.fileTrackerStats.forEach(stat => {
            console.log(`    ${stat.filePath}: ${stat.count} events`);
          });
        }
      } else {
        console.log('Please specify an action: --add, --remove, --list, or --status');
        console.log('\nExamples:');
        console.log('  dashcam logs --add --name=social --type=web --pattern="*facebook.com*" --pattern="*twitter.com*"');
        console.log('  dashcam logs --add --name=app-logs --type=file --file=/var/log/app.log');
        console.log('  dashcam logs --list');
        console.log('  dashcam logs --status');
        console.log('\nUse "dashcam logs --help" for more information');
      }
      
      // Exit successfully to prevent hanging
      process.exit(0);
    } catch (error) {
      logger.error('Error managing logs:', error);
      console.error('Failed to manage logs:', error.message);
      process.exit(1);
    }
  });

program.parse();
