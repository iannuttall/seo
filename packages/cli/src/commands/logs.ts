import { pruneLogs } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag } from '../args.js'
import { formatBytes, printJson } from '../utils.js'

export const logsCommand = defineCommand({
  meta: { name: 'logs', description: 'Manage local log retention' },
  subCommands: {
    prune: defineCommand({
      meta: {
        name: 'prune',
        description: 'Rotate large logs and remove old local logs',
      },
      args: {
        quiet: {
          type: 'boolean',
          default: false,
          description: 'Do not print a result.',
        },
        json: {
          type: 'boolean',
          default: false,
          description: 'Print machine-readable JSON.',
        },
      },
      run: async ({ args }) => {
        const result = pruneLogs()
        if (jsonFlag(args)) {
          printJson(result)
          return
        }
        if (!args.quiet) {
          process.stdout.write(
            `Rotated ${result.rotated} and removed ${result.removed} log files. ${formatBytes(result.sizeBytes)} retained.\n`,
          )
        }
      },
    }),
  },
})
