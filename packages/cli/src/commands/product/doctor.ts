import { runDoctor } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag } from '../../args.js'
import { checkSummary } from '../../presentation/views.js'
import { printChecks, printHeading, printJson } from '../../utils.js'

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
      if (!report.ok) process.exitCode = 1
      return
    }
    printHeading('SEO doctor', checkSummary(report.checks))
    process.stdout.write('\n')
    printChecks(report.checks)
    process.stdout.write(`\nChecked ${report.generatedAt}\n`)
    if (!report.ok) process.exitCode = 1
  },
})
