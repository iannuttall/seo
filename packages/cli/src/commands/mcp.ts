import { multiselect } from '@clack/prompts'
import { SeoError } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag } from '../args.js'
import { canPrompt, maybeExitCancelled, printJson } from '../utils.js'
import {
  detectMcpClients,
  mcpClientTargets,
  type SupportedClient,
} from './mcp-clients.js'
import { installMcpConfig, uninstallMcpConfig } from './mcp-config.js'

const targetFlags: Array<{
  client: SupportedClient
  flag: 'claude-desktop' | 'claude-code' | 'codex' | 'cursor'
}> = [
  {
    client: 'claude-desktop',
    flag: 'claude-desktop',
  },
  { client: 'claude-code', flag: 'claude-code' },
  { client: 'codex', flag: 'codex' },
  { client: 'cursor', flag: 'cursor' },
]

function selectedClients(
  args: Record<string, unknown>,
  available: SupportedClient[],
): SupportedClient[] {
  if (booleanArg(args.all)) return available
  return targetFlags
    .filter(({ flag }) => booleanArg(args[flag]))
    .map(({ client }) => client)
}

export const mcpCommand = defineCommand({
  meta: { name: 'mcp', description: 'MCP server helpers' },
  subCommands: {
    serve: defineCommand({
      meta: {
        name: 'serve',
        description: 'Run the SEO MCP server',
      },
      args: {
        test: {
          type: 'boolean',
          default: false,
          description: 'Start in test mode',
        },
      },
      run: async ({ args }) => {
        const { startMcpServer } = await import('@seo/mcp')
        await startMcpServer({ test: booleanArg(args.test) })
      },
    }),
    install: defineCommand({
      meta: {
        name: 'install',
        description: 'Install or remove SEO MCP config for local clients',
      },
      args: {
        uninstall: {
          type: 'boolean',
          default: false,
          description: 'Remove the SEO MCP config instead of adding it',
        },
        reinstall: {
          type: 'boolean',
          default: false,
          description: 'Rewrite an existing managed SEO MCP config',
        },
        'claude-desktop': {
          type: 'boolean',
          default: false,
          description: 'Update Claude Desktop',
        },
        'claude-code': {
          type: 'boolean',
          default: false,
          description: 'Update Claude Code',
        },
        codex: {
          type: 'boolean',
          default: false,
          description: 'Update Codex CLI, app, and IDE extension',
        },
        cursor: {
          type: 'boolean',
          default: false,
          description: 'Update Cursor',
        },
        all: {
          type: 'boolean',
          default: false,
          description: 'Update every detected MCP client',
        },
        json: {
          type: 'boolean',
          default: false,
          description: 'Print structured JSON output',
        },
      },
      run: async ({ args }) => {
        if (booleanArg(args.uninstall) && booleanArg(args.reinstall)) {
          throw new SeoError(
            'INVALID_INPUT',
            'Use either --uninstall or --reinstall, not both.',
          )
        }
        const targets = mcpClientTargets()
        const detected = detectMcpClients({ targets })
        const json = jsonFlag(args)
        let selected = selectedClients(
          args,
          detected.map((target) => target.client),
        )

        if (selected.length === 0) {
          if (!canPrompt({ json })) {
            throw new SeoError(
              'INVALID_INPUT',
              'Choose an MCP client with --claude-desktop, --claude-code, --codex, --cursor, or --all.',
            )
          }
          const choices = detected.length > 0 ? detected : targets
          selected = maybeExitCancelled(
            await multiselect({
              message: args.uninstall
                ? 'Remove seo from which MCP clients?'
                : 'Install seo into which MCP clients?',
              options: choices.map((target) => ({
                value: target.client,
                label: target.label,
                hint: target.path,
              })),
              initialValues: detected.map((target) => target.client),
              required: true,
            }),
          )
        }

        const unavailable = selected.filter(
          (client) => !targets.some((target) => target.client === client),
        )
        if (unavailable.length > 0) {
          throw new SeoError(
            'INVALID_INPUT',
            `MCP setup is not supported for ${unavailable.join(', ')} on ${process.platform}.`,
          )
        }

        const results = targets
          .filter((entry) => selected.includes(entry.client))
          .map((target) =>
            booleanArg(args.uninstall)
              ? uninstallMcpConfig(target)
              : installMcpConfig(target, {
                  reinstall: booleanArg(args.reinstall),
                }),
          )

        if (json) {
          printJson({
            operation: booleanArg(args.uninstall) ? 'uninstall' : 'install',
            results,
          })
          return
        }

        for (const result of results) {
          process.stdout.write(
            `${result.changed ? 'updated' : 'skipped'} ${result.client} · ${result.path}\n`,
          )
        }
      },
    }),
  },
})
