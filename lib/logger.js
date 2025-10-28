import winston from 'winston';
import os from 'os';
import path from 'path';

// Constants that match the desktop app
const DD_TOKEN = process.env.DD_TOKEN || 'pubfd7949e46d22d1e71fc8fa6d95ecc5f2';
const ENV = process.env.NODE_ENV || 'production';

// Configure HTTP transport for Datadog
const httpTransportOptions = {
  host: 'http-intake.logs.datadoghq.com',
  path: `/api/v2/logs?dd-api-key=${DD_TOKEN}`,
  ssl: true,
  level: 'silly'
};

// Metadata that matches the desktop app
const httpMeta = {
  ddsource: 'nodejs',
  service: 'dashcam-cli',
  env: ENV,
  os_type: os.type(),
  os_release: os.release()
};

// Create custom format to include version and user info
const updateFormat = winston.format((info) => {
  info.version = process.env.npm_package_version;
  return info;
});

// Create the logger instance
export const logger = winston.createLogger({
  format: winston.format.combine(
    updateFormat(),
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: {
    ...httpMeta
  },
  transports: [
    // Log to console in development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
      level: ENV === 'production' ? 'info' : 'debug'
    }),
    // Log to files
    new winston.transports.File({
      filename: path.join(os.homedir(), '.dashcam', 'logs', 'error.log'),
      level: 'error'
    }),
    new winston.transports.File({
      filename: path.join(os.homedir(), '.dashcam', 'logs', 'combined.log')
    }),
    // Send to Datadog in production
    ...(ENV === 'production' ? [new winston.transports.Http(httpTransportOptions)] : [])
  ]
});
