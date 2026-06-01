import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { getSeoCliPaths } from '@seo/core'
import { parse } from 'jsonc-parser'

export type SupportedClient = 'claude-desktop' | 'cursor' | 'claude-code'

interface ClientConfigTarget {
  client: SupportedClient
  path: string
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function writeAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  renameSync(tmp, path)
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
      args: ['/c', 'npx', '-y', '@seo/cli', 'mcp', 'serve'],
      env: { SEO_CONFIG_DIR: paths.configDir },
    }
  }

  return {
    command: 'npx',
    args: ['-y', '@seo/cli', 'mcp', 'serve'],
    env: { SEO_CONFIG_DIR: paths.configDir },
  }
}

export function installMcpConfig(target: ClientConfigTarget): {
  client: SupportedClient
  path: string
  changed: boolean
} {
  const current = existsSync(target.path)
    ? parse(readFileSync(target.path, 'utf8'))
    : {}
  const next =
    typeof current === 'object' && current
      ? { ...(current as Record<string, unknown>) }
      : {}
  const servers =
    typeof next.mcpServers === 'object' && next.mcpServers
      ? { ...(next.mcpServers as Record<string, unknown>) }
      : {}
  servers.seo = serverConfig()
  next.mcpServers = servers

  if (existsSync(target.path)) {
    copyFileSync(target.path, `${target.path}.bak-${timestamp()}`)
  }
  writeAtomic(target.path, next)
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

  const current = parse(readFileSync(target.path, 'utf8'))
  const next =
    typeof current === 'object' && current
      ? { ...(current as Record<string, unknown>) }
      : {}
  const servers =
    typeof next.mcpServers === 'object' && next.mcpServers
      ? { ...(next.mcpServers as Record<string, unknown>) }
      : {}
  if (!servers.seo) {
    return { client: target.client, path: target.path, changed: false }
  }
  delete servers.seo
  next.mcpServers = servers
  copyFileSync(target.path, `${target.path}.bak-${timestamp()}`)
  writeAtomic(target.path, next)
  return { client: target.client, path: target.path, changed: true }
}
