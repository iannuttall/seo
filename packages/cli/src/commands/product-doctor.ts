import { runDoctor } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag } from '../args.js'
import { printJson, printKeyValue, printTable } from '../utils.js'

export const doctorCommand = defineCommand({
  meta: {
    name: 'doctor',
    description: 'Check local auth, scopes, config, and defaults',
  },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const report = await runDoctor()
    if (jsonFlag(args)) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Status', report.ok ? 'ok' : 'needs attention'],
      ['Generated', report.generatedAt],
    ])
    printTable(
      ['Check', 'Status', 'Detail', 'Fix'],
      report.checks.map((check) => [
        check.label,
        check.status,
        check.detail,
        check.fix ?? '',
      ]),
    )
  },
})
