/*  tracing.js  */
'use strict';
const process      = require('process');
const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPLogExporter   } = require('@opentelemetry/exporter-logs-otlp-http');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { LoggerProvider, BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { logs } = require('@opentelemetry/api-logs');
const {
  SERVICE_NAME,
  SERVICE_VERSION,
  SIGNOZ_CONFIG,
  RESOURCE_ATTRIBUTES
} = require('./config');

require('dotenv').config();

/* ------------------------------------------------------------------ */
/*  Exporters (traces + logs)                                         */
/* ------------------------------------------------------------------ */
const traceExporter = new OTLPTraceExporter({
  url: SIGNOZ_CONFIG.traces.url,
  headers: { 'signoz-access-token': SIGNOZ_CONFIG.accessToken }
});

const logExporter = new OTLPLogExporter({
  url: SIGNOZ_CONFIG.logs.url,
  headers: { 'signoz-access-token': SIGNOZ_CONFIG.accessToken }
});

/* ------------------------------------------------------------------ */
/*  SDK setup                                                         */
/* ------------------------------------------------------------------ */
const sdk = new opentelemetry.NodeSDK({
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs':      { enabled: false },
      '@opentelemetry/instrumentation-winston': { enabled: false } // we handle logs ourselves
    })
  ],
  resource: new Resource({
    ...RESOURCE_ATTRIBUTES,
    [SemanticResourceAttributes.SERVICE_NAME]:    SERVICE_NAME,
    [SemanticResourceAttributes.SERVICE_VERSION]: SERVICE_VERSION
  })
});

sdk.start();

/* ------------------------------------------------------------------ */
/*  Logs provider (for any direct OTEL-API log calls, optional)       */
/* ------------------------------------------------------------------ */
const loggerProvider = new LoggerProvider({
  resource: new Resource(RESOURCE_ATTRIBUTES)
});
loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(logExporter));
logs.setGlobalLoggerProvider(loggerProvider);

console.log('🚀 OpenTelemetry tracing & logging initialised');

/* ------------------------------------------------------------------ */
/*  Graceful shutdown                                                 */
/* ------------------------------------------------------------------ */
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('✅ OpenTelemetry SDK shut down'))
    .catch(err =>  console.error('❌ Error shutting down OpenTelemetry', err))
    .finally(() => process.exit(0));
});

module.exports = { sdk, loggerProvider, logExporter };
