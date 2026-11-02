// The integration pages: one page per data source, one per AI client, and
// one for each hosted source in each client (/integrations/{source}/{client}).
// Facts here must match apps/mcp/README.md and the docs pages they link to.

export type HostedTool =
  | 'seo_sites'
  | 'seo_report'
  | 'seo_page'
  | 'seo_compare'
  | 'seo_index'
  | 'seo_research'
  | 'seo_data'

type Ask = { question: string; answer: string }
type Faq = { question: string; answer: string }

export type Source = {
  id: string
  name: string
  /** H1 of the source page. */
  title: string
  /** Title tag of the source page. */
  metaTitle: string
  description: string
  lead: string
  /** How the data reaches the hosted MCP. */
  connect: 'google' | 'key' | 'clicky' | 'cli'
  /** What a person needs before they start. */
  needs: string
  /** Request headers that carry a research key, with the variable to read. */
  headers?: [header: string, variable: string][]
  /** One sentence for cards and the hub. */
  card: string
  tools: { tool: HostedTool; text: string }[]
  asks: Ask[]
  /** The one limit that changes how the result should be read. */
  limit: string
  docs: { label: string; href: string }
  faq: Faq[]
}

export type Step = { text: string; code?: string; label?: string }

export type Client = {
  id: string
  name: string
  /** Where it runs, for the client page lead. */
  where: string
  card: string
  steps: Step[]
  /** What happens at the first request. */
  signIn: string
  /** The add command or config with a research key header, when supported. */
  withHeader?: (headers: [header: string, variable: string][]) => Step
  /** `seo mcp install` can add the local MCP to it. */
  localMcp: boolean
  note?: string
  docsUrl: string
}

export const mcpUrl = 'https://seoskill.dev/mcp'

export const sources: Source[] = [
  {
    id: 'google-search-console',
    name: 'Google Search Console',
    title: 'Google Search Console MCP server',
    metaTitle: 'Free Google Search Console MCP server',
    description:
      'Connect Google Search Console to Claude, ChatGPT, Codex, Cursor or any AI agent with a free hosted MCP server. Clicks, impressions, CTR, positions, queries, pages and URL Inspection.',
    lead: 'Ask your agent about your own search performance. It reads your clicks, impressions, CTR, positions, queries, pages and index status straight from Search Console.',
    connect: 'google',
    needs:
      'A Google account that can see at least one Search Console property.',
    card: 'Clicks, impressions, CTR, positions, queries, pages and URL Inspection.',
    tools: [
      {
        tool: 'seo_sites',
        text: 'The Search Console properties your linked Google accounts can read.',
      },
      {
        tool: 'seo_report',
        text: 'The overview against the previous period, then one section: quick wins, low CTR, striking distance, content decay, cannibalization or traffic drops.',
      },
      {
        tool: 'seo_page',
        text: 'One URL: live page facts, Google index status and the queries it gets clicks for.',
      },
      {
        tool: 'seo_compare',
        text: 'Equal periods before and after a date, with the Google updates that fall in the window.',
      },
      {
        tool: 'seo_index',
        text: 'Pages that lost their clicks, checked live and with URL Inspection.',
      },
      {
        tool: 'seo_data',
        text: 'Raw rows by query, page, date, country, device or search appearance.',
      },
    ],
    asks: [
      {
        question: 'What changed in search last week?',
        answer:
          'The report overview: totals against the previous period by device, with the pages and queries that moved most.',
      },
      {
        question: 'Which queries am I on page two for?',
        answer:
          'The striking distance and second page sections, with the page that ranks for each query.',
      },
      {
        question: 'Why did this page lose its clicks?',
        answer:
          'seo_page with the page facts, its index status from URL Inspection and its queries before and after.',
      },
      {
        question: 'Did the March core update hit us?',
        answer:
          'seo_compare around the update date, so you see timing next to the change, not a verdict.',
      },
      {
        question: 'Are two of my pages fighting for the same query?',
        answer:
          'The cannibalization section: queries where more than one of your pages gets impressions.',
      },
    ],
    limit:
      'Search Console hides some rare queries and its last few days are not final. The reports use the latest final days and say when a section is empty or capped, rather than turning missing rows into a zero.',
    docs: { label: 'SEO report docs', href: '/docs/report' },
    faq: [
      {
        question: 'Is this an official Google Search Console MCP server?',
        answer:
          'No. Google does not publish a Search Console MCP server. SEO Skill reads the official Search Console API with your own Google sign-in, so the numbers are the same ones you see in Search Console.',
      },
      {
        question: 'Is the Search Console MCP free?',
        answer:
          'Yes. Every tool your agent calls on demand is free with no usage cap. The only paid part is the weekly site audit, which runs on our servers in the background for $50 a month per site.',
      },
      {
        question: 'Does it store my Search Console data?',
        answer:
          'No. The server fetches what your agent asks for and returns it. It keeps your linked Google accounts and any keys you save, encrypted, and never the rows or reports.',
      },
      {
        question: 'Can it change anything in Search Console?',
        answer:
          'The Google sign-in asks for read-only access. Your agent can read performance data and inspect URLs, and nothing it does changes your Search Console settings.',
      },
      {
        question: 'Do I need a Google Cloud project or API key?',
        answer:
          'No. You add one URL to your agent and sign in with Google. Open source servers usually ask you to create your own Google Cloud project and OAuth client first.',
      },
      {
        question: 'Is there a GitHub version I can run myself?',
        answer:
          'Yes. The same tools ship in the open source seo CLI and local MCP server on GitHub and npm. Install it with npm i -g seo, then run seo start.',
      },
    ],
  },
  {
    id: 'google-analytics',
    name: 'Google Analytics',
    title: 'Google Analytics MCP for SEO',
    metaTitle: 'Google Analytics MCP server for SEO',
    description:
      'Connect Google Analytics to Claude, ChatGPT, Codex or any AI agent with a free MCP server. Search sessions beside Search Console clicks, landing pages and visits from AI assistants.',
    lead: 'Your agent sees what happens after the click: sessions from search, the pages people land on, and visits from AI assistants, for the same dates as your Search Console data.',
    connect: 'google',
    needs:
      'Viewer access to a Google Analytics property for the site, on the same Google account you sign in with.',
    card: 'Search sessions beside your clicks, landing pages and visits from AI assistants.',
    tools: [
      {
        tool: 'seo_report',
        text: "Organic Search sessions from Google, from every search engine and from all channels, beside the site's clicks.",
      },
      {
        tool: 'seo_compare',
        text: 'Sessions before and after a date, including visits from AI assistants.',
      },
      {
        tool: 'seo_data',
        text: 'Landing pages from search with sessions, users, engaged sessions and key events.',
      },
    ],
    asks: [
      {
        question: 'Did search traffic drop, or all traffic?',
        answer:
          'The report puts Organic Search sessions next to sessions from all channels, so a sitewide drop looks different from a search drop.',
      },
      {
        question: 'Which landing pages does search send people to?',
        answer:
          'seo_data with Google Analytics as the source: each landing page with sessions, users, engaged sessions and key events.',
      },
      {
        question: 'How many visits come from ChatGPT and Perplexity?',
        answer:
          'The AI assistants rows: visits from ChatGPT, Perplexity, Claude, Gemini and Copilot, and the pages they land on.',
      },
      {
        question: 'Do clicks and sessions agree for my blog?',
        answer:
          'Clicks from Search Console beside Organic Search sessions for the same dates. They count different things, so expect a gap.',
      },
    ],
    limit:
      'Only visits that pass a referrer or tag count as coming from an AI assistant. An AI app that sends neither shows up as Direct.',
    docs: { label: 'Analytics docs', href: '/docs/analytics' },
    faq: [
      {
        question: 'Is this the official Google Analytics MCP server?',
        answer:
          'No. Google publishes its own Google Analytics MCP server, which you run on your own machine with a Google Cloud project. SEO Skill is a hosted server built for SEO questions: it sets Google Analytics sessions beside your Search Console clicks with one Google sign-in.',
      },
      {
        question: 'Do I have to pick the property?',
        answer:
          'No. It finds the property whose web stream matches the site and names it in the result.',
      },
      {
        question: 'Is the Google Analytics MCP free?',
        answer: 'Yes, with no usage cap. Your sign-in gives read-only access.',
      },
      {
        question: 'Does it work with other analytics tools?',
        answer:
          'Clicky works in the hosted MCP too. Fathom, Plausible, Simple Analytics and others work on your own machine through a small provider package for the CLI.',
      },
    ],
  },
  {
    id: 'dataforseo',
    name: 'DataForSEO',
    title: 'DataForSEO MCP for keyword research',
    metaTitle: 'DataForSEO MCP for keyword and SERP research',
    description:
      'Use your own DataForSEO account in Claude, ChatGPT, Codex or Cursor through a free hosted MCP. Keyword metrics, rankings, SERPs, competitors, backlinks and AI answer checks.',
    lead: 'Bring your DataForSEO login and your agent can pull search volume, rankings, SERPs, competitors and backlinks next to your own Search Console data.',
    connect: 'key',
    needs:
      'A DataForSEO account with API credit. DataForSEO bills you directly for each request.',
    headers: [
      ['X-DataForSEO-Login', 'DATAFORSEO_LOGIN'],
      ['X-DataForSEO-Password', 'DATAFORSEO_PASSWORD'],
    ],
    card: 'Keyword metrics, rankings, SERPs, competitors, backlinks and AI answer checks with your own login.',
    tools: [
      {
        tool: 'seo_research',
        text: 'Keyword metrics, ranked keywords, SERPs, competitors, backlinks, and whether AI answers cite your site.',
      },
    ],
    asks: [
      {
        question: 'What is the search volume for these 40 keywords?',
        answer:
          'Keyword metrics: volume, keyword difficulty and cost per click for up to 100 keywords at once.',
      },
      {
        question: 'What does example.org rank for in the UK?',
        answer: 'Ranked keywords for that domain, in the country you name.',
      },
      {
        question: 'Who ranks for "seo audit tool" right now?',
        answer:
          'The SERP for up to five keywords, with the pages in each result.',
      },
      {
        question: 'Do AI answers cite my site?',
        answer:
          'Your top AI-style questions from Search Console, checked in ChatGPT search, Google AI Mode and AI Overviews. A full run costs about 12 cents of credit.',
      },
    ],
    limit:
      'DataForSEO numbers are estimates from its own index. They are kept apart from your Search Console data and never mixed into it.',
    docs: { label: 'Research docs', href: '/docs/research' },
    faq: [
      {
        question: 'Is this the official DataForSEO MCP server?',
        answer:
          'No. DataForSEO has its own MCP server that exposes its API. SEO Skill uses your DataForSEO login for a smaller set of SEO questions and puts the answers next to your own Search Console and Google Analytics data.',
      },
      {
        question: 'What does it cost?',
        answer:
          "SEO Skill is free. DataForSEO charges your account for each request, and every result says what it cost from DataForSEO's own numbers.",
      },
      {
        question: 'Where do I put my DataForSEO login?',
        answer:
          'Save it encrypted on your account page, or send it as headers from clients that support them, so nothing is saved.',
      },
    ],
  },
  {
    id: 'ahrefs',
    name: 'Ahrefs',
    title: 'Ahrefs MCP for keyword research',
    metaTitle: 'Ahrefs MCP for keyword and competitor research',
    description:
      'Use your own Ahrefs API key in Claude, ChatGPT, Codex or Cursor through a free hosted MCP. Keyword metrics, ranked keywords, SERPs, competitors and backlinks beside your Search Console data.',
    lead: 'Add your Ahrefs API key and your agent can check keywords, competitors and backlinks next to your own clicks and impressions.',
    connect: 'key',
    needs:
      'An Ahrefs API key from a plan that includes API access. Ahrefs counts each request against your units.',
    headers: [['X-Ahrefs-Key', 'AHREFS_API_KEY']],
    card: 'Keyword metrics, ranked keywords, SERPs, competitors and backlinks with your own key.',
    tools: [
      {
        tool: 'seo_research',
        text: 'Keyword metrics, ranked keywords, SERPs, competitors and backlinks.',
      },
    ],
    asks: [
      {
        question: "What keywords does example.org rank for that I don't?",
        answer:
          'Ranked keywords for the competitor, which your agent can set against your own Search Console queries.',
      },
      {
        question: 'Which sites compete with mine?',
        answer:
          'Competitors: domains that rank for the same keywords, each with its Domain Rating.',
      },
      {
        question: 'Who links to this competitor?',
        answer: 'Backlinks: the referring domains for a domain or URL.',
      },
      {
        question: 'How hard is this keyword?',
        answer:
          'Keyword metrics with volume, keyword difficulty and cost per click.',
      },
    ],
    limit:
      'Ahrefs numbers are estimates from its own index. They stay separate from your first-party data.',
    docs: { label: 'Research docs', href: '/docs/research' },
    faq: [
      {
        question: 'Is this the official Ahrefs MCP server?',
        answer:
          'No. Ahrefs has its own MCP server for its API. SEO Skill uses your Ahrefs key for keyword and competitor questions and puts the answers next to your Search Console and Google Analytics data in the same chat.',
      },
      {
        question: 'Do I need an Ahrefs key for Domain Rating?',
        answer:
          'No. Research rows get a free Domain Rating column, Domain Rating by Ahrefs, with no key needed.',
      },
      {
        question: 'Where do I put my Ahrefs key?',
        answer:
          'Save it encrypted on your account page, or send it as a header from clients that support headers.',
      },
    ],
  },
  {
    id: 'clicky',
    name: 'Clicky',
    title: 'Clicky MCP server',
    metaTitle: 'Clicky analytics MCP server',
    description:
      'Connect Clicky web analytics to Claude, ChatGPT, Codex or any AI agent with a free hosted MCP. Visits by landing page, traffic sources and search engines.',
    lead: 'Ask your agent which pages people land on and where they came from, straight from your Clicky account.',
    connect: 'clicky',
    needs: 'A Clicky account, or a Clicky site ID and sitekey.',
    card: 'Visits by landing page, with the traffic sources and search engines that sent them.',
    tools: [
      { tool: 'seo_sites', text: 'The Clicky sites saved on your account.' },
      {
        tool: 'seo_data',
        text: 'Visits by landing page, with traffic sources and search engines, for the last 28 days unless you ask for other dates.',
      },
    ],
    asks: [
      {
        question: 'Show the Clicky landing pages for example.com',
        answer: 'Visits by landing page for the last 28 days.',
      },
      {
        question: 'Which search engines sent visits this month?',
        answer: 'The search engines Clicky recorded, with visits from each.',
      },
      {
        question: 'Do Clicky visits match my Search Console clicks?',
        answer:
          'Both side by side for the same dates. A Clicky visit is not a click, so expect them to differ.',
      },
    ],
    limit: 'Clicky reads at most 31 days at a time.',
    docs: { label: 'Analytics docs', href: '/docs/analytics#clicky' },
    faq: [
      {
        question: 'How do I add Clicky?',
        answer:
          'On your account page, under Keys, add your whole Clicky account with its login, or one site at a time with its site ID and sitekey.',
      },
      {
        question: 'Does it work with two-factor sign-in on Clicky?',
        answer:
          'The account login does not. Add each site with its site ID and sitekey instead.',
      },
      {
        question: 'Is the Clicky MCP free?',
        answer: 'Yes, with no usage cap.',
      },
    ],
  },
  {
    id: 'bing-webmaster-tools',
    name: 'Bing Webmaster Tools',
    title: 'Bing Webmaster Tools MCP',
    metaTitle: 'Bing Webmaster Tools MCP server',
    description:
      'Put Bing Webmaster Tools clicks, impressions, queries and pages beside Search Console in Claude Code, Codex or Cursor with the free seo CLI and local MCP server.',
    lead: "See Bing's clicks, impressions, queries and pages next to Google's for the same site and dates.",
    connect: 'cli',
    needs:
      'A site verified in Bing Webmaster Tools, and the seo CLI on your machine.',
    card: 'Bing clicks, impressions, queries and pages beside Google, on your own machine.',
    tools: [],
    asks: [
      {
        question: 'How much of my search traffic comes from Bing?',
        answer: "Each engine's share of clicks for the same dates.",
      },
      {
        question: 'Which queries do well on Bing but not Google?',
        answer: 'Bing queries beside Google queries for the same site.',
      },
    ],
    limit:
      "Bing blocks requests from the hosted server's network, so Bing runs in the CLI and the local MCP server on your own machine.",
    docs: { label: 'Bing docs', href: '/docs/bing' },
    faq: [
      {
        question: 'Why is Bing not in the hosted MCP?',
        answer:
          'Bing blocks requests from the network the hosted server runs on. The hosted server tells your agent to use the CLI for Bing instead, the same way it does for a crawl.',
      },
      {
        question: 'Is the Bing data free?',
        answer: 'Yes. Bing Webmaster Tools data is free, and so is the CLI.',
      },
    ],
  },
]

export const hostedSources = sources.filter(
  (source) => source.connect !== 'cli',
)

export const clients: Client[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    where: "Anthropic's coding agent in your terminal",
    card: 'One command in your terminal.',
    steps: [
      {
        text: 'Run this in a terminal. The user scope makes it available in every project:',
        code: `claude mcp add --transport http --scope user seoskill ${mcpUrl}`,
      },
      {
        text: 'Start Claude Code, type /mcp, choose seoskill and sign in. Or run claude mcp login seoskill from the shell.',
      },
    ],
    signIn:
      'A browser tab opens for Google sign-in. Claude Code keeps the token, so you sign in once.',
    withHeader: (headers) => ({
      text: 'Or send the key as a header, so nothing is saved on your account:',
      code: [
        `claude mcp add --transport http --scope user seoskill ${mcpUrl}`,
        ...headers.map(
          ([header, variable]) => `  --header "${header}: \${${variable}}"`,
        ),
      ].join(' \\\n'),
    }),
    localMcp: true,
    docsUrl: 'https://code.claude.com/docs/en/mcp',
  },
  {
    id: 'claude',
    name: 'Claude',
    where: 'claude.ai, the Claude desktop app and Claude on your phone',
    card: 'A custom connector, added once for web, desktop and mobile.',
    steps: [
      {
        text: 'Open Customize, then Connectors. Choose Add, then Add custom connector.',
      },
      {
        text: 'Name it seoskill, enter the server URL and choose Continue:',
        code: mcpUrl,
      },
      {
        text: 'If Claude asks how to register the OAuth client, choose Register automatically. Then choose Add and sign in with Google.',
      },
      { text: 'In a chat, turn it on from the + menu under Connectors.' },
    ],
    signIn:
      'Claude opens the Google sign-in when you connect. The connector belongs to your Claude account, so it also shows up in the desktop and mobile apps.',
    localMcp: false,
    note: 'Every Claude plan can add custom connectors, and the free plan allows one. On Team and Enterprise plans an owner adds the connector under Organization settings first, then each member connects their own Google account.',
    docsUrl:
      'https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp',
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    where: 'ChatGPT on the web',
    card: 'A custom MCP server added from Plugins.',
    steps: [
      { text: 'Open Plugins, choose +, then Add custom MCP server.' },
      {
        text: 'Name it seoskill and enter the server URL under Connection:',
        code: mcpUrl,
      },
      {
        text: 'Choose OAuth for authentication, confirm, and choose Create as a plugin. Sign in with Google when ChatGPT asks.',
      },
      { text: 'In a chat, type @ and pick seoskill.' },
    ],
    signIn:
      'ChatGPT opens the Google sign-in while it sets up the plugin, and refreshes the token after that.',
    localMcp: false,
    note: 'Custom MCP servers depend on your ChatGPT plan. OpenAI lists Business, Enterprise and Edu workspaces, where an admin may need to create the plugin, and Pro accounts for read-only servers like this one.',
    docsUrl:
      'https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt',
  },
  {
    id: 'codex',
    name: 'Codex',
    where:
      "OpenAI's coding agent in the terminal, the IDE extension and the desktop app",
    card: 'Two commands in your terminal.',
    steps: [
      {
        text: 'Add the server, then sign in. The CLI, IDE extension and desktop app share this config:',
        code: `codex mcp add seoskill --url ${mcpUrl}\ncodex mcp login seoskill`,
      },
      { text: 'Check it with /mcp in Codex, or codex mcp list.' },
    ],
    signIn:
      'codex mcp login opens the Google sign-in in your browser. Codex keeps the token for later sessions.',
    withHeader: (headers) => ({
      text: 'Or send the key as a header from ~/.codex/config.toml, so nothing is saved on your account. Each header takes its value from the environment variable named here:',
      code: `[mcp_servers.seoskill]\nurl = "${mcpUrl}"\nenv_http_headers = { ${headers.map(([header, variable]) => `"${header}" = "${variable}"`).join(', ')} }`,
    }),
    localMcp: true,
    docsUrl: 'https://developers.openai.com/codex/mcp',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    where: 'the Cursor editor and its agent',
    card: 'One entry in mcp.json.',
    steps: [
      {
        text: 'Add the server to ~/.cursor/mcp.json for every project, or .cursor/mcp.json for one:',
        code: `{\n  "mcpServers": {\n    "seoskill": { "url": "${mcpUrl}" }\n  }\n}`,
      },
      {
        text: "Open the MCP section of Cursor's settings and sign in when seoskill asks for it.",
      },
    ],
    signIn:
      'Cursor opens the Google sign-in in your browser and keeps the token.',
    withHeader: (headers) => ({
      text: 'Or send the key as a header, so nothing is saved on your account:',
      code: JSON.stringify(
        {
          mcpServers: {
            seoskill: {
              url: mcpUrl,
              headers: Object.fromEntries(
                headers.map(([header, variable]) => [
                  header,
                  `\${env:${variable}}`,
                ]),
              ),
            },
          },
        },
        null,
        2,
      ),
    }),
    localMcp: true,
    note: 'On Enterprise teams an admin can limit which MCP servers are allowed.',
    docsUrl: 'https://cursor.com/docs/context/mcp',
  },
  {
    id: 'vs-code',
    name: 'VS Code',
    where: 'VS Code with GitHub Copilot',
    card: 'The Add Server command, or one entry in .mcp.json.',
    steps: [
      {
        text: 'Open the Command Palette, run MCP: Add Server and choose HTTP. Enter the server URL and the name seoskill:',
        code: mcpUrl,
      },
      {
        text: 'Or add it to .mcp.json at the root of your workspace:',
        code: `{\n  "mcpServers": {\n    "seoskill": { "type": "http", "url": "${mcpUrl}" }\n  }\n}`,
      },
      { text: 'Sign in with Google when VS Code opens the browser.' },
    ],
    signIn:
      'VS Code opens the Google sign-in the first time the server connects, then keeps the token.',
    withHeader: (headers) => ({
      text: 'Or send the key as a header, so nothing is saved on your account:',
      code: JSON.stringify(
        {
          mcpServers: {
            seoskill: {
              type: 'http',
              url: mcpUrl,
              headers: Object.fromEntries(
                headers.map(([header, variable]) => [
                  header,
                  `\${${variable}}`,
                ]),
              ),
            },
          },
        },
        null,
        2,
      ),
    }),
    localMcp: false,
    note: 'You need a Copilot plan. On Copilot Business and Enterprise, an admin has to turn on the MCP servers in Copilot policy first.',
    docsUrl:
      'https://code.visualstudio.com/docs/agent-customization/mcp-servers',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    where: "Google's coding agent in your terminal",
    card: 'One command in your terminal.',
    steps: [
      {
        text: 'Run this in a terminal. The user scope makes it available in every project:',
        code: `gemini mcp add --transport http --scope user seoskill ${mcpUrl}`,
      },
      {
        text: 'Start Gemini CLI and sign in when it asks. If it does not ask, run /mcp auth seoskill.',
      },
    ],
    signIn:
      'Gemini CLI opens the Google sign-in in your browser and keeps the token.',
    withHeader: (headers) => ({
      text: 'Or send the key as a header, so nothing is saved on your account:',
      code: [
        `gemini mcp add --transport http --scope user seoskill ${mcpUrl}`,
        ...headers.map(
          ([header, variable]) => `  --header "${header}: \${${variable}}"`,
        ),
      ].join(' \\\n'),
    }),
    localMcp: false,
    docsUrl: 'https://geminicli.com/docs/tools/mcp-server/',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    where: 'Devin Desktop, the editor that was called Windsurf',
    card: 'Two commands, or one entry in mcp_config.json.',
    steps: [
      {
        text: 'Add the server for Devin Local, the default agent, then sign in:',
        code: `devin mcp add -s user seoskill ${mcpUrl}\ndevin mcp login seoskill`,
      },
      {
        text: 'Still on Cascade? Open its MCP menu, choose Open MCP config file, add this and press refresh:',
        code: `{\n  "mcpServers": {\n    "seoskill": { "serverUrl": "${mcpUrl}" }\n  }\n}`,
      },
    ],
    signIn:
      'The Google sign-in opens in your browser. When it expires, the app shows Needs authentication with a button to sign in again.',
    localMcp: false,
    note: 'Windsurf became Devin Desktop in June 2026. On Enterprise teams MCP has to be turned on, and an admin allowlist blocks servers that are not on it.',
    docsUrl: 'https://docs.devin.ai/cli/extensibility/mcp/configuration',
  },
  {
    id: 'le-chat',
    name: 'Le Chat',
    where: "Mistral's assistant on the web",
    card: 'A custom MCP connector.',
    steps: [
      {
        text: 'Open Connectors, choose Add Connector and switch to Custom MCP Connector.',
      },
      { text: 'Name it seoskill and enter the server URL:', code: mcpUrl },
      { text: 'Choose Connect and sign in with Google.' },
    ],
    signIn:
      'Le Chat finds the sign-in on its own and opens the Google consent screen.',
    localMcp: false,
    note: 'Only an administrator can add connectors. On Free, Pro and Student plans that is the account owner.',
    docsUrl:
      'https://docs.mistral.ai/le-chat/knowledge-integrations/connectors/mcp-connectors',
  },
]

export const sourceById = (id: string) =>
  sources.find((source) => source.id === id)
export const clientById = (id: string) =>
  clients.find((client) => client.id === id)

export const integrationPaths = [
  '/integrations',
  ...sources.map((source) => `/integrations/${source.id}`),
  ...clients.map((client) => `/integrations/${client.id}`),
  ...hostedSources.flatMap((source) =>
    clients.map((client) => `/integrations/${source.id}/${client.id}`),
  ),
]
