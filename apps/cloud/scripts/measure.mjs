// Runs one crawl against the fixture through `wrangler dev` and prints what
// it cost: wakes, alarms, requests, rows, storage, wall time, and the local
// workerd process's CPU time and peak memory as an upper bound.
//
// node scripts/measure.mjs '{"site":"s500","pages":500,"week":1,"run":{...}}'

import { readdirSync, readFileSync } from 'node:fs'

const input = JSON.parse(process.argv[2] ?? '{}')
const api = process.env.POC_API ?? 'http://127.0.0.1:8787'
const fixture = process.env.FIXTURE ?? 'http://127.0.0.1:8788'
const headers = { authorization: `Bearer ${process.env.POC_TOKEN ?? 'local'}` }
const clockTicks = 100

function workerd() {
  const pids = readdirSync('/proc').filter((pid) => /^\d+$/.test(pid))
  return pids.flatMap((pid) => {
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8')
      if (!cmd.includes('workerd')) return []
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
        .split(') ')[1]
        .split(' ')
      const status = readFileSync(`/proc/${pid}/status`, 'utf8')
      const rss = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0) / 1024
      return [
        {
          pid,
          cpuMs: ((Number(stat[11]) + Number(stat[12])) * 1000) / clockTicks,
          rssMb: rss,
        },
      ]
    } catch {
      return []
    }
  })
}

const call = async (path, body) => {
  const response = await fetch(`${api}${path}`, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  return response.json()
}

if (input.reset !== false) {
  const params = new URLSearchParams({
    pages: String(input.pages ?? 500),
    week: String(input.week ?? 1),
    throttle: String(input.throttle ?? 0),
    delay: String(input.delay ?? 0),
  })
  await fetch(`${fixture}/__reset?${params}`)
}
const before = workerd()
const startedAt = Date.now()
const options = { origin: fixture, ...input.run }
const started = await call(`/sites/${input.site}/start`, options)
if (!started.created) console.error('a run was already running; measuring it')
let status
let peakRss = 0
while (true) {
  await new Promise((resolve) => setTimeout(resolve, input.poll ?? 3000))
  for (const proc of workerd()) peakRss = Math.max(peakRss, proc.rssMb)
  status = await call(`/sites/${input.site}/status`)
  if (input.verbose)
    console.error(
      status.phase,
      status.fetched,
      status.inspected,
      status.wakes,
      status.concurrency,
      status.pages,
    )
  if (status.status !== 'running') break
}
const after = workerd()
const cpuMs = after.reduce(
  (sum, proc) =>
    sum + proc.cpuMs - (before.find((b) => b.pid === proc.pid)?.cpuMs ?? 0),
  0,
)
const report = await call(`/sites/${input.site}/report?new=1`)
const site = await (await fetch(`${fixture}/__stats`)).json()
const summary = report.summary
console.log(
  JSON.stringify({
    site: input.site,
    week: input.week ?? 1,
    options: input.run,
    status: status.status,
    complete: summary.complete,
    wall_s: Math.round((Date.now() - startedAt) / 100) / 10,
    pages: summary.pages,
    usage: summary.usage,
    per_page: {
      rows_written:
        Math.round(
          (summary.usage.rows_written / Math.max(1, summary.pages.fetched)) *
            10,
        ) / 10,
      requests:
        Math.round(
          (summary.usage.requests / Math.max(1, summary.pages.fetched)) * 100,
        ) / 100,
    },
    storage_bytes: status.storage_bytes,
    findings: summary.findings,
    changes: { ...summary.changes, examples: summary.changes.examples.length },
    new_or_changed_listed: report.findings.length,
    fixture: {
      requests: site.requests,
      inspections: site.inspections,
      max_in_flight: site.maxInFlight,
      max_per_second: site.maxPerSecond,
      throttled: site.throttled,
    },
    local_workerd: {
      cpu_ms: Math.round(cpuMs),
      cpu_ms_per_page:
        Math.round((cpuMs / Math.max(1, summary.pages.fetched)) * 10) / 10,
      peak_rss_mb: Math.round(peakRss),
    },
  }),
)
