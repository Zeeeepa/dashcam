import ffmpegStatic from 'ffmpeg-static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the path to the FFmpeg binary
 * @returns {Promise<string>} Path to ffmpeg executable
 */
export async function getFfmpegPath() {
  // ffmpeg-static exports the path directly
  if (ffmpegStatic && existsSync(ffmpegStatic)) {
    return ffmpegStatic;
  }
  
  // Fallback to system ffmpeg if available
  return 'ffmpeg';
}

/**
 * Get the path to the FFprobe binary
 * @returns {Promise<string>} Path to ffprobe executable
 */
export async function getFfprobePath() {
  // ffprobe is usually in the same directory as ffmpeg
  if (ffmpegStatic) {
    const ffmpegDir = dirname(ffmpegStatic);
    const ffprobePath = join(ffmpegDir, 'ffprobe');
    
    if (existsSync(ffprobePath)) {
      return ffprobePath;
    }
  }
  
  // Fallback to system ffprobe if available
  return 'ffprobe';
}
