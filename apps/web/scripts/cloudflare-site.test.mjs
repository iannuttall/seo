import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(appRoot, 'dist')

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('Cloudflare limits the Worker to telemetry, bounded tools, and static assets', () => {
  const config = JSON.parse(
    readFileSync(resolve(appRoot, 'wrangler.jsonc'), 'utf8'),
  )
  const envManifest = JSON.parse(
    readFileSync(resolve(appRoot, 'env-manifest.json'), 'utf8'),
  )
  const packageJson = JSON.parse(
    readFileSync(resolve(appRoot, 'package.json'), 'utf8'),
  )
  const headers = readFileSync(resolve(dist, '_headers'), 'utf8')
  const manifest = JSON.parse(
    readFileSync(resolve(dist, 'agent-routes.json'), 'utf8'),
  )

  assert.equal(config.name, 'seo-skill')
  assert.match(
    packageJson.scripts['preview:cloudflare'],
    /^PUBLIC_DISABLE_TURNSTILE_FOR_LOCAL_PREVIEW=true /,
  )
  assert.equal(config.main, './worker/index.ts')
  assert.equal(config.assets.binding, 'ASSETS')
  assert.deepEqual(config.assets.run_worker_first, ['/api/*'])
  assert.deepEqual(config.compatibility_flags, [
    'nodejs_compat',
    'global_fetch_strictly_public',
  ])
  assert.equal(config.assets.html_handling, 'drop-trailing-slash')
  assert.equal(config.assets.not_found_handling, '404-page')
  assert.equal(config.analytics_engine_datasets, undefined)
  assert.deepEqual(config.secrets, {
    required: [
      'TURNSTILE_SECRET_KEY',
      'TOOL_QUOTA_HASH_KEY',
      'AHREFS_API_KEY',
      'DATAFORSEO_LOGIN',
      'DATAFORSEO_PASSWORD',
    ],
  })
  assert.deepEqual(envManifest.requiredRemote, config.secrets.required)
  assert.deepEqual(envManifest.optionalRemote, [])
  assert.deepEqual(config.vars, {
    LOCAL_TOOL_PREVIEW: 'false',
    AHREFS_DAILY_PROVIDER_LIMIT: '500',
    DATAFORSEO_SPAM_DAILY_PROVIDER_LIMIT: '100',
    DATAFORSEO_TRAFFIC_DAILY_PROVIDER_LIMIT: '10',
  })
  assert.equal(config.observability.enabled, false)
  assert.equal(config.observability.logs.enabled, false)
  assert.equal(config.observability.logs.invocation_logs, false)
  assert.equal(config.kv_namespaces, undefined)
  assert.deepEqual(config.durable_objects, {
    bindings: [{ name: 'PAID_TOOL_GUARD', class_name: 'PaidToolGuard' }],
  })
  assert.deepEqual(config.exports, {
    PaidToolGuard: { type: 'durable-object', storage: 'sqlite' },
  })
  assert.deepEqual(config.ratelimits, [
    {
      name: 'TOOL_CLIENT_RATE_LIMITER',
      namespace_id: '2026080901',
      simple: { limit: 20, period: 60 },
    },
    {
      name: 'TOOL_ROUTE_RATE_LIMITER',
      namespace_id: '2026080902',
      simple: { limit: 100, period: 60 },
    },
  ])
  assert.deepEqual(config.d1_databases, [
    {
      binding: 'TELEMETRY_DB',
      database_name: 'seo-telemetry',
      database_id: '4b8c5f37-983d-4229-a712-77dbcd853efe',
      migrations_dir: './migrations',
    },
  ])
  assert.equal(config.r2_buckets, undefined)
  assert.deepEqual(config.routes, [
    { pattern: 'seoskill.dev', custom_domain: true },
    { pattern: 'www.seoskill.dev', custom_domain: true },
  ])
  assert.equal(existsSync(resolve(appRoot, 'src/worker.ts')), false)
  assert.equal(existsSync(resolve(appRoot, 'tsconfig.worker.json')), false)
  assert.equal(existsSync(resolve(appRoot, 'worker-configuration.d.ts')), false)
  assert.equal(existsSync(resolve(appRoot, 'worker/index.ts')), true)
  assert.equal(existsSync(resolve(appRoot, 'worker/tsconfig.json')), true)
  assert.equal(
    existsSync(resolve(appRoot, 'worker/worker-configuration.d.ts')),
    true,
  )
  const migration = readFileSync(
    resolve(appRoot, 'migrations/0001_create_telemetry_events.sql'),
    'utf8',
  )
  assert.match(migration, /CREATE TABLE telemetry_events/)
  assert.match(migration, /received_month TEXT NOT NULL/)
  assert.doesNotMatch(
    migration,
    /ip_address|country|region|city|request_headers|user_id|machine_id/i,
  )
  const failureMigration = readFileSync(
    resolve(appRoot, 'migrations/0002_add_failure_details.sql'),
    'utf8',
  )
  assert.match(
    failureMigration,
    /schema INTEGER NOT NULL CHECK \(schema IN \(1, 2\)\)/,
  )
  assert.match(failureMigration, /failure_reason TEXT/)
  assert.match(failureMigration, /failure_context TEXT/)
  assert.match(failureMigration, /operation TEXT/)
  assert.match(failureMigration, /INSERT INTO telemetry_events_v2/)
  assert.doesNotMatch(
    failureMigration,
    /raw_error|error_message|stack_trace|arguments TEXT|url TEXT|path TEXT|ip_address|country|region|city|request_headers|user_id|machine_id/i,
  )

  assert.match(
    headers,
    /Content-Signal: search=yes, ai-input=yes, ai-train=yes/,
  )
  assert.match(headers, /Strict-Transport-Security: max-age=300/)
  assert.match(headers, /rel="sitemap"; type="application\/xml"/)
  assert.match(headers, /rel="llms-txt"; type="text\/markdown"/)
  assert.match(headers, /rel="agent-skills"; type="application\/json"/)
  assert.match(
    headers,
    new RegExp(
      escapeRegExp(
        '/*.md\n  Content-Type: text/markdown; charset=utf-8\n  Vary: Accept',
      ),
    ),
  )
  assert.match(
    headers,
    new RegExp(
      escapeRegExp(
        '/docs/*.md\n  Link: <https://seoskill.dev/docs/:splat>; rel="canonical"',
      ),
    ),
  )
  assert.match(
    headers,
    new RegExp(
      escapeRegExp(
        '/tools/*.md\n  Link: <https://seoskill.dev/tools/:splat>; rel="canonical"',
      ),
    ),
  )
  assert.match(
    headers,
    new RegExp(
      escapeRegExp(
        '/features/*.md\n  Link: <https://seoskill.dev/features/:splat>; rel="canonical"',
      ),
    ),
  )
  assert.match(
    headers,
    new RegExp(
      escapeRegExp(
        '/blog/*.md\n  Link: <https://seoskill.dev/blog/:splat>; rel="canonical"',
      ),
    ),
  )
  assert.doesNotMatch(headers, /X-Markdown-Tokens:/)
  assert.doesNotMatch(headers, /Generated agent markdown headers/)

  const headerRules = headers
    .split('\n')
    .filter(
      (line) =>
        line.length > 0 && !line.startsWith(' ') && !line.startsWith('#'),
    )
  assert.ok(
    headerRules.length <= 100,
    `Cloudflare supports at most 100 _headers rules, found ${headerRules.length}`,
  )

  for (const page of manifest.pages) {
    assert.ok(Number.isInteger(page.tokens) && page.tokens > 0)
    if (
      page.markdownPath.startsWith('/blog/') ||
      page.markdownPath.startsWith('/docs/') ||
      page.markdownPath.startsWith('/features/') ||
      page.markdownPath.startsWith('/tools/')
    )
      continue
    assert.ok(
      headerRules.includes(page.markdownPath),
      `Missing exact Markdown header rule for ${page.markdownPath}`,
    )
  }

  for (const page of [
    'cookies',
    'privacy',
    'security',
    'terms',
    'trademarks',
  ]) {
    assert.match(
      headers,
      new RegExp(
        `/${page}\\.md\\n  Link: <https://seoskill\\.dev/${page}>; rel="canonical"\\n  X-Robots-Tag: noindex, follow`,
      ),
    )
    assert.match(
      headers,
      new RegExp(
        `/${page}\\n  Link: <https://seoskill\\.dev/${page}\\.md>; rel="alternate"; type="text/markdown"\\n  Vary: Accept\\n  X-Robots-Tag: noindex, follow`,
      ),
    )
  }
})
