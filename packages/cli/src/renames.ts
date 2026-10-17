// Version 0.3.0 moved most reports into eight commands. Old names keep
// working until 1.0.0 and say where they went. Removed commands say
// so and stop with exit code 2.

export const RENAMED: Record<string, string> = {
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
  links: 'seo research backlinks --target <domain>',
  'export knowledge': null,
  'export monthly': 'seo report --json',
  'export narrative': 'seo report --json',
  'export pseo': null,
  indexnow: null,
  'providers semrush': 'seo providers',
  'providers limits': null,
  'providers spend': null,
  'providers dataforseo limits': null,
  'providers dataforseo spend': null,
  'providers ahrefs limits': null,
  // Removed after 0.3.0: saved projects and the commands that saved
  // history or decisions. Commands take --site, and the agent keeps its own
  // notes.
  'change-log': null,
  client: null,
  project: null,
  projects: null,
  'content-groups': null,
  'crawl-diff': 'seo crawl',
  'crawl-reports': 'seo crawl',
  diagnose: 'seo report',
  'diagnose-property': 'seo report',
  'export diagnose': 'seo report --json',
  'index-watch': 'seo page --url <url>',
  monitoring: 'seo crawl',
  schedule: null,
  'technical-watch': 'seo crawl',
  tests: 'seo compare --date <date>',
}

const HISTORY_REASON =
  'It saved history between runs. Your agent keeps its own notes now.'

const PROJECT_REASON = 'Commands take --site now instead of a saved project.'

const SPEND_REASON =
  'Spend is controlled in your provider account. Set limits in DataForSEO, Ahrefs or the other provider.'

// Why a command was removed, when the general reason does not fit.
const REMOVED_REASONS: Record<string, string> = {
  'providers limits': SPEND_REASON,
  'providers spend': SPEND_REASON,
  'providers dataforseo limits': SPEND_REASON,
  'providers dataforseo spend': SPEND_REASON,
  'providers ahrefs limits': SPEND_REASON,
  'change-log': HISTORY_REASON,
  client: PROJECT_REASON,
  project: PROJECT_REASON,
  projects: PROJECT_REASON,
  'content-groups': HISTORY_REASON,
  'crawl-diff': HISTORY_REASON,
  'crawl-reports': HISTORY_REASON,
  diagnose: HISTORY_REASON,
  'diagnose-property': HISTORY_REASON,
  'export diagnose': HISTORY_REASON,
  'index-watch': HISTORY_REASON,
  monitoring: HISTORY_REASON,
  schedule: HISTORY_REASON,
  'technical-watch': HISTORY_REASON,
  tests: HISTORY_REASON,
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
    ? `\`seo ${command}\` is now \`${next}\`. The old name stops working in 1.0.0.`
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
      ? 'Run `seo sites` to list your Search Console properties.'
      : group === 'providers'
        ? 'Run `seo providers --help` for the provider commands.'
        : 'Run `seo help` for the commands.'
  const reason = Object.hasOwn(REMOVED_REASONS, command)
    ? REMOVED_REASONS[command]
    : 'SEO Skill now focuses on Search Console, analytics and keyword data.'
  return `\`seo ${command}\` was removed. ${reason} ${next}`
}

// Flags removed from one command after 0.6.0, so it runs one way.
const REMOVED_COMMAND_FLAGS: Record<string, string[]> = {
  'internal-links': [
    '--days',
    '--limit',
    '--check-limit',
    '--min-impressions',
    '--brand-terms',
    '--include-brand',
    '--no-include-brand',
    '--js',
    '--no-js',
    '--fetch-concurrency',
    '--fetch-interval-cap',
    '--fetch-interval-ms',
  ],
}

const flagName = (arg: string) => arg.split('=')[0] ?? ''

// --project and --client selected a saved project. Both are gone. Some
// commands also lost flags that changed what they return.
export function removedFlagNotice(args: string[]): string | null {
  const flag = args.find((arg) =>
    ['--project', '--client'].includes(flagName(arg)),
  )
  if (flag) {
    return `\`${flagName(flag)}\` was removed. ${PROJECT_REASON} Pass --site with a domain, URL or sc-domain: property, or run \`seo sites\` to list your Search Console properties.`
  }
  const command = args[0] ?? ''
  const removed = Object.hasOwn(REMOVED_COMMAND_FLAGS, command)
    ? args.find((arg) =>
        REMOVED_COMMAND_FLAGS[command]?.includes(flagName(arg)),
      )
    : undefined
  if (!removed) return null
  const name = flagName(removed)
  return `\`${name}\` was removed from \`seo ${command}\`. It now sets its own limits, brand terms and page fetching, and shows them in the output.${name === '--days' ? ' Pass --start-date and --end-date for other dates.' : ''}`
}
