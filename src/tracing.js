// tracing.js
'use strict'
const process = require('process');
const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { Resource } = require('@opentelemetry/resources');
// SemanticResourceAttributes now defined in config.js
const { LoggerProvider, BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { logs } = require('@opentelemetry/api-logs');
const { SERVICE_NAME, SERVICE_VERSION, SIGNOZ_CONFIG, RESOURCE_ATTRIBUTES } = require('./config');

// Load environment variables
require('dotenv').config();

// do not set headers in exporterOptions, the OTel spec recommends setting headers through ENV variables
// https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/protocol/exporter.md#specifying-headers-via-environment-variables

const exporterOptions = {
  url: SIGNOZ_CONFIG.traces.url,
  headers: {
    "signoz-access-token": SIGNOZ_CONFIG.accessToken
  }
}

const logExporterOptions = {
  url: SIGNOZ_CONFIG.logs.url,
  headers: {
    "signoz-access-token": SIGNOZ_CONFIG.accessToken
  }
}

const traceExporter = new OTLPTraceExporter(exporterOptions);
const logExporter = new OTLPLogExporter(logExporterOptions);
const sdk = new opentelemetry.NodeSDK({
  traceExporter,
  instrumentations: [getNodeAutoInstrumentations({
    // Disable file system instrumentation to reduce noise
    '@opentelemetry/instrumentation-fs': {
      enabled: false
    }
  })],
  resource: new Resource(RESOURCE_ATTRIBUTES)
});

// initialize the SDK and register with the OpenTelemetry API
// this enables the API to record telemetry
sdk.start()

// Configure logs provider separately (disabled - using direct HTTP transport)
// const logResource = new Resource({
//   [SemanticResourceAttributes.SERVICE_NAME]: 'nodejs-log-correlation-demo',
//   [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0'
// });

// const loggerProvider = new LoggerProvider({
//   resource: logResource,
// });

// // Add the OTLP log exporter with batch processor
// loggerProvider.addLogRecordProcessor(
//   new BatchLogRecordProcessor(logExporter)
// );

// // Register the logger provider
// logs.setGlobalLoggerProvider(loggerProvider);

console.log('🚀 OpenTelemetry tracing and logging initialized successfully');

// gracefully shut down the SDK on process exit
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('✅ Tracing SDK shut down successfully'))
    .catch((error) => console.log('❌ Error shutting down SDK', error))
    .finally(() => process.exit(0));
});

module.exports = { sdk, logExporter };