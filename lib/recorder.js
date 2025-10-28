import { execa } from 'execa';
import ffmpeg from 'ffmpeg-static';
import { logger } from './logger.js';
import { createGif, createSnapshot } from './ffmpeg.js';
import path from 'path';
import os from 'os';
import fs from 'fs';

// State management
let currentRecording = null;
let outputPath = null;
let recordingStartTime = null;

// Platform-specific configurations
const PLATFORM_CONFIG = {
  darwin: {
    inputFormat: 'avfoundation',
    screenInput: '2:none',  // Usually index 2 is the first screen on macOS
    audioInput: '1',        // Default audio device if needed
    audioFormat: 'avfoundation',
    extraArgs: [
      '-capture_cursor', '1',    // Capture mouse cursor
      '-capture_mouse_clicks', '1', // Show mouse clicks
      '-pixel_format', 'yuyv422',  // Standard pixel format for screen capture
      '-probesize', '20M',      // Increase probe size for reliable device detection
      '-framerate', '30',        // Explicitly set input framerate
      '-video_size', '1920x1080'  // Set a default resolution
    ]
  },
  win32: {
    inputFormat: 'gdigrab',
    screenInput: 'desktop',
    audioInput: 'audio="virtual-audio-capturer"',
    audioFormat: 'dshow'
  },
  linux: {
    inputFormat: 'x11grab',
    screenInput: ':0.0',
    audioInput: 'default',
    audioFormat: 'pulse'
  }
};

/**
 * Get the FFmpeg arguments for the current platform
 */
function getPlatformArgs({ fps, includeAudio }) {
  const platform = os.platform();
  const config = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.darwin;
  
  const args = [
    '-f', config.inputFormat
  ];

  // Add platform-specific extra args before input
  if (config.extraArgs) {
    args.push(...config.extraArgs);
  }

  args.push(
    '-framerate', fps.toString(),
    '-i', config.screenInput
  );

  // Add audio capture if enabled
  if (includeAudio) {
    args.push(
      '-f', config.audioFormat,
      '-i', config.audioInput
    );
  }

  // Log the command being constructed
  logger.debug('FFmpeg capture command:', { args: args.join(' ') });

  return args;
}

/**
 * Generate a valid output path for the recording
 */
function generateOutputPath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  // Use local tmp directory instead of system temp
  const directory = path.join(process.cwd(), 'tmp', 'recordings');
  const filepath = path.join(directory, `recording-${timestamp}.mp4`);
  
  // Ensure directory exists
  fs.mkdirSync(directory, { recursive: true });
  
  return filepath;
}

/**
 * Start a new screen recording
 */
export async function startRecording({ 
  fps = 30,
  includeAudio = false,
  customOutputPath = null
} = {}) {
  if (currentRecording) {
    throw new Error('Recording already in progress');
  }

  outputPath = customOutputPath || generateOutputPath();
  
  // Construct FFmpeg command arguments
  const platformArgs = getPlatformArgs({ fps, includeAudio });
  const outputArgs = [
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    // Better quality settings for screen recording
    '-crf', '18',          // Lower CRF for better quality
    '-maxrate', '20M',     // Higher bitrate for screen content
    '-bufsize', '40M',     // Larger buffer for variable bitrate
    '-r', fps.toString(),  // Ensure output framerate matches input
    '-g', '30',           // Keyframe every 30 frames
    '-keyint_min', '30',  // Minimum keyframe interval
    '-sc_threshold', '0'  // Disable scene cut detection
  ];

  if (includeAudio) {
    outputArgs.push(
      '-c:a', 'aac',
      '-b:a', '128k'
    );
  }

  // Create a temporary file for the recording in our workspace
  const tempDir = path.join(process.cwd(), 'tmp', 'recordings');
  const tempFile = path.join(tempDir, `temp-${Date.now()}.mp4`);

  const movflags = [
    'faststart',    // Optimize for streaming
    'empty_moov',   // Write an initial moov atom
    'frag_keyframe' // Fragment at keyframes
  ];

  const args = [
    ...platformArgs,
    '-movflags', `+${movflags.join('+')}`,
    ...outputArgs,
    '-y', // Overwrite output file if it exists
    tempFile
  ];

  const fullCommand = [ffmpeg, ...args].join(' ');
  logger.info('Starting recording with options:', {
    fps,
    includeAudio,
    platform: os.platform(),
    outputPath,
    tempFile,
    movflags,
    command: fullCommand
  });

  try {
    currentRecording = execa(ffmpeg, args, {
      reject: false,
      all: true, // Capture both stdout and stderr
      stdin: 'pipe' // Enable stdin for sending 'q' to stop recording
    });

    recordingStartTime = Date.now();

    if (currentRecording.all) {
      currentRecording.all.setEncoding('utf8');
      currentRecording.all.on('data', (data) => {
        logger.debug(`ffmpeg: ${data}`);
      });
    }

    // Return immediately since FFmpeg is running
    return { outputPath, startTime: recordingStartTime };
  } catch (error) {
    logger.error('Failed to start recording:', error);
    currentRecording = null;
    recordingStartTime = null;
    throw error;
  }
}

/**
 * Stop the current recording
 */
export async function stopRecording() {
  if (!currentRecording) {
    throw new Error('No recording in progress');
  }

  logger.info('Stopping recording');

  try {
    // First try to gracefully stop FFmpeg by sending 'q'
    if (currentRecording && currentRecording.stdin) {
      currentRecording.stdin.write('q');
    }

    // Wait for FFmpeg to finish gracefully
    const gracefulTimeout = setTimeout(() => {
      if (currentRecording && !currentRecording.killed) {
        // If still running, try SIGTERM
        process.kill(currentRecording.pid, 'SIGTERM');
      }
    }, 2000);

    // Wait up to 5 seconds for SIGTERM to work
    const hardKillTimeout = setTimeout(() => {
      if (currentRecording && !currentRecording.killed) {
        // If still not dead, use SIGKILL as last resort
        process.kill(currentRecording.pid, 'SIGKILL');
      }
    }, 5000);

    // Wait for the process to fully exit
    if (currentRecording) {
      await currentRecording;
    }

    // Clear timeouts
    clearTimeout(gracefulTimeout);
    clearTimeout(hardKillTimeout);

    // Additional wait to ensure filesystem is synced
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get the temp file path from the args
    const args = currentRecording.spawnargs;
    const tempFile = args[args.length - 1];

    if (!fs.existsSync(tempFile) || fs.statSync(tempFile).size === 0) {
      throw new Error('Recording file is empty or missing');
    }

    // Analyze temp file before processing
    const tempStats = fs.statSync(tempFile);
    logger.debug('Temp file stats:', {
      size: tempStats.size,
      path: tempFile
    });

    // Use ffmpeg to properly finalize the recording with explicit moov atom handling
    const finalizeArgs = [
      '-f', 'mp4',  // Force MP4 format
      '-i', tempFile,
      '-c', 'copy',
      '-movflags', '+faststart+empty_moov+write_colr',
      '-fflags', '+genpts+igndts',
      '-avoid_negative_ts', 'make_zero',
      '-map', '0',
      '-y',
      outputPath
    ];

    logger.debug('Finalizing recording...', { command: finalizeArgs.join(' ') });
    
    // Try finalization multiple times with increasing delays
    const attempts = 3;
    let success = false;
    
    for (let i = 0; i < attempts && !success; i++) {
      // Wait longer between each attempt
      await new Promise(resolve => setTimeout(resolve, (i + 1) * 2000));
      
      try {
        logger.debug(`Finalization attempt ${i + 1} of ${attempts}`);
        
        const finalizeProcess = execa(ffmpeg, finalizeArgs, {
          reject: false,
          all: true
        });

        if (finalizeProcess.all) {
          finalizeProcess.all.setEncoding('utf8');
          finalizeProcess.all.on('data', (data) => {
            logger.debug(`FFmpeg finalize attempt ${i + 1}: ${data}`);
          });
        }

        const { exitCode, all: output } = await finalizeProcess;

        if (exitCode === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          success = true;
          logger.info(`Successfully finalized recording on attempt ${i + 1}`);
          break;
        } else {
          logger.warn(`Attempt ${i + 1} failed: ${output}`);
        }
      } catch (err) {
        logger.error(`Finalization attempt ${i + 1} error:`, err);
        if (i === attempts - 1) throw err;
      }
    }

    if (!success) {
      throw new Error('Failed to finalize recording after all attempts');
    }

    // Clean up temp file only after successful finalization
    try {
      fs.unlinkSync(tempFile);
    } catch (e) {
      logger.debug('Failed to delete temp file:', e);
    }

    // Generate paths for additional assets
    const basePath = outputPath.substring(0, outputPath.lastIndexOf('.'));
    const gifPath = `${basePath}.gif`;
    const snapshotPath = `${basePath}.png`;

    // Create GIF and snapshot
    await Promise.all([
      createGif(outputPath, gifPath),
      createSnapshot(outputPath, snapshotPath, 0)
    ]);

    const result = {
      outputPath,
      gifPath,
      snapshotPath,
      duration: Date.now() - recordingStartTime,
      fileSize: fs.statSync(outputPath).size
    };

    currentRecording = null;
    recordingStartTime = null;
    return result;
  } catch (error) {
    currentRecording = null;
    recordingStartTime = null;
    throw error;
  }
}

/**
 * Get current recording status
 */
export function getRecordingStatus() {
  if (!currentRecording) {
    return { isRecording: false };
  }

  return {
    isRecording: true,
    duration: recordingStartTime ? Date.now() - recordingStartTime : 0,
    outputPath
  };
}
