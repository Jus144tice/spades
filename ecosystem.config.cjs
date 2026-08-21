// Managed by StackSchematic observation work. Revert: `pm2 delete spades && pm2 start /usr/bin/bash --name spades --cwd /opt/apps/spades -- -c "npm start" && pm2 save && rm /opt/apps/spades/ecosystem.config.cjs`
module.exports = {
  apps: [
    {
      name: 'spades',
      cwd: '/opt/apps/spades',
      script: '/usr/bin/bash',
      args: ['-c', 'npm start'],
      env: {
        NODE_OPTIONS: '--require @opentelemetry/auto-instrumentations-node/register',
        OTEL_SERVICE_NAME: 'spades',
        OTEL_RESOURCE_ATTRIBUTES: 'service.namespace=graham-games,deployment.environment=production',
        OTEL_TRACES_EXPORTER: 'otlp',
        OTEL_METRICS_EXPORTER: 'none',
        OTEL_LOGS_EXPORTER: 'none',
        OTEL_EXPORTER_OTLP_PROTOCOL: 'grpc',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://192.168.1.22:4317',
      },
    },
  ],
};
