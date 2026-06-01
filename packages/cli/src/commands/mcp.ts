import { multiselect } from '@clack/prompts'
import { defineCommand } from 'citty'
import { maybeExitCancelled } from '../utils.js'
import {
  detectMcpClients,
  installMcpConfig,
  uninstallMcpConfig,
} from './mcp-config.js'

const booleanArg = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined

export const mcpCommand = defineCommand({
  meta: { name: 'mcp', description: 'MCP server helpers' },
  subCommands: {
    serve: defineCommand({
      args: {
        test: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const { startMcpServer } = await import('@seo/mcp')
        await startMcpServer({ test: booleanArg(args.test) })
      },
    }),
    install: defineCommand({
      args: {
        uninstall: { type: 'boolean', default: false },
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
