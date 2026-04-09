import { createLogger, format, transports } from 'winston';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)
  ),
  transports: [
    new transports.Console(),
    new transports.File({
      filename: join(__dirname, '../logs/agent.log'),
      maxsize:  5 * 1024 * 1024, // 5MB
      maxFiles: 7,
    }),
    new transports.File({
      filename: join(__dirname, '../logs/errors.log'),
      level:    'error',
      maxsize:  5 * 1024 * 1024,  // fix #24: add rotation to prevent unbounded growth
      maxFiles: 3,
    }),
  ],
});
