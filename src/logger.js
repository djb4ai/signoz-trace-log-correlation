const winston = require('winston');
const { trace } = require('@opentelemetry/api');
const https = require('https');
const { SERVICE_NAME, SIGNOZ_CONFIG } = require('./config');

// Custom format to add trace context to logs
const addTraceContext = winston.format((info) => {
  const span = trace.getActiveSpan();
  if (span) {
    const spanContext = span.spanContext();
    info.traceId = spanContext.traceId;
    info.spanId = spanContext.spanId;
    info.traceFlags = spanContext.traceFlags;
  }
  return info;
});

// Custom transport for SigNoz
class SigNozTransport extends winston.Transport {
  constructor(opts = {}) {
    super(opts);
    this.url = SIGNOZ_CONFIG.logs.url;
    this.headers = {
      'Content-Type': 'application/json',
      'signoz-access-token': SIGNOZ_CONFIG.accessToken
    };
  }

  log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    const severityMap = {
      error: 17,   // ERROR
      warn: 13,    // WARN
      info: 9,     // INFO
      debug: 5,    // DEBUG
      silly: 1     // TRACE
    };

    const severity = severityMap[info.level] || 9;
    const now = Date.now() * 1000000;

    const attributes = {
      'service.name': info.service || SERVICE_NAME,
      'log.level': info.level
    };

    if (info.traceId) {
      attributes['traceID'] = info.traceId;
    }
    if (info.spanId) {
      attributes['spanID'] = info.spanId;
    }
    if (info.traceFlags !== undefined) {
      attributes['trace_flags'] = info.traceFlags;
    }

    Object.keys(info).forEach(key => {
      if (!['level', 'message', 'timestamp', 'service', 'traceId', 'spanId', 'traceFlags'].includes(key)) {
        attributes[key] = info[key];
      }
    });

    const payload = {
      resourceLogs: [{
        resource: {
          attributes: [{
            key: 'service.name',
            value: { stringValue: SERVICE_NAME }
          }]
        },
        scopeLogs: [{
          scope: {
            name: 'winston-signoz-transport',
            version: '1.0.0'
          },
          logRecords: [{
            timeUnixNano: now.toString(),
            observedTimeUnixNano: now.toString(),
            severityNumber: severity,
            severityText: info.level.toUpperCase(),
            body: {
              stringValue: info.message
            },
            attributes: Object.keys(attributes).map(key => ({
              key: key,
              value: { stringValue: String(attributes[key]) }
            }))
          }]
        }]
      }]
    };

    this.sendToSigNoz(payload);
    callback();
  }

  sendToSigNoz(payload) {
    const data = JSON.stringify(payload);
    const url = new URL(this.url);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        ...this.headers,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        console.error(`SigNoz logs request failed with status: ${res.statusCode}`);
      }
    });

    req.on('error', (error) => {
      console.error('Error sending logs to SigNoz:', error);
    });

    req.write(data);
    req.end();
  }
}

// Create the Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    addTraceContext(),
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
          if (traceId) {
            log += ` [trace: ${traceId}]`;
          }
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
      format: winston.format.json()
    }),

    // SigNoz transport for logs
    new SigNozTransport({
      level: 'info'
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