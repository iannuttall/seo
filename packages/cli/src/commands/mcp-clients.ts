import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, posix, win32 } from 'node:path'

export type SupportedClient =
  | 'claude-desktop'
  | 'claude-code'
  | 'codex'
  | 'cursor'

interface BaseClientTarget {
  client: SupportedClient
  label: string
  path: string
  commandNames: string[]
  detectionPaths: string[]
}

export interface JsonClientConfigTarget extends BaseClientTarget {
  kind: 'json'
  includeType?: boolean
}

export interface NativeClientConfigTarget extends BaseClientTarget {
  kind: 'native'
  executable: 'codex'
}

export type ClientConfigTarget =
  | JsonClientConfigTarget
  | NativeClientConfigTarget

function platformConfigRoot(input: {
  home: string
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
}): string {
  const path = input.platform === 'win32' ? win32 : posix
  if (input.platform === 'win32') {
    return input.env.APPDATA ?? path.resolve(input.home, 'AppData/Roaming')
  }
  if (input.platform === 'darwin') {
    return path.resolve(input.home, 'Library/Application Support')
  }
  return input.env.XDG_CONFIG_HOME ?? path.resolve(input.home, '.config')
}

export function mcpClientTargets(
  input: {
    home?: string
    platform?: NodeJS.Platform
    env?: NodeJS.ProcessEnv
  } = {},
): ClientConfigTarget[] {
  const home = input.home ?? homedir()
  const platform = input.platform ?? process.platform
  const env = input.env ?? process.env
  const configRoot = platformConfigRoot({ home, platform, env })
  const path = platform === 'win32' ? win32 : posix
  const targets: ClientConfigTarget[] = []

  if (platform === 'darwin' || platform === 'win32') {
    const claudeRoot = path.resolve(configRoot, 'Claude')
    targets.push({
      kind: 'json',
      client: 'claude-desktop',
      label: 'Claude Desktop',
      path: path.resolve(claudeRoot, 'claude_desktop_config.json'),
      commandNames: [],
      detectionPaths:
        platform === 'darwin'
          ? [claudeRoot, '/Applications/Claude.app']
          : [claudeRoot],
    })
  }

  targets.push(
    {
      kind: 'json',
      client: 'claude-code',
      label: 'Claude Code',
      path: path.resolve(home, '.claude.json'),
      includeType: true,
      commandNames: ['claude'],
      detectionPaths: [path.resolve(home, '.claude')],
    },
    {
      kind: 'native',
      client: 'codex',
      label: 'Codex',
      path: path.resolve(home, '.codex/config.toml'),
      executable: 'codex',
      commandNames: ['codex'],
      detectionPaths: [path.resolve(home, '.codex')],
    },
    {
      kind: 'json',
      client: 'cursor',
      label: 'Cursor',
      path: path.resolve(home, '.cursor/mcp.json'),
      commandNames: ['cursor', 'cursor-agent'],
      detectionPaths: [
        path.resolve(home, '.cursor'),
        ...(platform === 'darwin' ? ['/Applications/Cursor.app'] : []),
      ],
    },
  )

  return targets
}

export function resolveMcpClientExecutable(
  command: string,
  input: {
    exists?: (path: string) => boolean
    nodePath?: string
    path?: string
    platform?: NodeJS.Platform
  } = {},
): string {
  const platform = input.platform ?? process.platform
  const exists = input.exists ?? existsSync
  const nodePath = input.nodePath ?? process.execPath
  const names =
    platform === 'win32'
      ? [`${command}.cmd`, `${command}.exe`, command]
      : [command]

  const pathEntries = (input.path ?? process.env.PATH ?? '')
    .split(platform === 'win32' ? ';' : ':')
    .filter(Boolean)
  for (const directory of pathEntries) {
    for (const name of names) {
      const candidate = join(directory, name)
      if (exists(candidate)) return candidate
    }
  }

  for (const name of names) {
    const candidate = join(dirname(nodePath), name)
    if (exists(candidate)) return candidate
  }
  return command
}

function commandExists(command: string): boolean {
  return resolveMcpClientExecutable(command) !== command
}

export function detectMcpClients(
  input: {
    targets?: ClientConfigTarget[]
    hasCommand?: (command: string) => boolean
    hasPath?: (path: string) => boolean
  } = {},
): ClientConfigTarget[] {
  const targets = input.targets ?? mcpClientTargets()
  const hasCommand = input.hasCommand ?? commandExists
  const hasPath = input.hasPath ?? existsSync
  return targets.filter((target) => {
    if (target.kind === 'native') {
      return target.commandNames.some(hasCommand)
    }
    return (
      hasPath(target.path) ||
      target.detectionPaths.some(hasPath) ||
      target.commandNames.some(hasCommand)
    )
  })
}
