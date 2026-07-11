import { spawnSync } from 'node:child_process'
import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { getSeoCliPaths, SEO_VERSION } from '@seo/core'
import {
  applyEdits,
  modify,
  type ParseError,
  parse,
  printParseErrorCode,
} from 'jsonc-parser'
import type {
  ClientConfigTarget,
  JsonClientConfigTarget,
  NativeClientConfigTarget,
  SupportedClient,
} from './mcp-clients.js'
import { resolveMcpClientExecutable } from './mcp-clients.js'

interface CommandResult {
  status: number | null
  stdout: string
  stderr: string
  error?: Error
}

type CommandRunner = (command: string, args: string[]) => CommandResult

export interface McpServerCommand {
  command: string
  args: string[]
}

export interface McpConfigOptions {
  runCommand?: CommandRunner
  reinstall?: boolean
  serverCommand?: McpServerCommand
}

const formattingOptions = {
  insertSpaces: true,
  tabSize: 2,
  eol: '\n',
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function writeAtomic(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  const mode = existsSync(path) ? statSync(path).mode & 0o777 : 0o600
  writeFileSync(tmp, value, { encoding: 'utf8', mode })
  renameSync(tmp, path)
}

function backup(path: string): void {
  const base = `${path}.bak-${timestamp()}`
  let candidate = base
  let suffix = 2
  while (existsSync(candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  copyFileSync(path, candidate, constants.COPYFILE_EXCL)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readConfig(target: JsonClientConfigTarget): {
  source: string
  config: Record<string, unknown>
} {
  if (!existsSync(target.path)) return { source: '{}\n', config: {} }

  const source = readFileSync(target.path, 'utf8')
  const errors: ParseError[] = []
  const config = parse(source, errors, { allowTrailingComma: true })
  if (errors.length > 0) {
    const first = errors[0]
    const detail = first
      ? `${printParseErrorCode(first.error)} at offset ${first.offset}`
      : 'unknown parse error'
    throw new Error(`Cannot update ${target.path}: invalid JSONC (${detail}).`)
  }
  if (!isRecord(config)) {
    throw new Error(
      `Cannot update ${target.path}: config root must be an object.`,
    )
  }
  if (config.mcpServers !== undefined && !isRecord(config.mcpServers)) {
    throw new Error(
      `Cannot update ${target.path}: mcpServers must be an object.`,
    )
  }
  return { source, config }
}

function isSeoPackageCommand(args: string[]): boolean {
  return (
    args.includes('mcp') &&
    args.includes('serve') &&
    args.some(
      (item) =>
        item === 'seo' || item.startsWith('seo@') || item === '@seo/cli',
    )
  )
}

function isManagedNodeCommand(
  value: Record<string, unknown>,
  args: string[],
): boolean {
  if (
    typeof value.command !== 'string' ||
    args.length !== 3 ||
    args[1] !== 'mcp' ||
    args[2] !== 'serve' ||
    !isRecord(value.env)
  ) {
    return false
  }
  return value.env.SEO_MCP_CONFIGURED_BY === 'seo'
}

function managedServer(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.args)) return false
  const args = value.args.filter(
    (item): item is string => typeof item === 'string',
  )
  return isSeoPackageCommand(args) || isManagedNodeCommand(value, args)
}

function writeConfigEdit(input: {
  target: JsonClientConfigTarget
  source: string
  value: unknown
}): void {
  const next = applyEdits(
    input.source,
    modify(input.source, ['mcpServers', 'seo'], input.value, {
      formattingOptions,
    }),
  )
  if (existsSync(input.target.path)) backup(input.target.path)
  writeAtomic(input.target.path, next)
}

function defaultCommandRunner(command: string, args: string[]): CommandResult {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  }
}

function isTemporaryNpxPath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/').toLowerCase()
  return (
    normalized.includes('/_npx/') ||
    normalized.includes('/.npm/_npx/') ||
    normalized.includes('/.cache/pnpm/dlx/')
  )
}

function installedCliPath(cliPath: string | undefined): string | undefined {
  if (!cliPath || !existsSync(cliPath)) return undefined
  const resolved = realpathSync(cliPath)
  return isTemporaryNpxPath(resolved) ? undefined : resolved
}

export function resolveMcpServerCommand(
  input: {
    cliPath?: string
    nodePath?: string
    platform?: NodeJS.Platform
    version?: string
  } = {},
): McpServerCommand {
  const cliPath = installedCliPath(input.cliPath ?? process.argv[1])
  if (cliPath) {
    return {
      command: input.nodePath ?? process.execPath,
      args: [cliPath, 'mcp', 'serve'],
    }
  }

  const packageName = `seo@${input.version ?? SEO_VERSION}`
  if ((input.platform ?? process.platform) === 'win32') {
    return {
      command: 'cmd',
      args: ['/c', 'npx', '-y', packageName, 'mcp', 'serve'],
    }
  }
  return { command: 'npx', args: ['-y', packageName, 'mcp', 'serve'] }
}

function serverConfig(
  includeType = false,
  command = resolveMcpServerCommand(),
): Record<string, unknown> {
  const paths = getSeoCliPaths()
  const config: Record<string, unknown> = {
    command: command.command,
    args: command.args,
    env: {
      SEO_CONFIG_DIR: paths.configDir,
      SEO_MCP_CONFIGURED_BY: 'seo',
    },
  }
  if (includeType) config.type = 'stdio'
  return config
}

function codexManaged(output: string): boolean {
  return (
    output.includes('SEO_MCP_CONFIGURED_BY') ||
    /args:\s+-y\s+(?:seo(?:@\S+)?|@seo\/cli)\s+mcp\s+serve\b/.test(output)
  )
}

function codexCommand(
  target: NativeClientConfigTarget,
  operation: 'install' | 'uninstall',
  options: Required<
    Pick<McpConfigOptions, 'runCommand' | 'reinstall' | 'serverCommand'>
  >,
): { client: SupportedClient; path: string; changed: boolean } {
  const executable = resolveMcpClientExecutable(target.executable)
  const current = options.runCommand(executable, ['mcp', 'get', 'seo'])
  if ((current.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
    throw new Error(
      'Cannot install SEO MCP for Codex: the `codex` command is not available on PATH. Install Codex CLI or choose another MCP client.',
    )
  }
  const exists = current.status === 0
  if (exists && !codexManaged(current.stdout)) {
    throw new Error(
      `Cannot ${operation} SEO MCP: ${target.path} already has an unmanaged mcp_servers.seo entry.`,
    )
  }
  if (operation === 'install' && exists && !options.reinstall) {
    return { client: target.client, path: target.path, changed: false }
  }
  if (operation === 'uninstall' && !exists) {
    return { client: target.client, path: target.path, changed: false }
  }

  if (operation === 'install' && exists) {
    const removed = options.runCommand(executable, ['mcp', 'remove', 'seo'])
    if (removed.error || removed.status !== 0) {
      const detail =
        removed.error?.message ?? removed.stderr.trim() ?? 'unknown error'
      throw new Error(`Cannot reinstall SEO MCP for Codex: ${detail}`)
    }
  }

  const paths = getSeoCliPaths()
  const args =
    operation === 'install'
      ? [
          'mcp',
          'add',
          'seo',
          '--env',
          `SEO_CONFIG_DIR=${paths.configDir}`,
          '--env',
          'SEO_MCP_CONFIGURED_BY=seo',
          '--',
          options.serverCommand.command,
          ...options.serverCommand.args,
        ]
      : ['mcp', 'remove', 'seo']
  const result = options.runCommand(executable, args)
  if (result.error || result.status !== 0) {
    const detail =
      result.error?.message ?? result.stderr.trim() ?? 'unknown error'
    throw new Error(`Cannot ${operation} SEO MCP for Codex: ${detail}`)
  }
  return { client: target.client, path: target.path, changed: true }
}

export function installMcpConfig(
  target: ClientConfigTarget,
  options: McpConfigOptions = {},
): { client: SupportedClient; path: string; changed: boolean } {
  const resolved = {
    runCommand: options.runCommand ?? defaultCommandRunner,
    reinstall: options.reinstall ?? false,
    serverCommand: options.serverCommand ?? resolveMcpServerCommand(),
  }
  if (target.kind === 'native') {
    return codexCommand(target, 'install', resolved)
  }

  const { source, config } = readConfig(target)
  const servers = config.mcpServers as Record<string, unknown> | undefined
  const current = servers?.seo
  const desired = serverConfig(target.includeType, resolved.serverCommand)
  if (isDeepStrictEqual(current, desired) && !resolved.reinstall) {
    return { client: target.client, path: target.path, changed: false }
  }
  if (current !== undefined && !managedServer(current)) {
    throw new Error(
      `Cannot install SEO MCP: ${target.path} already has an unmanaged mcpServers.seo entry.`,
    )
  }

  writeConfigEdit({ target, source, value: desired })
  return { client: target.client, path: target.path, changed: true }
}

export function uninstallMcpConfig(
  target: ClientConfigTarget,
  options: Pick<McpConfigOptions, 'runCommand'> = {},
): { client: SupportedClient; path: string; changed: boolean } {
  if (target.kind === 'native') {
    return codexCommand(target, 'uninstall', {
      runCommand: options.runCommand ?? defaultCommandRunner,
      reinstall: false,
      serverCommand: resolveMcpServerCommand(),
    })
  }
  if (!existsSync(target.path)) {
    return { client: target.client, path: target.path, changed: false }
  }

  const { source, config } = readConfig(target)
  const servers = config.mcpServers as Record<string, unknown> | undefined
  if (servers?.seo === undefined) {
    return { client: target.client, path: target.path, changed: false }
  }
  if (!managedServer(servers.seo)) {
    throw new Error(
      `Cannot uninstall SEO MCP: ${target.path} has an unmanaged mcpServers.seo entry.`,
    )
  }

  writeConfigEdit({ target, source, value: undefined })
  return { client: target.client, path: target.path, changed: true }
}
