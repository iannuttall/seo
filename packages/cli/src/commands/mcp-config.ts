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
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { getSeoCliPaths } from '@seo/core'
import {
  applyEdits,
  modify,
  type ParseError,
  parse,
  printParseErrorCode,
} from 'jsonc-parser'

export type SupportedClient = 'claude-desktop' | 'cursor' | 'claude-code'

export interface ClientConfigTarget {
  client: SupportedClient
  path: string
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

function readConfig(target: ClientConfigTarget): {
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
  target: ClientConfigTarget
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

export function detectMcpClients(): ClientConfigTarget[] {
  const home = homedir()
  const targets: ClientConfigTarget[] = [
    {
      client: 'claude-desktop',
      path:
        process.platform === 'darwin'
          ? resolve(
              home,
              'Library/Application Support/Claude/claude_desktop_config.json',
            )
          : resolve(home, '.config/Claude/claude_desktop_config.json'),
    },
    { client: 'cursor', path: resolve(home, '.cursor/mcp.json') },
    { client: 'claude-code', path: resolve(home, '.claude.json') },
  ]
  return targets
}

function serverConfig(): Record<string, unknown> {
  const paths = getSeoCliPaths()
  if (process.platform === 'win32') {
    return {
      command: 'cmd',
      args: ['/c', 'npx', '-y', 'seo', 'mcp', 'serve'],
      env: { SEO_CONFIG_DIR: paths.configDir },
    }
  }

  return {
    command: 'npx',
    args: ['-y', 'seo', 'mcp', 'serve'],
    env: { SEO_CONFIG_DIR: paths.configDir },
  }
}

export function installMcpConfig(target: ClientConfigTarget): {
  client: SupportedClient
  path: string
  changed: boolean
} {
  const { source, config } = readConfig(target)
  const servers = config.mcpServers as Record<string, unknown> | undefined
  const current = servers?.seo
  const desired = serverConfig()
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

export function uninstallMcpConfig(target: ClientConfigTarget): {
  client: SupportedClient
  path: string
  changed: boolean
} {
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
