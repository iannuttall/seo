import { spawnSync } from 'node:child_process'
import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { getSeoCliPaths } from '@seo/core'
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

interface CommandResult {
  status: number | null
  stdout: string
  stderr: string
  error?: Error
}

type CommandRunner = (command: string, args: string[]) => CommandResult

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

function managedServer(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.args)) return false
  const args = value.args.filter(
    (item): item is string => typeof item === 'string',
  )
  const packageName = args.find((item) => item === 'seo' || item === '@seo/cli')
  return Boolean(packageName && args.includes('mcp') && args.includes('serve'))
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

function serverConfig(includeType = false): Record<string, unknown> {
  const paths = getSeoCliPaths()
  const config: Record<string, unknown> =
    process.platform === 'win32'
      ? {
          command: 'cmd',
          args: ['/c', 'npx', '-y', 'seo', 'mcp', 'serve'],
          env: { SEO_CONFIG_DIR: paths.configDir },
        }
      : {
          command: 'npx',
          args: ['-y', 'seo', 'mcp', 'serve'],
          env: { SEO_CONFIG_DIR: paths.configDir },
        }
  if (includeType) config.type = 'stdio'
  return config
}

function codexManaged(output: string): boolean {
  return (
    /command:\s+npx\b/.test(output) &&
    /args:\s+-y\s+seo\s+mcp\s+serve\b/.test(output)
  )
}

function codexCommand(
  target: NativeClientConfigTarget,
  operation: 'install' | 'uninstall',
  runCommand: CommandRunner,
): { client: SupportedClient; path: string; changed: boolean } {
  const current = runCommand(target.executable, ['mcp', 'get', 'seo'])
  const exists = current.status === 0
  if (exists && !codexManaged(current.stdout)) {
    throw new Error(
      `Cannot ${operation} SEO MCP: ${target.path} already has an unmanaged mcp_servers.seo entry.`,
    )
  }
  if (operation === 'install' && exists) {
    return { client: target.client, path: target.path, changed: false }
  }
  if (operation === 'uninstall' && !exists) {
    return { client: target.client, path: target.path, changed: false }
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
          '--',
          'npx',
          '-y',
          'seo',
          'mcp',
          'serve',
        ]
      : ['mcp', 'remove', 'seo']
  const result = runCommand(target.executable, args)
  if (result.error || result.status !== 0) {
    const detail =
      result.error?.message ?? result.stderr.trim() ?? 'unknown error'
    throw new Error(`Cannot ${operation} SEO MCP for Codex: ${detail}`)
  }
  return { client: target.client, path: target.path, changed: true }
}

export function installMcpConfig(
  target: ClientConfigTarget,
  options: { runCommand?: CommandRunner } = {},
): { client: SupportedClient; path: string; changed: boolean } {
  if (target.kind === 'native') {
    return codexCommand(
      target,
      'install',
      options.runCommand ?? defaultCommandRunner,
    )
  }

  const { source, config } = readConfig(target)
  const servers = config.mcpServers as Record<string, unknown> | undefined
  const current = servers?.seo
  const desired = serverConfig(target.includeType)
  if (isDeepStrictEqual(current, desired)) {
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
  options: { runCommand?: CommandRunner } = {},
): { client: SupportedClient; path: string; changed: boolean } {
  if (target.kind === 'native') {
    return codexCommand(
      target,
      'uninstall',
      options.runCommand ?? defaultCommandRunner,
    )
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
