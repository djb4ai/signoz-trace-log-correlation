const Transport = require('winston-transport');
const https = require('https');
const { SERVICE_NAME, SIGNOZ_CONFIG } = require('./config');

/**
 * Custom Winston transport that sends logs directly to SigNoz
 * This enables log correlation with traces in SigNoz
 */
class SigNozTransport extends Transport {
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

    try {
      // Convert Winston log level to OpenTelemetry severity
      const severityMap = {
        error: 17,   // ERROR
        warn: 13,    // WARN
        info: 9,     // INFO
        http: 9,     // INFO
        verbose: 5,  // DEBUG
        debug: 5,    // DEBUG
        silly: 1     // TRACE
      };

      const severity = severityMap[info.level] || 9; // Default to INFO
      const now = Date.now() * 1000000; // Convert to nanoseconds

      // Prepare attributes including trace context
      const attributes = {};

      // Add service name
      attributes['service.name'] = info.service || SERVICE_NAME;
      attributes['log.level'] = info.level;

      // Include trace context if available
      if (info.traceId) {
        attributes['trace_id'] = info.traceId;
      }
      if (info.spanId) {
        attributes['span_id'] = info.spanId;
      }
      if (info.traceFlags !== undefined) {
        attributes['trace_flags'] = info.traceFlags;
      }

      // Include all other metadata
      Object.keys(info).forEach(key => {
        if (!['level', 'message', 'timestamp', 'service', 'traceId', 'spanId', 'traceFlags'].includes(key)) {
          attributes[key] = info[key];
        }
      });

      // Create OTLP log payload
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

      // Send to SigNoz
      this.sendToSigNoz(payload);
    } catch (error) {
      console.error('Error in SigNoz transport:', error);
    }

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

module.exports = SigNozTransport;
