import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import fs from 'fs';
import { logger } from './logger.js';
import path from 'path';
import { auth } from './auth.js';

class Uploader {
  constructor() {
    this.uploadCallbacks = new Map();
  }

  createS3Client(sts) {
    return new S3Client({
      credentials: {
        accessKeyId: sts.accessKeyId,
        secretAccessKey: sts.secretAccessKey,
        sessionToken: sts.sessionToken
      },
      region: sts.region || 'us-east-1',
      maxAttempts: 3
    });
  }

  generateUploadParams(sts, fileType, extension) {
    // Add file extension to the key
    const key = `${sts.file}.${extension}`;
    
    logger.debug('Generating upload params:', {
      bucket: sts.bucket,
      key,
      contentType: `${fileType}/${extension}`
    });

    return {
      Bucket: sts.bucket,
      Key: key,
      ContentType: `${fileType}/${extension}`,
      ACL: 'private'
    };
  }

  async uploadFile(sts, clip, file, fileType, extension) {
    logger.debug(`Uploading ${fileType}:`, { sts });

    const client = this.createS3Client(sts);
    const uploadParams = this.generateUploadParams(sts, fileType, extension);
    const fileStream = fs.createReadStream(file);

    try {
      const upload = new Upload({
        client,
        params: {
          ...uploadParams,
          Body: fileStream
        },
        partSize: 20 * 1024 * 1024, // 20 MB
        queueSize: 5
      });

      upload.on('httpUploadProgress', (progress) => {
        if (progress.loaded && progress.total) {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          logger.debug(`Upload ${fileType} progress: ${percent}%`);
          
          // Call progress callback if registered
          const callbacks = this.uploadCallbacks.get(clip.id);
          if (callbacks?.onProgress) {
            callbacks.onProgress(percent);
          }
        }
      });

      const result = await upload.done();
      
      if (extension !== 'png') {
        logger.debug(`Uploaded ${fileType}:`, result);
        
        // Call complete callback if registered
        const callbacks = this.uploadCallbacks.get(clip.id);
        if (callbacks?.onComplete) {
          callbacks.onComplete(result);
        }
      }

      fs.unlink(file, () => {
        logger.info(`Upload complete, deleting file: ${file}`);
      });

      return result;
    } catch (error) {
      logger.error('Upload error:', error);
      fs.unlink(file, () => {
        logger.warn(`Deleting file after upload error: ${file}`);
      });
      throw error;
    } finally {
      fileStream.destroy();
    }
  }

  // Methods that match the desktop app's interface
  async uploadVideo(meta, sts, clip) {
    const file = clip.file;
    await this.uploadFile(sts, clip, file, 'video', 'mp4');
  }

  async uploadLog(app, sts, clip) {
    const file = app.trimmedFileLocation;
    await this.uploadFile(sts, clip, file, 'log', 'jsonl');
  }

  // Register callbacks for progress and completion
  registerCallbacks(clipId, { onProgress, onComplete }) {
    this.uploadCallbacks.set(clipId, { onProgress, onComplete });
  }

  // Remove callbacks
  clearCallbacks(clipId) {
    this.uploadCallbacks.delete(clipId);
  }
}

// Create a singleton instance
const uploader = new Uploader();

// Export a simplified upload function for CLI use
export async function upload(filePath, metadata = {}) {
  const extension = path.extname(filePath).substring(1);
  const fileType = extension === 'mp4' ? 'video' : 'log';
  
  // Get current date for default title if none provided
  const defaultTitle = `Recording ${new Date().toLocaleString()}`;
  
  // Create a clip object that matches what the desktop app expects
  const clip = {
    id: Date.now().toString(),
    file: filePath,
    title: metadata.title || defaultTitle,
    description: metadata.description || '',
    project: metadata.project || undefined,
    duration: metadata.duration || 0,
    clientStartDate: new Date().toISOString()
  };

  // Get STS credentials
  const sts = await auth.getStsCredentials();

  // Upload all assets
  const promises = [
    // Upload the main video
    uploader.uploadFile(sts, clip, filePath, fileType, extension)
  ];

  // Upload GIF if available
  if (metadata.gifPath && fs.existsSync(metadata.gifPath)) {
    promises.push(uploader.uploadFile(sts, clip, metadata.gifPath, 'image', 'gif'));
  }

  // Upload snapshot if available
  if (metadata.snapshotPath && fs.existsSync(metadata.snapshotPath)) {
    promises.push(uploader.uploadFile(sts, clip, metadata.snapshotPath, 'image', 'png'));
  }

  await Promise.all(promises);
}

export { uploader };
