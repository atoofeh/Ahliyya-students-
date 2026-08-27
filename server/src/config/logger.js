const path = require('path');
const fs = require('fs');
const winston = require('winston');
const env = require('./env');

const logDir = path.join(__dirname, '..', '..', 'logs');
fs.mkdirSync(logDir, { recursive: true });

const baseFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Application-wide structured logger.
 * Channels: combined, error, security (auth/anti-cheat/audit events).
 */
const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: baseFormat,
  defaultMeta: { service: 'lms-api' },
  transports: [
    new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error', maxsize: 10 * 1024 * 1024, maxFiles: 5 }),
    new winston.transports.File({ filename: path.join(logDir, 'combined.log'), maxsize: 10 * 1024 * 1024, maxFiles: 5 }),
  ],
});

const securityLogger = winston.createLogger({
  level: 'info',
  format: baseFormat,
  defaultMeta: { service: 'lms-security' },
  transports: [
    new winston.transports.File({ filename: path.join(logDir, 'security.log'), maxsize: 10 * 1024 * 1024, maxFiles: 10 }),
  ],
});

if (env.NODE_ENV !== 'production') {
  const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
      const extra = Object.keys(meta).filter((k) => k !== 'service').length
        ? ` ${JSON.stringify(Object.fromEntries(Object.entries(meta).filter(([k]) => k !== 'service')))}`
        : '';
      return `${timestamp} ${level}: ${message}${extra}`;
    })
  );
  logger.add(new winston.transports.Console({ format: consoleFormat }));
  securityLogger.add(new winston.transports.Console({ format: consoleFormat, level: 'warn' }));
}

module.exports = { logger, securityLogger };
