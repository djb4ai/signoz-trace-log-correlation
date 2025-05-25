/**
 * Centralized configuration for OpenTelemetry tracing and logging
 * Ensures consistent service identification across all telemetry data
 */

const SERVICE_NAME = 'nodejs-log-correlation-demo-3';
const SERVICE_VERSION = '1.0.0';

// SigNoz configuration
const SIGNOZ_CONFIG = {
  endpoint: 'https://ingest.in.signoz.cloud:443',
  accessToken: 'br2AU5y1pwXrbz8o4kz8ZvNZSL4sz0I0Cmy4',
  traces: {
    url: 'https://ingest.in.signoz.cloud:443/v1/traces'
  },
  logs: {
    url: 'https://ingest.in.signoz.cloud:443/v1/logs'
  }
};

// OpenTelemetry resource attributes
const RESOURCE_ATTRIBUTES = {
  'service.name': SERVICE_NAME,
  'service.version': SERVICE_VERSION,
  'service.environment': process.env.NODE_ENV || 'development'
};

module.exports = {
  SERVICE_NAME,
  SERVICE_VERSION,
  SIGNOZ_CONFIG,
  RESOURCE_ATTRIBUTES
};
