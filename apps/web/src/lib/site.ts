export const site = {
  name: 'SEO Skill',
  packageName: 'seo',
  url: 'https://seoskill.dev',
  mcpUrl: 'https://seoskill.dev/mcp',
  description:
    'Give your AI agent facts from your own Search Console, analytics and keyword data through a free hosted MCP server or the open source seo CLI.',
  repository: 'https://github.com/iannuttall/seo',
  issues: 'https://github.com/iannuttall/seo/issues',
  advisory: 'https://github.com/iannuttall/seo/security/advisories/new',
  npm: 'https://www.npmjs.com/package/seo',
  clickySiteId: '101508763',
} as const

/**
 * The founder card and About page. Audience numbers were read from each
 * profile on `asOf` (X through api.fxtwitter.com, YouTube from the channel
 * page, LinkedIn from Ian); update them all together. They are what pages
 * show with no JavaScript. The site Worker refreshes X and YouTube daily
 * (worker/founder.ts) and pages swap in its numbers from /api/founder.
// Career facts on the About page come from ian.is/about.
 */
export const founder = {
  name: 'Ian Nuttall',
  anchor: 'ian-nuttall',
  /** Approximate. Copy says "20+ years", never an exact count. */
  seoSince: 2005,
  asOf: '2026-11-03',
  url: 'https://ian.is',
  x: { url: 'https://x.com/iannuttall', followers: 81_824 },
  youtube: {
    url: 'https://www.youtube.com/@inuttall',
    channelId: 'UC0z38FxOnJjJIN83E7OHZjQ',
    subscribers: 16_900,
  },
  linkedin: { url: 'https://www.linkedin.com/in/iannuttall', followers: 4_471 },
  github: 'https://github.com/iannuttall',
} as const

/** 81824 reads as 81.8k, 16900 as 16.9k. */
export const shortCount = (value: number) =>
  value >= 1000
    ? `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`
    : `${value}`

/** The commands people copy to connect or install. */
export const setupCommands = {
  claude: 'claude mcp add --transport http seoskill https://seoskill.dev/mcp',
  codex: 'codex mcp add seoskill --url https://seoskill.dev/mcp',
  url: 'https://seoskill.dev/mcp',
  install: 'npm i -g seo && seo start',
} as const
