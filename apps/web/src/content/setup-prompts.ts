// The setup box gives a person one prompt to paste into their agent. The
// agent installs the CLI, adds the hosted MCP, waits while the person signs
// in, checks it connects and then works through the hosted MCP. Every
// command here must work on the published CLI and match the client's own
// docs. The server URL comes from integrations.ts. The first four prompts
// are the box's tabs everywhere; the rest show only on their client's
// integration pages. A page can add steps, such as saving a research key.
import { mcpUrl, type Source } from './integrations'

export type SetupPrompt = {
  id: string
  /** Tab label, and the agent named in "Give this prompt to". */
  label: string
  /** Who the prompt is for, in "Give this prompt to {agent}". */
  agent: string
  /** The agent named in the prompt's first line. */
  setupIn: string
  steps: string[]
  end: string
  guide: { label: string; href: string }
  /** The line under the box, when the agent cannot add the server itself. */
  summary?: string
  /** One of the four tabs every setup box shows. */
  featured: boolean
}

const install =
  'If `seo --version` fails, install the SEO Skill CLI with `npm i -g seo`. If Node.js is missing or too old for it, install the current LTS release of Node.js yourself, such as with Homebrew, winget or nvm, and ask me only when it needs my password or approval.'

const link =
  'Run `seo login`. It prints a link and a code. Show me both and ask me to open the link, sign in with the same Google account and click "Link this machine". Wait until I say it is done, then run `seo login` again to finish.'

const skill = 'Run `seo skill install` to add the SEO skill.'

const sites =
  'Run `seo sites` and ask me which site to start with. If it lists none, tell me the Google account I used needs access to a Search Console property.'

const useMcp = (restart: string) =>
  `When it is connected, ${restart} After that, use the seoskill MCP tools for my data. Call seo_next for the site I picked and do the step it returns. Use the \`seo\` CLI only for site crawls and Bing data, which run on my machine.`

const newChat =
  'give me a message to send afterwards that asks you to run seo_next for the site I picked.'

/** The full prompt, with any steps the page adds after the client's own. */
export const promptText = (client: SetupPrompt, extraSteps: string[] = []) =>
  [
    `Set up SEO Skill in ${client.setupIn} so you can work on my site's SEO with my own Search Console data. Do every step yourself and only stop when you need me.`,
    [...client.steps, ...extraSteps]
      .map((step, index) => `${index + 1}. ${step}`)
      .join('\n'),
    client.end,
  ].join('\n\n')

export const allSetupPrompts: SetupPrompt[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    agent: 'Claude Code',
    setupIn: 'Claude Code',
    steps: [
      install,
      `Add the hosted MCP server for every project with \`claude mcp add --transport http --scope user seoskill ${mcpUrl}\`. Skip this if \`claude mcp get seoskill\` already shows that URL.`,
      'Run `claude mcp login seoskill`. It opens my browser. Tell me to sign in with Google there, which creates my free seoskill.dev account, and wait until it finishes. If it times out, ask me to type /mcp, choose seoskill and sign in.',
      link,
      skill,
      'Run `claude mcp list` and check that seoskill shows as Connected. If it does not, read the error from `claude mcp get seoskill` and fix it.',
      sites,
    ],
    end: useMcp(
      'tell me to restart Claude Code with `claude --continue` so the seoskill tools load.',
    ),
    guide: {
      label: 'Claude Code setup guide',
      href: '/integrations/claude-code',
    },
    featured: true,
  },
  {
    id: 'codex',
    label: 'Codex',
    agent: 'Codex',
    setupIn: 'Codex',
    steps: [
      install,
      `Add the hosted MCP server with \`codex mcp add seoskill --url ${mcpUrl}\`. Skip this if \`codex mcp get seoskill\` already shows that URL. Some steps need network access or write outside this folder, so ask me to approve them.`,
      'Run `codex mcp login seoskill`. It opens my browser. Tell me to sign in with Google there, which creates my free seoskill.dev account, and wait until it finishes.',
      link,
      skill,
      'Run `codex mcp list` and check that seoskill is enabled and signed in. If it is not, read the error and fix it.',
      sites,
    ],
    end: useMcp(
      'tell me to restart Codex so the seoskill tools load. In a terminal, `codex resume --last` keeps this conversation.',
    ),
    guide: { label: 'Codex setup guide', href: '/integrations/codex' },
    featured: true,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    agent: 'Cursor',
    setupIn: 'Cursor',
    steps: [
      install,
      `Add the hosted MCP server for every project. In ~/.cursor/mcp.json, add \`"seoskill": { "url": "${mcpUrl}" }\` under "mcpServers". Create the file if it is missing, and keep every other server in it.`,
      "Ask me to open the MCP section of Cursor's settings and sign in when seoskill asks for it. I sign in with Google, which creates my free seoskill.dev account. Wait until I say it is done.",
      link,
      skill,
      "Ask me to check that seoskill shows as connected with its tools listed in Cursor's settings. If it shows an error, read it with me and fix it.",
      sites,
    ],
    end: useMcp(
      'tell me to start a new chat so the seoskill tools load, and give me a message to send there that asks you to run seo_next for the site I picked.',
    ),
    guide: { label: 'Cursor setup guide', href: '/integrations/cursor' },
    featured: true,
  },
  {
    id: 'other',
    label: 'Any agent',
    agent: 'your agent',
    setupIn: 'this agent',
    steps: [
      install,
      `Add the hosted MCP server ${mcpUrl} to this agent as a remote HTTP MCP server named seoskill, for every project. Use this agent's own command or config file and keep its other servers. If you cannot add MCP servers yourself, find this agent's steps at https://seoskill.dev/integrations and walk me through them.`,
      "Start this agent's MCP sign-in for seoskill, or tell me how to start it. I sign in with Google, which creates my free seoskill.dev account. Wait until it finishes.",
      link,
      skill,
      'Check that this agent lists seoskill as connected. If it does not, read the error and fix it.',
      sites,
    ],
    end: useMcp(
      `tell me what to restart so the seoskill tools load, and ${newChat}`,
    ),
    guide: { label: 'Setup guides for every agent', href: '/integrations' },
    featured: true,
  },
  {
    id: 'vs-code',
    label: 'VS Code',
    agent: 'Copilot in VS Code',
    setupIn: 'VS Code',
    steps: [
      install,
      `Ask me to open the Command Palette, run MCP: Add Server, choose HTTP, enter ${mcpUrl} with the ID seoskill, and pick Global so it works in every workspace. Wait until I say it is done.`,
      'Ask me to sign in with Google when VS Code opens the browser for seoskill, which creates my free seoskill.dev account. Wait until I say it is done.',
      link,
      skill,
      'Ask me to run Chat: Open Customizations, open MCP Servers and check that seoskill is running with its tools listed. If it shows an error, read it with me and fix it.',
      sites,
    ],
    end: useMcp(
      `tell me to start a new chat so the seoskill tools load, and ${newChat}`,
    ),
    summary:
      'Copilot installs the CLI, walks you through adding the hosted MCP server and signing in with Google, and checks it connects.',
    guide: { label: 'VS Code setup guide', href: '/integrations/vs-code' },
    featured: false,
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    agent: 'Gemini CLI',
    setupIn: 'Gemini CLI',
    steps: [
      install,
      `Add the hosted MCP server for every project with \`gemini mcp add --transport http --scope user seoskill ${mcpUrl}\`. Skip this if \`gemini mcp list\` already shows that URL.`,
      'Tell me to type /mcp auth seoskill in Gemini CLI and sign in with Google in the browser it opens, which creates my free seoskill.dev account. Wait until I say it is done.',
      link,
      skill,
      'Run `gemini mcp list` and check that seoskill shows as Connected. If it does not, read the error and fix it.',
      sites,
    ],
    end: useMcp(
      `tell me to restart Gemini CLI so the seoskill tools load, and ${newChat}`,
    ),
    guide: {
      label: 'Gemini CLI setup guide',
      href: '/integrations/gemini-cli',
    },
    featured: false,
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    agent: 'Devin Desktop',
    setupIn: 'Devin Desktop',
    steps: [
      install,
      `Add the hosted MCP server for every project with \`devin mcp add -s user seoskill ${mcpUrl}\`. Skip this if \`devin mcp get seoskill\` already shows that URL. If you are Cascade and cannot run devin, add \`"seoskill": { "serverUrl": "${mcpUrl}" }\` under "mcpServers" in your MCP config file instead, keep its other servers, and ask me to press refresh in the MCP menu.`,
      'Run `devin mcp login seoskill`. It opens my browser. Tell me to sign in with Google there, which creates my free seoskill.dev account, and wait until it finishes.',
      link,
      skill,
      'Run `devin mcp list` and check that seoskill is connected. If it shows Needs authentication or an error, read it and fix it.',
      sites,
    ],
    end: useMcp(
      `tell me to start a new session so the seoskill tools load, and ${newChat}`,
    ),
    guide: { label: 'Windsurf setup guide', href: '/integrations/windsurf' },
    featured: false,
  },
]

/** The four prompts every setup box shows as tabs. */
export const setupPrompts = allSetupPrompts.filter((client) => client.featured)

/** The prompt for one AI client, when it can run setup itself. */
export const setupPromptFor = (id: string) =>
  allSetupPrompts.find((client) => client.id === id)

const account = 'https://seoskill.dev/account'

const keyNames = {
  dataforseo: 'DataForSEO login and password',
  ahrefs: 'Ahrefs API key',
  research: 'DataForSEO login and password, or my Ahrefs API key',
}
const keyBills = {
  dataforseo: 'DataForSEO bills',
  ahrefs: 'Ahrefs bills',
  research: 'The provider bills',
}

/** The step that has the person save a research key, never in the chat. */
export const researchKeyStep = (key: keyof typeof keyNames) =>
  `Ask me to open ${account}, open the Keys tab and save my ${keyNames[key]}. ${keyBills[key]} my own account. Never ask me to paste a key into this chat. Wait until I say it is saved.`

/**
 * The steps a data source's pages add to the prompt: saving a key on the
 * account page, which only the person can do, or connecting Bing.
 */
export const sourceSetupSteps = (source: Source): string[] => {
  if (source.connect === 'key')
    return [
      researchKeyStep(source.id === 'dataforseo' ? 'dataforseo' : 'ahrefs'),
    ]
  if (source.connect === 'clicky')
    return [
      `Ask me to open ${account}, open the Keys tab and add my Clicky account, or one site with its site ID and sitekey. Never ask me to paste them into this chat. Wait until I say it is saved.`,
    ]
  if (source.connect === 'cli')
    return [
      `Ask me to open ${account}, choose Connect Bing and sign in to Bing Webmaster Tools with an account that has my site verified. Wait until I say it is done, then check Bing comes through with \`seo report --site <the site I picked> --section bing\`.`,
    ]
  return []
}

/**
 * A prompt for one task, for pages that show what the agent can do. It sets
 * SEO Skill up first when the tools are missing, and asks the person to save
 * a research key on their account when the task needs one. `crawl` adds the
 * CLI, which crawls run on.
 */
export const taskPrompt = (
  task: string,
  key?: 'dataforseo' | 'research',
  crawl = false,
) =>
  [
    'Use the seoskill MCP tools for this. If you do not have them yet, set up SEO Skill first with the prompt under "Set up SEO Skill" at https://seoskill.dev/index.md, then tell me to send this message again once the tools load.',
    ...(key
      ? [
          `This needs ${key === 'dataforseo' ? 'a DataForSEO login' : 'a DataForSEO login or an Ahrefs API key'} saved on my seoskill.dev account. If a tool says the key is missing, ask me to open ${account}, open the Keys tab and save it. Never ask me to paste a key into this chat.`,
        ]
      : []),
    ...(crawl
      ? [
          'Crawls run with the seo CLI on this machine. If `seo --version` fails, install it with `npm i -g seo`. A crawl needs no sign-in.',
        ]
      : []),
    task,
  ].join('\n\n')
