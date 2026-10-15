// Version 0.3.0 moved most reports into eight commands. Old names keep
// working for this one release and say where they went. Removed commands say
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
}

// Removed commands, with the command to use instead when there is one. A key
// with a space is a subcommand, such as `seo export pseo`, and can have up to
// three words.
export const REMOVED: Record<string, string | null> = {
  'agent-readiness': null,
  'ai-readiness': null,
  'community-intent': null,
  'entity-readiness': null,
  llms: null,
  'monthly-report': 'seo report',
  okf: null,
  pseo: null,
  'report-narrative': 'seo report',
  'seo-to-ai-query': null,
  'server-logs': null,
  'client keyword-sets': null,
  links: 'seo research backlinks --target <domain>',
  'export knowledge': null,
  'export monthly': 'seo report --json',
  'export narrative': 'seo report --json',
  'export pseo': null,
  indexnow: null,
  'project keyword-sets': null,
  'projects keyword-sets': null,
  'providers bing': null,
  'providers semrush': 'seo providers',
  'providers limits': null,
  'providers spend': null,
  'providers dataforseo limits': null,
  'providers dataforseo spend': null,
  'providers ahrefs limits': null,
}

const SPEND_REASON =
  'Spend is controlled in your provider account. Set limits in DataForSEO, Ahrefs or the other provider.'

// Why a command was removed, when the general reason does not fit.
const REMOVED_REASONS: Record<string, string> = {
  'providers limits': SPEND_REASON,
  'providers spend': SPEND_REASON,
  'providers dataforseo limits': SPEND_REASON,
  'providers dataforseo spend': SPEND_REASON,
  'providers ahrefs limits': SPEND_REASON,
}

const PROJECT_ALIASES = new Set(['client', 'project', 'projects'])

// The removed command an argument list names, if any. Only the leading
// words before the first flag count, so a flag value never matches.
export function removedCommand(args: string[]): string | null {
  const flag = args.findIndex((arg) => arg.startsWith('-'))
  const words = flag === -1 ? args : args.slice(0, flag)
  const start = words[0] === 'help' ? 1 : 0
  for (let length = 3; length >= 1; length -= 1) {
    const key = words.slice(start, start + length).join(' ')
    if (words.length - start >= length && Object.hasOwn(REMOVED, key)) {
      return key
    }
  }
  return null
}

export function renamedNotice(command: string): string | null {
  const next = Object.hasOwn(RENAMED, command) ? RENAMED[command] : undefined
  return next
    ? `\`seo ${command}\` is now \`${next}\`. The old name stops working in 0.4.0.`
    : null
}

export function removedNotice(args: string[]): string | null {
  const command = removedCommand(args)
  if (!command) return null
  const replacement = REMOVED[command]
  const group = command.split(' ')[0] ?? ''
  const next = replacement
    ? `Use \`${replacement}\` instead.`
    : PROJECT_ALIASES.has(group)
      ? 'Run `seo projects --help` for the project commands.'
      : group === 'providers'
        ? 'Run `seo providers --help` for the provider commands.'
        : 'Run `seo help` for the commands.'
  const reason = Object.hasOwn(REMOVED_REASONS, command)
    ? REMOVED_REASONS[command]
    : 'SEO Skill now focuses on Search Console, analytics and keyword data.'
  return `\`seo ${command}\` was removed in 0.3.0. ${reason} ${next}`
}
