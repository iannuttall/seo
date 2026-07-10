import assert from 'node:assert/strict'
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { parse } from 'jsonc-parser'
import {
  detectMcpClients,
  type JsonClientConfigTarget,
  mcpClientTargets,
} from './mcp-clients.js'
import { installMcpConfig, uninstallMcpConfig } from './mcp-config.js'

function fixture(source?: string): {
  dir: string
  target: JsonClientConfigTarget
} {
  const dir = mkdtempSync(join(tmpdir(), 'seo-mcp-config-'))
  const target = {
    kind: 'json' as const,
    client: 'cursor' as const,
    label: 'Cursor',
    path: join(dir, 'mcp.json'),
    commandNames: ['cursor'],
    detectionPaths: [join(dir, '.cursor')],
  }
  if (source !== undefined) writeFileSync(target.path, source, 'utf8')
  return { dir, target }
}

function backups(dir: string): string[] {
  return readdirSync(dir).filter((name) => name.includes('.bak-'))
}

test('MCP install preserves JSONC and is idempotent', () => {
  const { dir, target } = fixture(`{
  // keep this client setting
  "theme": "dark",
  "mcpServers": {
    "other": { "command": "other-command" },
  },
}\n`)

  const installed = installMcpConfig(target)
  const firstSource = readFileSync(target.path, 'utf8')
  const config = parse(firstSource) as Record<string, unknown>
  const servers = config.mcpServers as Record<string, Record<string, unknown>>

  assert.equal(installed.changed, true)
  assert.match(firstSource, /keep this client setting/)
  assert.equal(config.theme, 'dark')
  assert.equal(servers.other?.command, 'other-command')
  assert.deepEqual(servers.seo?.args, ['-y', 'seo', 'mcp', 'serve'])
  assert.equal(backups(dir).length, 1)

  const repeated = installMcpConfig(target)

  assert.equal(repeated.changed, false)
  assert.equal(readFileSync(target.path, 'utf8'), firstSource)
  assert.equal(backups(dir).length, 1)
})

test('MCP install migrates the managed legacy package config', () => {
  const { target } = fixture(`{
  "mcpServers": {
    "seo": {
      "command": "npx",
      "args": ["-y", "@seo/cli", "mcp", "serve"]
    }
  }
}\n`)

  const installed = installMcpConfig(target)
  const config = parse(readFileSync(target.path, 'utf8')) as {
    mcpServers: { seo: { args: string[] } }
  }

  assert.equal(installed.changed, true)
  assert.deepEqual(config.mcpServers.seo.args, ['-y', 'seo', 'mcp', 'serve'])
})

test('MCP install refuses malformed and unmanaged config', () => {
  const malformed = fixture('{ "mcpServers": {')
  const malformedBefore = readFileSync(malformed.target.path, 'utf8')

  assert.throws(() => installMcpConfig(malformed.target), /invalid JSONC/)
  assert.equal(readFileSync(malformed.target.path, 'utf8'), malformedBefore)
  assert.equal(backups(malformed.dir).length, 0)

  const unmanaged = fixture(`{
  "mcpServers": {
    "seo": { "command": "custom-seo-server", "args": [] }
  }
}\n`)
  const unmanagedBefore = readFileSync(unmanaged.target.path, 'utf8')

  assert.throws(() => installMcpConfig(unmanaged.target), /unmanaged/)
  assert.equal(readFileSync(unmanaged.target.path, 'utf8'), unmanagedBefore)
  assert.equal(backups(unmanaged.dir).length, 0)
})

test('MCP uninstall removes only a managed entry and is idempotent', () => {
  const { dir, target } = fixture(`{
  // preserve comments and other servers
  "mcpServers": {
    "other": { "command": "other-command" },
    "seo": {
      "command": "npx",
      "args": ["-y", "seo", "mcp", "serve"]
    }
  }
}\n`)

  const removed = uninstallMcpConfig(target)
  const firstSource = readFileSync(target.path, 'utf8')
  const config = parse(firstSource) as {
    mcpServers: Record<string, unknown>
  }

  assert.equal(removed.changed, true)
  assert.match(firstSource, /preserve comments and other servers/)
  assert.equal(config.mcpServers.seo, undefined)
  assert.ok(config.mcpServers.other)
  assert.equal(backups(dir).length, 1)

  const repeated = uninstallMcpConfig(target)

  assert.equal(repeated.changed, false)
  assert.equal(readFileSync(target.path, 'utf8'), firstSource)
  assert.equal(backups(dir).length, 1)
})

test('MCP install creates private config files', () => {
  const { target } = fixture()

  installMcpConfig(target)

  if (process.platform !== 'win32') {
    assert.equal(statSync(target.path).mode & 0o777, 0o600)
  }
})

test('MCP targets use the documented Windows Claude Desktop path', () => {
  const windows = mcpClientTargets({
    home: 'C:\\Users\\seo',
    platform: 'win32',
    env: { APPDATA: 'C:\\Users\\seo\\AppData\\Roaming' },
  })
  const desktop = windows.find((target) => target.client === 'claude-desktop')
  assert.equal(
    desktop?.path,
    'C:\\Users\\seo\\AppData\\Roaming\\Claude\\claude_desktop_config.json',
  )

  const linux = mcpClientTargets({
    home: '/home/seo',
    platform: 'linux',
    env: {},
  })
  assert.equal(
    linux.some((target) => target.client === 'claude-desktop'),
    false,
  )
})

test('Claude Code config matches its native stdio schema', () => {
  const target = mcpClientTargets({
    home: '/tmp/seo-home',
    platform: 'linux',
    env: {},
  }).find((entry) => entry.client === 'claude-code')
  assert.ok(target)
  assert.equal(target.kind, 'json')
  if (target.kind !== 'json') return

  const { target: fixtureTarget } = fixture()
  installMcpConfig({ ...fixtureTarget, includeType: target.includeType })
  const config = parse(readFileSync(fixtureTarget.path, 'utf8')) as {
    mcpServers: { seo: Record<string, unknown> }
  }
  assert.equal(config.mcpServers.seo.type, 'stdio')
})

test('MCP detection returns only clients present on the machine', () => {
  const targets = mcpClientTargets({
    home: '/tmp/seo-home',
    platform: 'linux',
    env: {},
  })
  const detected = detectMcpClients({
    targets,
    hasPath: (path) => path.includes('.cursor'),
    hasCommand: (command) => command === 'codex',
  })

  assert.deepEqual(
    detected.map((target) => target.client),
    ['codex', 'cursor'],
  )
})

test('Codex MCP install uses the native CLI and stays idempotent', () => {
  const target = mcpClientTargets({
    home: '/tmp/seo-home',
    platform: 'linux',
    env: {},
  }).find((entry) => entry.client === 'codex')
  assert.ok(target)

  let installed = false
  const calls: string[][] = []
  const runCommand = (_command: string, args: string[]) => {
    calls.push(args)
    if (args[1] === 'get') {
      return installed
        ? {
            status: 0,
            stdout: 'seo\n  command: npx\n  args: -y seo mcp serve\n',
            stderr: '',
          }
        : { status: 1, stdout: '', stderr: 'not found' }
    }
    if (args[1] === 'add') installed = true
    if (args[1] === 'remove') installed = false
    return { status: 0, stdout: '', stderr: '' }
  }

  assert.equal(installMcpConfig(target, { runCommand }).changed, true)
  assert.equal(installMcpConfig(target, { runCommand }).changed, false)
  assert.equal(uninstallMcpConfig(target, { runCommand }).changed, true)
  assert.equal(uninstallMcpConfig(target, { runCommand }).changed, false)
  assert.ok(calls.some((args) => args.join(' ').includes('mcp add seo --env')))
  assert.ok(calls.some((args) => args.join(' ') === 'mcp remove seo'))
})
