import { headingLines } from './context.js'
import type { Caller } from './types.js'

// Autopilot: a scheduled run of the person's own agent that calls seo next,
// does the due jobs and opens a pull request for each change. The person's
// answer and rules live in the business context under "## Autopilot", so
// every run, local or on a CI machine with SEO_TOKEN, reads the same rules.
// seo next asks once while the heading is missing, and returns the setup
// steps with the GitHub Actions workflow when called with autopilot.

export type AutopilotState = 'not-set-up' | 'off' | 'on'

export function autopilotState(contextText: string): AutopilotState {
  const lines = headingLines(contextText, 'autopilot')
  if (!lines.length) return 'not-set-up'
  return /^off\b/i.test(lines[0] ?? '') ? 'off' : 'on'
}

// Shown under the due step until the person has answered.
export function autopilotAsk(site: string, call: Caller): string {
  return `Once this step's work is done, ask the person once whether to put ${site} on autopilot: their agent runs on a schedule, daily or weekly, calls this tool, does the due jobs and opens a pull request for each change for them to review. If they say yes, run ${call('next', { site, autopilot: true })} for the setup steps. If they say no, add "## Autopilot" with the line "Off" to the business context and save it, so this is not asked again.`
}

const WORKFLOW_PATH = '.github/workflows/seo-autopilot.yml'

// The prompt each scheduled run starts with. It uses the CLI, because a
// CI machine signs in with SEO_TOKEN and cannot open a browser for the MCP.
export function autopilotRunPrompt(site: string): string {
  return [
    `Run SEO Skill's autopilot for ${site}.`,
    `1. List the pull requests earlier autopilot runs opened, on branches that start with seo-autopilot/. For each merged one, run seo report --site ${site} --mark fixed --issues <ids> for the jobs its description names that are still open. Leave jobs that still have an open pull request alone.`,
    `2. Run seo next --site ${site} and follow the due step for at most 5 of its jobs, skipping jobs that already have an open pull request.`,
    `3. Open one pull request for each change, on a branch that starts with seo-autopilot/, and name the job ids it covers in its description. Merge only what the "## Autopilot" rules in the business context allow. Everything else waits for review.`,
    `4. Where the step says to ask the person, such as before a new page, a template change, a redirect or a deletion, open a GitHub issue with the question and the evidence instead of making the change.`,
    '5. End with a short summary of what you opened and what waits for the person.',
  ].join('\n')
}

// Each agent's step in the workflow. Codex's own workspace profile has no
// network and keeps .git read-only, so its step selects a profile, written
// outside the checkout, that adds both and keeps the rest of :workspace.
const AGENT_STEPS = {
  'Claude Code': [
    '      - uses: anthropics/claude-code-action@v1',
    '        with:',
    '          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}',
    '          claude_args: --max-turns 80',
    '          prompt: |',
  ],
  Codex: [
    '      - name: Let Codex reach SEO Skill and GitHub, and commit',
    '        run: |',
    '          mkdir -p "$RUNNER_TEMP/codex-home"',
    `          cat > "$RUNNER_TEMP/codex-home/config.toml" <<'EOF'`,
    '          [permissions.seo-autopilot]',
    `          extends = ":workspace"`,
    `          [permissions.seo-autopilot.filesystem.":workspace_roots"]`,
    `          ".git" = "write"`,
    '          [permissions.seo-autopilot.network]',
    '          enabled = true',
    '          [shell_environment_policy]',
    `          inherit = "all"`,
    '          ignore_default_excludes = true',
    '          EOF',
    '      - uses: openai/codex-action@v1',
    '        with:',
    '          openai-api-key: ${{ secrets.OPENAI_API_KEY }}',
    '          codex-home: ${{ runner.temp }}/codex-home',
    '          permission-profile: seo-autopilot',
    '          prompt: |',
  ],
} as const

type Agent = keyof typeof AGENT_STEPS

function workflowFile(site: string, agent: Agent): string {
  const prompt = autopilotRunPrompt(site)
    .split('\n')
    .map((line) => `            ${line}`)
    .join('\n')
  return [
    'name: SEO autopilot',
    'on:',
    '  schedule:',
    "    - cron: '0 6 * * 1' # Mondays at 06:00 UTC. For daily runs: '0 6 * * *'",
    '  workflow_dispatch:',
    'permissions:',
    '  contents: write',
    '  pull-requests: write',
    '  issues: write',
    'jobs:',
    '  autopilot:',
    '    runs-on: ubuntu-latest',
    '    timeout-minutes: 60',
    '    env:',
    '      SEO_TOKEN: ${{ secrets.SEO_TOKEN }}',
    '      GH_TOKEN: ${{ github.token }}',
    '    steps:',
    '      - uses: actions/checkout@v5',
    '      - run: npm i -g seo',
    ...AGENT_STEPS[agent],
    prompt,
  ].join('\n')
}

// The setup steps seo next returns with autopilot.
export function autopilotGuide(site: string, call: Caller): string {
  return [
    `Set up autopilot for ${site} with the person. Tell them each run uses their own model API key and does at most 5 jobs.`,
    [
      '1. Cadence. Weekly runs the whole loop and suits most sites. Daily also catches pages that drop out of Google or break within a day. Ask which they want.',
      `2. Where it runs. If you can run a prompt on a schedule in the site's repository yourself, such as with your own scheduled tasks, set it up there with the run prompt below. Otherwise commit one of the workflows below to the site's repository at ${WORKFLOW_PATH}: the Claude Code one or the Codex one, for the agent the person pays for. It runs that agent on GitHub Actions. The person adds two repository secrets: SEO_TOKEN, an account token from https://seoskill.dev/account under Linked machines, and ANTHROPIC_API_KEY for Claude Code or OPENAI_API_KEY for Codex. Without an account, https://seoskill.dev/docs/cloud-agents lists the Google service account secrets to use instead.`,
      '3. Rules. By default every change waits for the person to review its pull request. Ask whether any kind of change may merge on its own, such as titles and descriptions. New pages, template changes, redirects and deletions always wait for review.',
      `4. Save their answers in the business context under "## Autopilot": the cadence, where it runs, and what may merge on its own, or "Every change waits for review". Save it with ${call('next', { site, context: '<the whole context with the new heading>' })}.`,
    ].join('\n'),
    `The run prompt:\n\n${autopilotRunPrompt(site)}`,
    ...(Object.keys(AGENT_STEPS) as Agent[]).map(
      (agent) =>
        `The workflow for ${agent}, ${WORKFLOW_PATH}:\n\n\`\`\`yaml\n${workflowFile(site, agent)}\n\`\`\``,
    ),
    'Once it is set up, start one run by hand, such as with gh workflow run seo-autopilot.yml, and show the person what it opened.',
  ].join('\n\n')
}
