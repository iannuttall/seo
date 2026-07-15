import {
  ga4PropertyIdFromName,
  listGa4AccountSummaries,
  readConfig,
  writeConfig,
} from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, stringArg } from '../../../args.js'
import { printJson, printTable } from '../../../utils.js'

export const googleAnalyticsPropertiesCommand = defineCommand({
  meta: {
    name: 'properties',
    description: 'List Google Analytics accounts and properties',
  },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
    save: {
      type: 'string',
      description:
        'Save this numeric Google Analytics property ID as the default.',
    },
  },
  run: async ({ args }) => {
    const summaries = await listGa4AccountSummaries()
    const rows = summaries.flatMap((account) =>
      account.propertySummaries.map((property) => ({
        account: account.displayName ?? account.account,
        property: ga4PropertyIdFromName(property.property),
        displayName: property.displayName ?? property.property,
      })),
    )

    const save = stringArg(args.save)
    if (save) {
      const config = readConfig()
      config.analytics.google.defaultPropertyId = save
      writeConfig(config)
    }

    if (jsonFlag(args)) {
      printJson({ accountSummaries: summaries, properties: rows, saved: save })
      return
    }
    if (save) {
      process.stdout.write(`Saved default Google Analytics property ${save}.\n`)
    }
    printTable(
      ['Property', 'Name', 'Account'],
      rows.map((row) => [row.property, row.displayName, row.account]),
    )
  },
})
