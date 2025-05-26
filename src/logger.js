/*  logger.js  */
const winston = require('winston');
const Transport = require('winston-transport');
const https = require('https');
const { trace } = require('@opentelemetry/api');
const { SERVICE_NAME, SIGNOZ_CONFIG } = require('./config');

/* ------------------------------------------------------------------ */
/*  Custom WINSTON FORMATS                                            */
/* ------------------------------------------------------------------ */

// 1. Inject the current span context into every log
const addTraceContext = winston.format(info => {
  const span = trace.getActiveSpan();
  if (span) {
    const ctx = span.spanContext();
    info.traceId    = ctx.traceId;     // 32-char hex
    info.spanId     = ctx.spanId;      // 16-char hex
    info.traceFlags = ctx.traceFlags;  // number 0–255
  }
  return info;
});

// 2. Remove any stray underscore versions created by other libs
const removeDuplicateTraceFields = winston.format(info => {
  delete info.trace_id;
  delete info.span_id;
  delete info.trace_flags;
  return info;
});

/* ------------------------------------------------------------------ */
/*  Custom SigNoz Winston Transport                                   */
/* ------------------------------------------------------------------ */
class SigNozTransport extends Transport {
  constructor(opts = {}) {
    super(opts);
    this.url = SIGNOZ_CONFIG.logs.url;

    // OTLP HTTP accepts custom headers - we use the SigNoz access token
    this.headers = {
      'Content-Type': 'application/json',
      'signoz-access-token': SIGNOZ_CONFIG.accessToken
    };
  }

  log(info, callback) {
    /* -------------------------------------------------------------- */
    /*  Convert Winston “info” into an OTLP LogRecord payload         */
    /* -------------------------------------------------------------- */
    const levelMap = { error: 17, warn: 13, info: 9, debug: 5, silly: 1 };
    const now      = Date.now() * 1_000_000;         // ns epoch
    const sevNum   = levelMap[info.level] ?? 9;

    /* ---- 1. Canonical OpenTelemetry correlation fields (TOP LEVEL) */
    const logRecord = {
      timeUnixNano:        now.toString(),
      observedTimeUnixNano: now.toString(),
      severityNumber:      sevNum,
      severityText:        info.level.toUpperCase(),
      body:                { stringValue: info.message }
    };

    if (info.traceId)    logRecord.traceId    = info.traceId;
    if (info.spanId)     logRecord.spanId     = info.spanId;
    if (info.traceFlags !== undefined) logRecord.traceFlags = info.traceFlags;

    /* ---- 2. Extra attributes (everything else we care about) ----- */
    const attrs = {
      'service.name': info.service || SERVICE_NAME,
      'log.level':    info.level
    };

    Object.keys(info).forEach(k => {
      if (![
        'level', 'message', 'timestamp',
        'service', 'traceId', 'spanId', 'traceFlags'
      ].includes(k)) {
        attrs[k] = info[k];
      }
    });

    logRecord.attributes = Object.keys(attrs).map(k => ({
      key:   k,
      value: { stringValue: String(attrs[k]) }
    }));

    /* ---- 3. Wrap the record in the OTLP envelope ----------------- */
    const payload = {
      resourceLogs: [{
        resource: {
          attributes: [{
            key:   'service.name',
            value: { stringValue: SERVICE_NAME }
          }]
        },
        scopeLogs: [{
          scope: { name: 'winston-signoz-transport', version: '1.0.0' },
          logRecords: [logRecord]
        }]
      }]
    };

    /* ---- 4. Send -------------------------------------------------- */
    this._send(payload);
    callback();          // tell Winston we’re done
  }

  _send(payload) {
    const data = JSON.stringify(payload);
    const { hostname, port, pathname: path, protocol } = new URL(this.url);

    const options = {
      hostname,
      port:     port || (protocol === 'https:' ? 443 : 80),
      path,
      method:   'POST',
      headers: {
        ...this.headers,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, res => {
      if (res.statusCode !== 200)
        console.error('[SigNoz transport] HTTP', res.statusCode);
    });

    req.on('error', err =>
      console.error('[SigNoz transport] network error:', err)
    );

    req.write(data);
    req.end();
  }
}

/* ------------------------------------------------------------------ */
/*  Winston Logger instance                                           */
/* ------------------------------------------------------------------ */
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    addTraceContext(),
    removeDuplicateTraceFields(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: SERVICE_NAME },
  transports: [
    /* Console – helpful while developing -------------------------- */
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          ({ timestamp, level, message, traceId, spanId, ...meta }) => {
            let out = `${timestamp} [${level}]: ${message}`;
            if (traceId) out += ` [trace:${traceId}]`;
            if (Object.keys(meta).length) out += ` ${JSON.stringify(meta)}`;
            return out;
          }
        )
      )
    }),

    /* Persistent file log (optional) ------------------------------ */
    new winston.transports.File({
      filename: 'logs/app.log',
      format:   winston.format.json()
    }),

    /* SigNoz transport ------------------------------------------- */
    new SigNozTransport({ level: 'info' })
  ]
});

/* Handle crashy stuff so they also go to SigNoz / file ------------- */
logger.exceptions.handle(
  new winston.transports.File({ filename: 'logs/exceptions.log' })
);
logger.rejections.handle(
  new winston.transports.File({ filename: 'logs/rejections.log' })
);

module.exports = logger;
