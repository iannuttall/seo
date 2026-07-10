import { multiselect } from '@clack/prompts'
import { SeoError } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag } from '../args.js'
import { canPrompt, maybeExitCancelled, printJson } from '../utils.js'
import {
  detectMcpClients,
  installMcpConfig,
  type SupportedClient,
  uninstallMcpConfig,
} from './mcp-config.js'

const targetFlags: Array<{
  client: SupportedClient
  flag: 'claude-desktop' | 'cursor' | 'claude-code'
  label: string
}> = [
  {
    client: 'claude-desktop',
    flag: 'claude-desktop',
    label: 'Claude Desktop',
  },
  { client: 'cursor', flag: 'cursor', label: 'Cursor' },
  { client: 'claude-code', flag: 'claude-code', label: 'Claude Code' },
]

function selectedClients(args: Record<string, unknown>): SupportedClient[] {
  if (booleanArg(args.all)) return targetFlags.map(({ client }) => client)
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
        'claude-desktop': {
          type: 'boolean',
          default: false,
          description: 'Update Claude Desktop',
        },
        cursor: {
          type: 'boolean',
          default: false,
          description: 'Update Cursor',
        },
        'claude-code': {
          type: 'boolean',
          default: false,
          description: 'Update Claude Code',
        },
        all: {
          type: 'boolean',
          default: false,
          description: 'Update every supported MCP client',
        },
        json: {
          type: 'boolean',
          default: false,
          description: 'Print structured JSON output',
        },
      },
      run: async ({ args }) => {
        const detected = detectMcpClients()
        const json = jsonFlag(args)
        let selected = selectedClients(args)

        if (selected.length === 0) {
          if (!canPrompt({ json })) {
            throw new SeoError(
              'INVALID_INPUT',
              'Choose an MCP client with --claude-desktop, --cursor, --claude-code, or --all.',
            )
          }
          selected = maybeExitCancelled(
            await multiselect({
              message: args.uninstall
                ? 'Remove seo from which MCP clients?'
                : 'Install seo into which MCP clients?',
              options: detected.map((target) => ({
                value: target.client,
                label:
                  targetFlags.find(({ client }) => client === target.client)
                    ?.label ?? target.client,
                hint: target.path,
              })),
              initialValues: detected.map((target) => target.client),
              required: true,
            }),
          )
        }

        const results = detected
          .filter((entry) => selected.includes(entry.client))
          .map((target) =>
            booleanArg(args.uninstall)
              ? uninstallMcpConfig(target)
              : installMcpConfig(target),
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
