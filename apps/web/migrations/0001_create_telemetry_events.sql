CREATE TABLE telemetry_events (
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
  schema INTEGER NOT NULL CHECK (schema = 1),
  error_category TEXT
    CHECK (error_category IN (
      'auth',
      'crawl_timeout',
      'network',
      'config',
      'unknown'
    )),
  report TEXT CHECK (length(report) BETWEEN 1 AND 64),
  CHECK (
    (event = 'audit_failed' AND error_category IS NOT NULL)
    OR (event <> 'audit_failed' AND error_category IS NULL)
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
  )
) STRICT;

CREATE INDEX telemetry_events_stats_idx
ON telemetry_events (event, received_month, agent, cohort, report);
