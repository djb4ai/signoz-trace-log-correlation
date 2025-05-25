// tracing.js
'use strict'
const process = require('process');
const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

// Load environment variables
require('dotenv').config();

// do not set headers in exporterOptions, the OTel spec recommends setting headers through ENV variables
// https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/protocol/exporter.md#specifying-headers-via-environment-variables

const exporterOptions = {
  url: 'https://ingest.in.signoz.cloud:443/v1/traces',
  headers: {
    "signoz-access-token": "br2AU5y1pwXrbz8o4kz8ZvNZSL4sz0I0Cmy4"
  }
}

const traceExporter = new OTLPTraceExporter(exporterOptions);
const sdk = new opentelemetry.NodeSDK({
  traceExporter,
  instrumentations: [getNodeAutoInstrumentations({
    // Disable file system instrumentation to reduce noise
    '@opentelemetry/instrumentation-fs': {
      enabled: false
    }
  })],
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'nodejs-log-correlation-demo',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0'
  })
});

// initialize the SDK and register with the OpenTelemetry API
// this enables the API to record telemetry
sdk.start()

console.log('🚀 OpenTelemetry tracing initialized successfully');

// gracefully shut down the SDK on process exit
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('✅ Tracing SDK shut down successfully'))
    .catch((error) => console.log('❌ Error shutting down tracing SDK', error))
    .finally(() => process.exit(0));
});

module.exports = sdk;