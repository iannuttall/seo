import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { isCancel, log, select } from '@clack/prompts'
import updateNotifier from 'update-notifier'

type PackageInfo = {
  name: string
  version: string
}

type UpdateInfo = {
  current: string
  latest: string
}

type UpdateNotifier = {
  update?: UpdateInfo
}

export type SelfUpdateCommand = {
  args: string[]
  command: string
}

type OfferUpdateOptions = {
  argv?: string[]
  cliPath?: string
  createNotifier?: (pkg: PackageInfo) => UpdateNotifier
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  prompt?: (input: {
    command: SelfUpdateCommand
    update: UpdateInfo
  }) => Promise<'later' | 'update'>
  run?: (command: SelfUpdateCommand) => number | null
  stdinIsTty?: boolean
  stdoutIsTty?: boolean
}

function normalizedPath(value: string): string {
  return value.replaceAll('\\', '/').toLowerCase()
}

function packageManagerCommand(
  manager: 'bun' | 'npm' | 'pnpm' | 'yarn',
  platform: NodeJS.Platform,
): string {
  if (platform !== 'win32') return manager
  return `${manager}.cmd`
}

export function inferSelfUpdateCommand(
  resolvedCliPath: string,
  platform: NodeJS.Platform = process.platform,
): SelfUpdateCommand | undefined {
  const path = normalizedPath(resolvedCliPath)

  if (
    path.includes('/_npx/') ||
    path.includes('/.npm/_npx/') ||
    path.includes('/.cache/pnpm/dlx/') ||
    path.includes('/.volta/')
  ) {
    return undefined
  }

  if (path.includes('/.pnpm/') || path.includes('/pnpm/global/')) {
    return {
      command: packageManagerCommand('pnpm', platform),
      args: ['add', '--global', 'seo@latest'],
    }
  }

  if (path.includes('/.bun/install/global/')) {
    return {
      command: packageManagerCommand('bun', platform),
      args: ['add', '--global', 'seo@latest'],
    }
  }

  if (path.includes('/.config/yarn/global/')) {
    return {
      command: packageManagerCommand('yarn', platform),
      args: ['global', 'add', 'seo@latest'],
    }
  }

  if (path.includes('/node_modules/seo/')) {
    return {
      command: packageManagerCommand('npm', platform),
      args: ['install', '--global', 'seo@latest'],
    }
  }

  return undefined
}

function isNewerVersion(current: string, latest: string): boolean {
  const parse = (value: string) =>
    value
      .replace(/^v/, '')
      .split('-')[0]
      ?.split('.')
      .map((part) => Number.parseInt(part, 10)) ?? []
  const currentParts = parse(current)
  const latestParts = parse(latest)

  for (let index = 0; index < 3; index += 1) {
    const currentPart = currentParts[index] ?? 0
    const latestPart = latestParts[index] ?? 0
    if (!Number.isFinite(currentPart) || !Number.isFinite(latestPart)) {
      return false
    }
    if (latestPart > currentPart) return true
    if (latestPart < currentPart) return false
  }

  return false
}

export function canOfferInteractiveUpdate(input: {
  argv: string[]
  env: NodeJS.ProcessEnv
  stdinIsTty: boolean
  stdoutIsTty: boolean
}): boolean {
  if (!input.stdinIsTty || !input.stdoutIsTty) return false
  if (
    input.env.CI ||
    input.env.NO_UPDATE_NOTIFIER ||
    input.env.NODE_ENV === 'test' ||
    input.env.npm_lifecycle_event ||
    input.env.npm_execpath ||
    input.env.TERM === 'dumb'
  ) {
    return false
  }
  if (input.argv.includes('--json')) return false
  if (
    input.argv.some((arg) => ['--help', '-h', '--version', '-v'].includes(arg))
  ) {
    return false
  }
  if (['help', 'mcp'].includes(input.argv[0] ?? '')) return false
  return true
}

function resolvedCliPath(cliPath: string | undefined): string | undefined {
  if (!cliPath) return undefined
  try {
    return realpathSync(cliPath)
  } catch {
    return cliPath
  }
}

async function promptForUpdate(input: {
  command: SelfUpdateCommand
  update: UpdateInfo
}): Promise<'later' | 'update'> {
  const choice = await select<'later' | 'update'>({
    message: `seo ${input.update.latest} is available. You have ${input.update.current}.`,
    options: [
      {
        value: 'update',
        label: 'Update now',
        hint: [input.command.command, ...input.command.args].join(' '),
      },
      { value: 'later', label: 'Later' },
    ],
    initialValue: 'later',
  })
  return isCancel(choice) ? 'later' : choice
}

function runUpdate(command: SelfUpdateCommand): number | null {
  return spawnSync(command.command, command.args, { stdio: 'inherit' }).status
}

export async function maybeOfferSelfUpdate(
  pkg: PackageInfo,
  options: OfferUpdateOptions = {},
): Promise<number | undefined> {
  const argv = options.argv ?? process.argv.slice(2)
  const env = options.env ?? process.env
  if (
    !canOfferInteractiveUpdate({
      argv,
      env,
      stdinIsTty: options.stdinIsTty ?? Boolean(process.stdin.isTTY),
      stdoutIsTty: options.stdoutIsTty ?? Boolean(process.stdout.isTTY),
    })
  ) {
    return undefined
  }

  const path = resolvedCliPath(options.cliPath ?? process.argv[1])
  const command = path
    ? inferSelfUpdateCommand(path, options.platform ?? process.platform)
    : undefined
  if (!command) return undefined

  const notifier = (
    options.createNotifier ??
    ((value) =>
      updateNotifier({
        pkg: value,
        shouldNotifyInNpmScript: false,
      }))
  )(pkg)
  const update = notifier.update
  if (!update || !isNewerVersion(update.current, update.latest)) {
    return undefined
  }

  const choice = await (options.prompt ?? promptForUpdate)({ command, update })
  if (choice === 'later') return undefined

  const status = (options.run ?? runUpdate)(command)
  if (status === 0) {
    log.success(`Updated seo to ${update.latest}. Run your command again.`)
    return 0
  }

  log.error('The update failed. Your current version is unchanged.')
  return 1
}
