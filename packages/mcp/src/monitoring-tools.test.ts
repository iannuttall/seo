import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerMonitoringTools } from './monitoring-tools.js'

type Schema = { safeParse(value: unknown): { success: boolean } }

test('index monitoring MCP inputs are non-empty and bounded', () => {
  const configs = new Map<string, { inputSchema: Record<string, Schema> }>()
  registerMonitoringTools({
    registerTool(
      name: string,
      config: { inputSchema: Record<string, Schema> },
    ) {
      configs.set(name, config)
    },
  } as never)

  const watch = configs.get('seo_index_watch')?.inputSchema
  const monitor = configs.get('seo_index_monitor')?.inputSchema
  const plan = configs.get('seo_index_coverage_plan')?.inputSchema
  assert.ok(watch)
  assert.ok(monitor)
  assert.ok(plan)
  assert.equal(watch.urls?.safeParse([]).success, false)
  assert.equal(
    watch.urls?.safeParse(
      Array.from({ length: 101 }, (_, index) => `https://example.com/${index}`),
    ).success,
    false,
  )
  assert.equal(watch.dailyLimit?.safeParse(2_001).success, false)
  assert.equal(monitor.sitemaps?.safeParse([]).success, false)
  assert.equal(monitor.inspectLimit?.safeParse(101).success, false)
  assert.equal(plan.targetCycleDays?.safeParse(366).success, false)
  assert.equal(plan.maxUrls?.safeParse(250_001).success, false)
})
