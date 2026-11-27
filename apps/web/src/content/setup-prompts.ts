// The setup box gives a person one prompt to paste into their agent. The
// agent installs the CLI, adds the hosted MCP, waits while the person signs
// in, checks it connects and then works through the hosted MCP. Every
// command here must work on the published CLI and match the client steps in
// integrations.ts.
import { mcpUrl } from './integrations'

export type SetupPrompt = {
  id: string
  /** Tab label, and the agent named in "Give this prompt to". */
  label: string
  /** Who the prompt is for, in "Give this prompt to {agent}". */
  agent: string
  prompt: string
  guide: { label: string; href: string }
}

const install =
  'If `seo --version` fails, install the SEO Skill CLI with `npm i -g seo`. It needs Node.js 22.23.4, 24.22.1, 26.12.1 or a later release of the same line. If Node.js is missing or older, tell me to install the LTS release from https://nodejs.org and wait.'

const link =
  'Run `seo login`. It prints a link and a code. Show me both and ask me to open the link, sign in with the same Google account and click "Link this machine". Wait until I say it is done, then run `seo login` again to finish.'

const skill = 'Run `seo skill install` to add the SEO skill.'

const sites =
  'Run `seo sites` and ask me which site to start with. If it lists none, tell me the Google account I used needs access to a Search Console property.'

const useMcp = (restart: string) =>
  `When it is connected, ${restart} After that, use the seoskill MCP tools for my data. Call seo_next for the site I picked and do the step it returns. Use the \`seo\` CLI only for site crawls and Bing data, which run on my machine.`

const numbered = (steps: string[]) =>
  steps.map((step, index) => `${index + 1}. ${step}`).join('\n')

const prompt = (agent: string, steps: string[], end: string) =>
  [
    `Set up SEO Skill in ${agent} so you can work on my site's SEO with my own Search Console data. Do every step yourself and only stop when you need me.`,
    numbered(steps),
    end,
  ].join('\n\n')

export const setupPrompts: SetupPrompt[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    agent: 'Claude Code',
    prompt: prompt(
      'Claude Code',
      [
        install,
        `Add the hosted MCP server for every project with \`claude mcp add --transport http --scope user seoskill ${mcpUrl}\`. Skip this if \`claude mcp get seoskill\` already shows that URL.`,
        'Run `claude mcp login seoskill`. It opens my browser. Tell me to sign in with Google there, which creates my free seoskill.dev account, and wait until it finishes. If it times out, ask me to type /mcp, choose seoskill and sign in.',
        link,
        skill,
        'Run `claude mcp list` and check that seoskill shows as Connected. If it does not, read the error from `claude mcp get seoskill` and fix it.',
        sites,
      ],
      useMcp(
        'tell me to restart Claude Code with `claude --continue` so the seoskill tools load.',
      ),
    ),
    guide: {
      label: 'Claude Code setup guide',
      href: '/integrations/claude-code',
    },
  },
  {
    id: 'codex',
    label: 'Codex',
    agent: 'Codex',
    prompt: prompt(
      'Codex',
      [
        install,
        `Add the hosted MCP server with \`codex mcp add seoskill --url ${mcpUrl}\`. Skip this if \`codex mcp get seoskill\` already shows that URL. Some steps need network access or write outside this folder, so ask me to approve them.`,
        'Run `codex mcp login seoskill`. It opens my browser. Tell me to sign in with Google there, which creates my free seoskill.dev account, and wait until it finishes.',
        link,
        skill,
        'Run `codex mcp list` and check that seoskill is enabled and signed in. If it is not, read the error and fix it.',
        sites,
      ],
      useMcp(
        'tell me to restart Codex so the seoskill tools load. In a terminal, `codex resume --last` keeps this conversation.',
      ),
    ),
    guide: { label: 'Codex setup guide', href: '/integrations/codex' },
  },
  {
    id: 'cursor',
    label: 'Cursor',
    agent: 'Cursor',
    prompt: prompt(
      'Cursor',
      [
        install,
        `Add the hosted MCP server for every project. In ~/.cursor/mcp.json, add \`"seoskill": { "url": "${mcpUrl}" }\` under "mcpServers". Create the file if it is missing, and keep every other server in it.`,
        "Ask me to open the MCP section of Cursor's settings and sign in when seoskill asks for it. I sign in with Google, which creates my free seoskill.dev account. Wait until I say it is done.",
        link,
        skill,
        "Ask me to check that seoskill shows as connected with its tools listed in Cursor's settings. If it shows an error, read it with me and fix it.",
        sites,
      ],
      useMcp(
        'tell me to start a new chat so the seoskill tools load, and give me a message to send there that asks you to run seo_next for the site I picked.',
      ),
    ),
    guide: { label: 'Cursor setup guide', href: '/integrations/cursor' },
  },
  {
    id: 'other',
    label: 'Any agent',
    agent: 'your agent',
    prompt: prompt(
      'this agent',
      [
        install,
        `Add the hosted MCP server ${mcpUrl} to this agent as a remote HTTP MCP server named seoskill, for every project. Use this agent's own command or config file and keep its other servers. If you cannot add MCP servers yourself, find this agent's steps at https://seoskill.dev/integrations and walk me through them.`,
        "Start this agent's MCP sign-in for seoskill, or tell me how to start it. I sign in with Google, which creates my free seoskill.dev account. Wait until it finishes.",
        link,
        skill,
        'Check that this agent lists seoskill as connected. If it does not, read the error and fix it.',
        sites,
      ],
      useMcp(
        'tell me what to restart so the seoskill tools load, and give me a message to send afterwards that asks you to run seo_next for the site I picked.',
      ),
    ),
    guide: { label: 'Setup guides for every agent', href: '/integrations' },
  },
]
