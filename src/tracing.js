const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-otlp-http');

// Load environment variables
require('dotenv').config();

// Configure the OTLP exporter for SigNoz
const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'https://ingest.in.signoz.cloud:443/v1/traces',
  headers: {
    'signoz-access-token': process.env.SIGNOZ_ACCESS_TOKEN
  }
});

// Initialize the Node SDK
const sdk = new NodeSDK({
  traceExporter,
  instrumentations: [getNodeAutoInstrumentations({
    // Disable file system instrumentation to reduce noise
    '@opentelemetry/instrumentation-fs': {
      enabled: false
    }
  })],
  serviceName: 'nodejs-log-correlation-demo',
  serviceVersion: '1.0.0'
});

// Start the SDK
sdk.start();

console.log('🚀 OpenTelemetry tracing initialized successfully');

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('✅ Tracing SDK shut down successfully'))
    .catch((error) => console.log('❌ Error shutting down tracing SDK', error))
    .finally(() => process.exit(0));
});

module.exports = sdk;