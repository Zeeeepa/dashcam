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

// Verbose level configuration
let isVerbose = false;

// Create custom format to include version and user info
const updateFormat = winston.format((info) => {
  info.version = process.env.npm_package_version;
  return info;
});

// Custom format for console output with more detail
const verboseConsoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let output = `${timestamp} [${level}] ${message}`;
    
    // Add metadata if present and in verbose mode
    if (isVerbose && Object.keys(meta).length > 0) {
      // Filter out internal winston metadata
      const cleanMeta = Object.fromEntries(
        Object.entries(meta).filter(([key]) => 
          !['timestamp', 'level', 'message', 'ddsource', 'service', 'env', 'os_type', 'os_release', 'version'].includes(key)
        )
      );
      
      if (Object.keys(cleanMeta).length > 0) {
        output += `\n  ${JSON.stringify(cleanMeta, null, 2).split('\n').join('\n  ')}`;
      }
    }
    
    return output;
  })
);

// Function to set verbose mode
export function setVerbose(verbose = true) {
  isVerbose = verbose;
  // Update console transport level based on verbose mode
  const consoleTransport = logger.transports.find(t => t.constructor.name === 'Console');
  if (consoleTransport) {
    consoleTransport.level = verbose ? 'silly' : (ENV === 'production' ? 'info' : 'debug');
  }
}

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
    // Log to console in development with enhanced formatting
    new winston.transports.Console({
      format: verboseConsoleFormat,
      level: ENV === 'production' ? 'info' : 'debug'
    }),
    // Log to files
    new winston.transports.File({
      filename: path.join(os.homedir(), '.dashcam', 'logs', 'error.log'),
      level: 'error'
    }),
    new winston.transports.File({
      filename: path.join(os.homedir(), '.dashcam', 'logs', 'combined.log'),
      level: 'silly' // Capture all levels in file
    }),
    // Log debug info to separate file when verbose
    new winston.transports.File({
      filename: path.join(os.homedir(), '.dashcam', 'logs', 'debug.log'),
      level: 'debug'
    }),
    // Send to Datadog in production
    ...(ENV === 'production' ? [new winston.transports.Http(httpTransportOptions)] : [])
  ]
});

// Add convenience methods for common logging patterns
logger.verbose = (message, meta) => logger.debug(`[VERBOSE] ${message}`, meta);
logger.trace = (message, meta) => logger.silly(`[TRACE] ${message}`, meta);

// Function to log function entry/exit for debugging
export function logFunctionCall(functionName, args = {}) {
  if (isVerbose) {
    logger.debug(`Entering ${functionName}`, { args });
    return (result) => {
      logger.debug(`Exiting ${functionName}`, { result: typeof result });
    };
  }
  return () => {}; // No-op if not verbose
}
