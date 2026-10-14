// Version 0.3.0 moved most reports into eight commands. Old names keep
// working for this one release and say where they went. Removed reports say
// so and stop. Both lists go in 0.4.0.

export const RENAMED: Record<string, string> = {
  'diagnose-property': 'seo report',
  'refresh-priorities': 'seo report',
  'query-cluster': 'seo report',
  'quick-wins': 'seo report --section quick-wins',
  'ctr-underperformers': 'seo report --section low-ctr',
  'striking-distance': 'seo report --section striking-distance',
  'second-page': 'seo report --section second-page',
  decaying: 'seo report --section content-decay',
  cannibal: 'seo report --section cannibalization',
  'traffic-anomaly': 'seo report --section traffic-drop',
  'page-opportunities': 'seo page --url <url>',
  'audit-page': 'seo page --url <url>',
  'url-inspect': 'seo page --url <url>',
  'segment-impact': 'seo compare --date <date>',
  'update-correlate': 'seo compare --date <date>',
  'update-postmortem': 'seo compare --date <date>',
  'link-recover': 'seo index',
  'gsc-query': 'seo data',
  links: 'seo research backlinks --target <domain>',
}

export const REMOVED = new Set([
  'agent-readiness',
  'ai-readiness',
  'community-intent',
  'entity-readiness',
  'llms',
  'monthly-report',
  'okf',
  'pseo',
  'report-narrative',
  'seo-to-ai-query',
  'server-logs',
])

export function renamedNotice(command: string): string | null {
  const next = RENAMED[command]
  return next
    ? `\`seo ${command}\` is now \`${next}\`. The old name stops working in 0.4.0.`
    : null
}

export function removedNotice(command: string): string | null {
  return REMOVED.has(command)
    ? `\`seo ${command}\` was removed in 0.3.0. SEO Skill now focuses on Search Console, analytics and keyword data. Run \`seo help\` for the commands.`
    : null
}
