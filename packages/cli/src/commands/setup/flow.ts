import { intro, note, outro } from '@clack/prompts'
import { ensureSeoCliDirs } from '@seo/core'
import { jsonFlag } from '../../args.js'
import {
  canPrompt,
  printCallout,
  printJson,
  printKeyValue,
} from '../../utils.js'
import { HOSTED_MCP_URL } from '../mcp-config.js'
import {
  maybeConnectAuth,
  maybeInstallMcp,
  maybeInstallSkill,
  type SetupAuthResult,
  type SetupMcpInstall,
  type SetupSkillInstall,
} from './prompts.js'

// `seo start` signs in, offers the MCP server and the skill, and says what to
// run next. It saves no site, project or report choices: every command takes
// its target each time.

const NEXT = ['seo sites', 'seo report --site <site>']

const STEPS = [
  'Sign in with Google (read-only Search Console and Google Analytics).',
  `Add the free hosted MCP server (${HOSTED_MCP_URL}) or a local one to your agents.`,
  'Install the SEO skill for your agents.',
]

function authLabel(auth: SetupAuthResult): string {
  if (auth.status === 'skipped') return 'skipped'
  if (auth.status === 'service-account') {
    return `service account${auth.accountEmail ? ` ${auth.accountEmail}` : ''}`
  }
  return auth.accountEmail ?? 'connected'
}

function skillLabel(skill: SetupSkillInstall): string {
  if (skill.status === 'installed') return 'installed'
  if (skill.status === 'failed') return 'install failed'
  return 'not installed'
}

function mcpLabel(installs: SetupMcpInstall[]): string {
  if (installs.length === 0) return 'not added'
  return installs
    .map((install) =>
      install.error
        ? `${install.client} skipped`
        : `${install.client} (${install.server})`,
    )
    .join(', ')
}

function printStarAsk(): void {
  process.stdout.write('\n')
  printCallout({
    title: 'Help other people find SEO Skill',
    body: 'If SEO Skill saved you time, a GitHub star helps other people find it.',
    command: 'https://github.com/iannuttall/seo',
  })
}

export async function runGuidedSetup(
  args: Record<string, unknown>,
): Promise<void> {
  const json = jsonFlag(args)
  if (!json) intro(process.argv[2] === 'setup' ? 'seo setup' : 'seo start')

  if (args['dry-run']) {
    if (json) {
      printJson({ dryRun: true, steps: STEPS, next: NEXT })
    } else {
      note(
        STEPS.map((step, index) => `${index + 1}. ${step}`).join('\n'),
        'Setup will',
      )
      note(NEXT.join('\n'), 'Then run')
      outro('Dry run complete. Nothing was changed.')
    }
    return
  }

  ensureSeoCliDirs()
  const interactive = canPrompt({ json })
  const auth = await maybeConnectAuth({ interactive })
  const mcp = interactive ? await maybeInstallMcp() : []
  const skill: SetupSkillInstall = interactive
    ? await maybeInstallSkill()
    : { status: 'skipped' }

  if (json) {
    printJson({ auth, mcp, skill, next: NEXT })
    return
  }

  printKeyValue([
    ['Google', authLabel(auth)],
    ['MCP server', mcpLabel(mcp)],
    ['SEO skill', skillLabel(skill)],
  ])
  const mcpFailures = mcp.filter((install) => install.error)
  if (mcpFailures.length) {
    note(
      mcpFailures
        .map((install) => `${install.client}: ${install.error}`)
        .join('\n'),
      'MCP setup skipped',
    )
  }
  if (skill.error) note(skill.error, 'SEO skill install failed')
  note(
    [
      'seo sites                  list your Search Console properties',
      'seo report --site <site>   run the main report for one of them',
    ].join('\n'),
    'Try next',
  )
  outro('Setup complete.')
  printStarAsk()
}
