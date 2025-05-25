const winston = require('winston');
const { trace } = require('@opentelemetry/api');
const SigNozTransport = require('./winston-otel-transport');
const { SERVICE_NAME } = require('./config');

// Custom format to add trace context to logs
const addTraceContext = winston.format((info) => {
  // Get the current active span
  const span = trace.getActiveSpan();

  if (span) {
    const spanContext = span.spanContext();
    // Add trace and span IDs to the log entry
    info.traceId = spanContext.traceId;
    info.spanId = spanContext.spanId;
    info.traceFlags = spanContext.traceFlags;
  }

  return info;
});

// Create the Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    addTraceContext(), // This is the magic - adds trace context to every log
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: SERVICE_NAME
  },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, traceId, spanId, ...meta }) => {
          let log = `${timestamp} [${level}]: ${message}`;

          // Add trace context to console output for debugging
          if (traceId) {
            log += ` [trace: ${traceId}]`;
          }

          // Add any additional metadata
          if (Object.keys(meta).length > 0) {
            log += ` ${JSON.stringify(meta)}`;
          }

          return log;
        })
      )
    }),

    // File transport for production logs
    new winston.transports.File({
      filename: 'logs/app.log',
      format: winston.format.json() // Keep JSON format for structured logging
    }),

    // SigNoz transport for logs
    new SigNozTransport({
      level: 'info' // Send info level and above to SigNoz
    })
  ]
});

// Handle uncaught exceptions
logger.exceptions.handle(
  new winston.transports.File({ filename: 'logs/exceptions.log' })
);

// Handle unhandled promise rejections
logger.rejections.handle(
  new winston.transports.File({ filename: 'logs/rejections.log' })
);

module.exports = logger;