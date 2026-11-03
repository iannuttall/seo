import {
  Analytics02Icon,
  CloudServerIcon,
  CodeFolderIcon,
  DatabaseIcon,
  GithubIcon,
  PlugSocketIcon,
  Robot01Icon,
} from '@hugeicons/core-free-icons'

// The comparison pages under /alternatives. Each competitor's facts live in
// its own JSON file in ./alternatives, read from that vendor's own pages on
// the date in `checked`, with a source URL for each fact. SEO Skill's own
// column comes from `seoSkill` below and must match apps/mcp/README.md.

export type Competitor = {
  slug: string
  name: string
  url: string
  kind:
    | 'hosted'
    | 'self-hosted'
    | 'connector'
    | 'developer platform'
    | 'data provider'
    | 'skill'
    | 'seo suite'
  checked: string
  summary: string
  signIn: string
  tools: string
  dataSources: string[]
  clients: string[]
  webChat: string
  free: string
  price: string
  /** A few words from `free`, for the hub table. */
  freeShort: string
  /** The cheapest paid plan from `price`, for the hub table. */
  priceFrom: string
  writeActions: string
  dataStorage: string
  history: string
  licence: string
  github: {
    repo: string
    stars: number
    lastCommit: string
    version: string
    /** When scripts/refresh-alternatives.mjs last read the numbers. */
    read?: string
  } | null
  setup?: string
  /** Each item finishes the sentence "Pick {name} if". */
  pickIf: string[]
  sources: { fact: string; url: string }[]
}

const files = import.meta.glob<Competitor>('./alternatives/*.json', {
  eager: true,
  import: 'default',
})

/** Shorter names for headings, where the vendor's full name is long. */
const shortNames: Record<string, string> = {
  'mcp-gsc': 'mcp-gsc',
  'advanced-gsc': 'Advanced GSC',
  askwatch: 'AskWatch',
  'google-analytics-mcp': 'Google Analytics MCP',
  'search-console-mcp': 'search-console-mcp',
  mcpsearchconsole: 'mcpsearchconsole',
  'screaming-frog': 'Screaming Frog',
}

/** The groups on the hub, most searched first, each with its icon. */
export const groups = [
  {
    kind: 'seo suite',
    title: 'SEO tools and suites',
    text: 'Keyword research, backlinks, rank tracking, crawling and traffic estimates. Free tools for the everyday jobs, and your own Search Console data in your AI agent.',
    icon: Analytics02Icon,
  },
  {
    kind: 'hosted',
    title: 'Hosted SEO MCP servers',
    text: 'Add a URL to your agent and sign in. The closest match to the SEO Skill MCP server.',
    icon: CloudServerIcon,
  },
  {
    kind: 'self-hosted',
    title: 'Open source servers you run yourself',
    text: 'Free, but you run them on your own machine, usually with your own Google Cloud project.',
    icon: GithubIcon,
  },
  {
    kind: 'skill',
    title: 'SEO skills for coding agents',
    text: 'Instructions for Claude Code and similar agents. They bring their own data sources.',
    icon: Robot01Icon,
  },
  {
    kind: 'connector',
    title: 'Marketing data connectors',
    text: 'Search Console as one source among many ad, CRM and analytics sources.',
    icon: PlugSocketIcon,
  },
  {
    kind: 'developer platform',
    title: 'Developer tool platforms',
    text: 'Search Console as one toolkit in a platform for building your own agents.',
    icon: CodeFolderIcon,
  },
  {
    kind: 'data provider',
    title: 'SEO data providers',
    text: 'Keyword, ranking and backlink data from their own index, billed by use.',
    icon: DatabaseIcon,
  },
] as const

/**
 * The free web tools (ids in src/content/tools/manifest.mjs) that do the
 * same everyday jobs as each SEO suite, for its comparison page.
 */
export const suiteTools: Record<string, string[]> = {
  ahrefs: [
    'backlink-checker',
    'domain-rating-checker',
    'competitor-keyword-research',
    'website-traffic-checker',
  ],
  semrush: [
    'competitor-keyword-research',
    'serp-checker',
    'website-traffic-checker',
    'backlink-checker',
  ],
  moz: [
    'domain-rating-checker',
    'spam-score-checker',
    'backlink-checker',
    'competitor-keyword-research',
  ],
  similarweb: [
    'website-traffic-checker',
    'competitor-keyword-research',
    'domain-rating-checker',
    'domain-age-checker',
  ],
  spyfu: [
    'competitor-keyword-research',
    'serp-checker',
    'website-traffic-checker',
    'backlink-checker',
  ],
  accuranker: [
    'serp-checker',
    'google-algorithm-update-checker',
    'monthly-seo-report',
    'competitor-keyword-research',
  ],
  ubersuggest: [
    'competitor-keyword-research',
    'backlink-checker',
    'website-traffic-checker',
    'serp-checker',
  ],
  'screaming-frog': [
    'robots-txt-validator',
    'sitemap-validator',
    'canonical-checker',
    'internal-linking-tool',
  ],
  sitebulb: [
    'robots-txt-validator',
    'sitemap-validator',
    'canonical-checker',
    'schema-markup-validator',
  ],
  'surfer-seo': [
    'serp-checker',
    'competitor-keyword-research',
    'serp-preview',
    'schema-markup-generator',
  ],
  answerthepublic: [
    'word-combiner',
    'competitor-keyword-research',
    'serp-checker',
    'serp-preview',
  ],
  'se-ranking': [
    'competitor-keyword-research',
    'backlink-checker',
    'serp-checker',
    'website-traffic-checker',
  ],
  majestic: [
    'backlink-checker',
    'domain-rating-checker',
    'spam-score-checker',
    'domain-age-checker',
  ],
  mangools: [
    'competitor-keyword-research',
    'serp-checker',
    'backlink-checker',
    'domain-rating-checker',
  ],
  'seo-powersuite': [
    'serp-checker',
    'backlink-checker',
    'internal-linking-tool',
    'robots-txt-validator',
  ],
}

export const kindIcon = (kind: string) =>
  groups.find((group) => group.kind === kind)?.icon ?? CloudServerIcon

const kindOrder = groups.map((group) => group.kind as string)

export const competitors = Object.values(files)
  .map((item) => ({ ...item, short: shortNames[item.slug] ?? item.name }))
  .sort(
    (a, b) =>
      kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) ||
      (b.github?.stars ?? 0) - (a.github?.stars ?? 0) ||
      a.slug.localeCompare(b.slug),
  )

export type CompetitorEntry = (typeof competitors)[number]

/** SEO Skill's column, from the confirmed product facts. */
export const seoSkill = {
  name: 'SEO Skill',
  kind: 'Hosted MCP server, plus an open source CLI and local MCP server',
  signIn:
    'Add https://seoskill.dev/mcp to your agent and sign in with Google. Read-only access, no Google Cloud project, no API key.',
  tools:
    '7 hosted tools: seo_sites, seo_report, seo_page, seo_compare, seo_index, seo_research and seo_data. The CLI adds the site crawl, internal links and Bing.',
  dataSources:
    'Google Search Console, Google Analytics, URL Inspection, Clicky, and DataForSEO or Ahrefs with your own key. Bing Webmaster Tools in the CLI. Free Domain Rating by Ahrefs on research rows.',
  clients:
    'Claude Code, Claude, ChatGPT, Codex, Cursor, VS Code, Gemini CLI, Windsurf, Le Chat and any remote MCP client',
  webChat: 'Yes',
  free: 'Every on-demand tool, with no usage cap and no time limit.',
  price:
    'The weekly site audit is $50 a month per site: weekly crawl, daily Google index checks, stored history, drop and return alerts, and a Monday email and webhook. Cancel any time.',
  writeActions:
    'Read-only Google sign-in. Your agent can start the paid audit for a site, which returns a Stripe Checkout link for you to open.',
  dataStorage:
    'Search Console and analytics rows are fetched on each request and never stored, except the fix list for sites in the weekly audit. Your linked accounts and saved keys are kept, encrypted.',
  history:
    "Google's 16 months, read live. With the weekly audit, crawl and index history for the sites you audit.",
  licence:
    'Hosted service, with the CLI and local MCP server open source (Apache 2.0)',
} as const

/**
 * SEO Skill's column next to an SEO tool or suite, where the reader is
 * comparing features and price rather than MCP setup.
 */
export const seoSkillAsTool = {
  ...seoSkill,
  signIn:
    'Use the free web tools with no account. For your own data, add https://seoskill.dev/mcp to your AI agent and sign in with Google (read only).',
  tools:
    'Free web tools: backlink checker, Domain Rating, competitor keywords, SERP checker, traffic estimates, robots.txt, sitemap, schema and more. In your AI agent: Search Console reports (quick wins, low CTR, striking distance, content decay, cannibalization, traffic drops), page checks, index checks, before and after comparisons, and keyword research with your own key. A site crawler and internal links in the CLI.',
  clients:
    'Your browser for the web tools. Claude Code, Claude, ChatGPT, Codex, Cursor, VS Code, Gemini CLI, Windsurf, Le Chat and any remote MCP client for your own data.',
} as const

/** Rows of the side by side table: label, SEO Skill, competitor field. */
export const compareRows = [
  ['Connect', 'signIn', 'signIn'],
  ['Tools', 'tools', 'tools'],
  ['Data sources', 'dataSources', 'dataSources'],
  ['AI clients', 'clients', 'clients'],
  ['Works in web chat', 'webChat', 'webChat'],
  ['Free', 'free', 'free'],
  ['Paid plans', 'price', 'price'],
  ['Can it change anything', 'writeActions', 'writeActions'],
  ['Your data', 'dataStorage', 'dataStorage'],
  ['History', 'history', 'history'],
  ['Licence', 'licence', 'licence'],
] as const

/** The side by side rows for an SEO tool or suite. */
export const suiteRows = [
  ['Get started', 'signIn', 'signIn'],
  ['What it does', 'tools', 'tools'],
  ['Data', 'dataSources', 'dataSources'],
  ['Where you use it', 'clients', 'clients'],
  ['In Claude or ChatGPT on the web', 'webChat', 'webChat'],
  ['Free', 'free', 'free'],
  ['Paid plans', 'price', 'price'],
  ['Can it change your site', 'writeActions', 'writeActions'],
  ['Your data', 'dataStorage', 'dataStorage'],
  ['History', 'history', 'history'],
  ['Licence', 'licence', 'licence'],
] as const

export const cell = (value: string | string[]) =>
  Array.isArray(value) ? value.join(', ') || 'Not stated' : value

/** Why a reader might pick SEO Skill. Each item finishes "Pick SEO Skill if". */
export const reasonsFor = (item: Competitor): string[] => {
  const free =
    'You want every tool your agent calls to be free, with no usage cap and no trial that ends.'
  const sources =
    'You want Search Console, Google Analytics, URL Inspection and Clicky behind one Google sign-in, plus keyword research with your own DataForSEO or Ahrefs key.'
  switch (item.kind) {
    case 'self-hosted':
    case 'skill':
      return [
        'You want nothing to install and no Google Cloud project: one URL and a Google sign-in.',
        'You want it in claude.ai, ChatGPT and Le Chat on the web, and in cloud agents that cannot reach your laptop.',
        free,
        sources,
      ]
    case 'hosted':
      return [
        free,
        sources,
        'You want your Search Console rows fetched on each request and never stored, except the fix list for sites in the weekly audit.',
        'You want a weekly crawl, daily index checks and drop alerts done for you, for $50 a month per site.',
      ]
    case 'seo suite':
      return [
        'You want the everyday lookups for free: backlinks, Domain Rating, competitor keywords, SERPs and traffic estimates, with no account.',
        'You want your AI agent to answer from your own Search Console and Google Analytics data, not only from an index estimate.',
        'You already pay for keyword data: SEO Skill uses your own DataForSEO or Ahrefs key, so you pay that provider and nothing on top.',
        'You want a weekly crawl, daily index checks and drop alerts for $50 a month per site, with no seats to buy.',
      ]
    default:
      return [
        'You want a server built for SEO questions: quick wins, low CTR, content decay, cannibalization, traffic drops and index checks.',
        free,
        sources,
        'You want no workspace or data flow to set up first, just a URL and a Google sign-in.',
      ]
  }
}
