// The AI visibility trackers on /alternatives/peec-ai and
// /alternatives/profound. Each fact comes from the vendor's own pages,
// listed in `sources` for whoever re-reads them. The site never links to
// them or shows when they were read. These pages never state another
// tool's price.

export type Tracker = {
  name: string
  engines: string
  cadence: string
  extras: string
  doesTheWork: string
  mcp: string
  /** Each item finishes the sentence "Pick {name} if". */
  pickIf: string[]
}

export const trackers = {
  peec: {
    name: 'Peec AI',
    engines:
      'ChatGPT, Perplexity, Gemini, Google AI Overviews, Google AI Mode and Bing AI Mode on every plan. Claude, Grok, DeepSeek, Qwen, Mistral and others as add-ons.',
    cadence: 'Each prompt once a day on every engine you pick.',
    extras:
      'How often answers name your brand and competitors, where and in what tone, the sources each answer used, prompt tags by country and funnel stage, and suggested actions.',
    doesTheWork:
      'Recommends actions, such as getting reviews on a site the answers cite. It does not write content.',
    mcp: 'Yes, a hosted MCP server for Claude, ChatGPT, Cursor, VS Code, Windsurf and Codex, plus an API and a Looker Studio connector.',
    pickIf: [
      'your marketing team wants a dashboard that tracks prompts every day across many engines and countries',
      'you report AI visibility to clients and want Looker Studio or white-label reports',
      'you want sentiment and position scores next to mentions',
    ],
  },
  profound: {
    name: 'Profound',
    engines:
      'ChatGPT, Perplexity, Claude, Gemini, DeepSeek, Google AI Overviews, Google AI Mode, Exa, Muse Spark and Qwen.',
    cadence:
      'Tracked prompts on Profound’s own schedule; its pages do not state how often.',
    extras:
      'Answer engine insights, sentiment, FactCheck for wrong claims about you, prompt volumes from real conversations, ChatGPT Shopping at SKU level, and Agent Analytics from your server logs.',
    doesTheWork:
      'Its AI Marketer and Agents find work, draft pages and social posts, and stage rewrites in your CMS for approval.',
    mcp: 'Yes, a hosted MCP server on the Enterprise plan, plus a REST API and 200+ integrations.',
    pickIf: [
      'you are a large brand that needs SSO, role-based access and SOC 2 Type II',
      'you want AI bot visits read from your CDN or server logs in the same product',
      'you sell products and need to see how they show in ChatGPT Shopping',
    ],
  },
  otterly: {
    name: 'Otterly.AI',
    engines:
      'ChatGPT, Google AI Overviews, Google AI Mode, Perplexity, Gemini, Microsoft Copilot and Claude.',
    cadence: 'Daily by default, or weekly on its larger plans.',
    extras:
      'Mentions, citations, sentiment and share of voice, a gap analyzer, a crawlability checker and content audits.',
    doesTheWork: 'Recommends fixes and writes content briefs.',
    mcp: 'Yes, with an API and a Data Studio connector.',
    pickIf: [
      'you want a simple daily tracker that covers Copilot and Claude',
      'you want crawlability checks and content briefs in the same tool',
    ],
  },
  brandRadar: {
    name: 'Ahrefs Brand Radar',
    engines:
      'AI Overviews, AI Mode, ChatGPT, Perplexity, Gemini and Copilot, plus Claude for your own prompts.',
    cadence:
      'Your own prompts daily, weekly or monthly. The index is re-tested monthly.',
    extras:
      'An index of hundreds of millions of prompts modelled from Ahrefs’ keyword data, so you can look up any brand without setup, plus fan-out queries and AI bot visits.',
    doesTheWork: 'Shows the citations and gaps. The work is yours.',
    mcp: 'Through the Ahrefs MCP server and API.',
    pickIf: [
      'you already pay for Ahrefs, which includes a few tracked prompts',
      'you want to see any competitor’s AI visibility without choosing prompts first',
    ],
  },
} satisfies Record<string, Tracker>

/** SEO Skill's own column, matched to what seo research ai_answers does. */
export const seoSkillTracker = {
  name: 'SEO Skill',
  engines:
    'ChatGPT search, the Gemini app, Google AI Mode and Google AI Overviews.',
  cadence:
    'When you or your agent asks, each question up to five times for a rate. With your questions saved in the business context, every run is kept and charted against the first.',
  extras:
    'The AI-shaped searches already in your Search Console, the searches ChatGPT ran for each answer, competitors judged on the same answers, AI crawler access and visits from AI assistants.',
  doesTheWork:
    'Your own coding agent edits the pages in your codebase, then checks the same questions again.',
  mcp: 'It is an MCP server: hosted, or open source on your machine, in any MCP client.',
}

export const sources = [
  {
    fact: 'Peec AI engines, daily runs and metrics',
    url: 'https://peec.ai/ai-instructions',
  },
  {
    fact: 'Peec AI MCP server and clients',
    url: 'https://docs.peec.ai/mcp/setup',
  },
  {
    fact: 'Profound engines, AI Marketer and features',
    url: 'https://www.tryprofound.com',
  },
  {
    fact: 'Profound Agent Analytics',
    url: 'https://www.tryprofound.com/features/agent-analytics',
  },
  {
    fact: 'Profound MCP server and plan',
    url: 'https://www.tryprofound.com/features/mcp',
  },
  {
    fact: 'Otterly.AI engines and features',
    url: 'https://otterly.ai/features',
  },
  {
    fact: 'Otterly.AI tracking schedule',
    url: 'https://help.otterly.ai/monitoring-interval',
  },
  {
    fact: 'Ahrefs Brand Radar engines and features',
    url: 'https://ahrefs.com/brand-radar',
  },
]
