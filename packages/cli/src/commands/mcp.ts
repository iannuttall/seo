import { multiselect } from '@clack/prompts'
import { defineCommand } from 'citty'
import { booleanArg } from '../args.js'
import { maybeExitCancelled } from '../utils.js'
import {
  detectMcpClients,
  installMcpConfig,
  uninstallMcpConfig,
} from './mcp-config.js'

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
      },
      run: async ({ args }) => {
        const detected = detectMcpClients()
        const selected = maybeExitCancelled(
          await multiselect({
            message: args.uninstall
              ? 'Remove seo from which MCP clients?'
              : 'Install seo into which MCP clients?',
            options: detected.map((target) => ({
              value: target.client,
              label: target.client,
              hint: target.path,
            })),
            initialValues: detected.map((target) => target.client),
            required: true,
          }),
        )

        for (const target of detected.filter((entry) =>
          selected.includes(entry.client),
        )) {
          const result = args.uninstall
            ? uninstallMcpConfig(target)
            : installMcpConfig(target)
          process.stdout.write(
            `${result.changed ? 'updated' : 'skipped'} ${result.client} · ${result.path}\n`,
          )
        }
      },
    }),
  },
})
