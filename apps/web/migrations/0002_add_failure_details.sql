CREATE TABLE telemetry_events_v2 (
  received_month TEXT NOT NULL
    CHECK (
      received_month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'
      AND CAST(substr(received_month, 6, 2) AS INTEGER) BETWEEN 1 AND 12
    ),
  event TEXT NOT NULL
    CHECK (event IN (
      'first_run',
      'setup_complete',
      'audit_start',
      'audit_complete',
      'audit_failed',
      'command_failed',
      'first_audit_complete',
      'active_d1',
      'active_d7',
      'active_d30'
    )),
  version TEXT NOT NULL CHECK (length(version) BETWEEN 1 AND 64),
  agent TEXT NOT NULL
    CHECK (agent IN ('claude-code', 'cursor', 'codex', 'cli', 'unknown')),
  os TEXT NOT NULL
    CHECK (os IN (
      'aix',
      'android',
      'darwin',
      'freebsd',
      'haiku',
      'linux',
      'openbsd',
      'sunos',
      'win32'
    )),
  arch TEXT NOT NULL
    CHECK (arch IN (
      'arm',
      'arm64',
      'ia32',
      'loong64',
      'mips',
      'mipsel',
      'ppc',
      'ppc64',
      'riscv64',
      's390',
      's390x',
      'x64'
    )),
  node TEXT NOT NULL
    CHECK (
      node NOT GLOB '*[^0-9]*'
      AND length(node) BETWEEN 1 AND 3
    ),
  cohort TEXT NOT NULL
    CHECK (
      cohort GLOB '[0-9][0-9][0-9][0-9]-W[0-5][0-9]'
      AND CAST(substr(cohort, 7, 2) AS INTEGER) BETWEEN 1 AND 53
    ),
  schema INTEGER NOT NULL CHECK (schema IN (1, 2)),
  error_category TEXT
    CHECK (error_category IN (
      'auth',
      'crawl_timeout',
      'network',
      'config',
      'data',
      'database',
      'filesystem',
      'internal',
      'unknown'
    )),
  report TEXT CHECK (length(report) BETWEEN 1 AND 64),
  failure_reason TEXT
    CHECK (failure_reason IN (
      'access_denied',
      'auth_config_required',
      'auth_expired',
      'auth_required',
      'crawl_timeout',
      'database_constraint',
      'database_corrupt',
      'database_locked',
      'database_read_only',
      'database_unique_constraint',
      'filesystem_full',
      'filesystem_not_found',
      'filesystem_permission',
      'insufficient_data',
      'internal_error',
      'invalid_input',
      'network_connection',
      'network_dns',
      'network_timeout',
      'network_tls',
      'optional_provider_unavailable',
      'property_not_found',
      'provider_unavailable',
      'rate_limited',
      'unknown'
    )),
  failure_context TEXT
    CHECK (failure_context IN ('crawl_pages_run_id_url')),
  operation TEXT
    CHECK (operation IN (
      'analytics',
      'auth',
      'cache',
      'change-log',
      'client',
      'content',
      'content-groups',
      'crawl-reports',
      'diagnose',
      'export',
      'gsc-query',
      'indexnow',
      'init',
      'llms',
      'logs',
      'mcp',
      'monitoring',
      'okf',
      'perf',
      'privacy',
      'project',
      'projects',
      'providers',
      'pseo',
      'reports',
      'reset',
      'schedule',
      'server-logs',
      'setup',
      'skill',
      'sites',
      'start',
      'telemetry',
      'tests',
      'updates',
      'url-inspect'
    )),
  CHECK (
    (event IN ('audit_failed', 'command_failed') AND error_category IS NOT NULL)
    OR (event NOT IN ('audit_failed', 'command_failed') AND error_category IS NULL)
  ),
  CHECK (
    (event IN (
      'audit_start',
      'audit_complete',
      'audit_failed',
      'first_audit_complete'
    ) AND report IS NOT NULL)
    OR (event NOT IN (
      'audit_start',
      'audit_complete',
      'audit_failed',
      'first_audit_complete'
    ) AND report IS NULL)
  ),
  CHECK (
    (schema = 1
      AND event <> 'command_failed'
      AND failure_reason IS NULL
      AND failure_context IS NULL
      AND operation IS NULL)
    OR schema = 2
  ),
  CHECK (
    (schema = 2
      AND event IN ('audit_failed', 'command_failed')
      AND failure_reason IS NOT NULL)
    OR (schema = 1 OR event NOT IN ('audit_failed', 'command_failed'))
  ),
  CHECK (
    failure_context IS NULL
    OR (
      schema = 2
      AND event IN ('audit_failed', 'command_failed')
      AND failure_reason = 'database_unique_constraint'
    )
  ),
  CHECK (
    (event = 'command_failed' AND schema = 2 AND operation IS NOT NULL)
    OR (event <> 'command_failed' AND operation IS NULL)
  ),
  CHECK (
    event IN ('audit_failed', 'command_failed')
    OR (failure_reason IS NULL AND failure_context IS NULL)
  )
) STRICT;

INSERT INTO telemetry_events_v2 (
  received_month,
  event,
  version,
  agent,
  os,
  arch,
  node,
  cohort,
  schema,
  error_category,
  report,
  failure_reason,
  failure_context,
  operation
)
SELECT
  received_month,
  event,
  version,
  agent,
  os,
  arch,
  node,
  cohort,
  schema,
  error_category,
  report,
  NULL,
  NULL,
  NULL
FROM telemetry_events;

DROP TABLE telemetry_events;
ALTER TABLE telemetry_events_v2 RENAME TO telemetry_events;

CREATE INDEX telemetry_events_stats_idx
ON telemetry_events (
  event,
  received_month,
  agent,
  cohort,
  report,
  error_category,
  failure_reason,
  operation
);
