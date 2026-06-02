import {
  ga4PropertyIdFromName,
  listGa4AccountSummaries,
  readConfig,
  writeConfig,
} from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, stringArg } from '../args.js'
import { printJson, printTable } from '../utils.js'

export const ga4PropertiesCommand = defineCommand({
  meta: {
    name: 'ga4-properties',
    description: 'List GA4 accounts and properties available to Google OAuth',
  },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
    save: {
      type: 'string',
      description: 'Save this numeric GA4 property ID as the default.',
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
      config.google.defaultGa4PropertyId = save
      writeConfig(config)
    }

    if (jsonFlag(args)) {
      printJson({ accountSummaries: summaries, properties: rows, saved: save })
      return
    }
    if (save) {
      process.stdout.write(`Saved default GA4 property ${save}.\n`)
    }
    printTable(
      ['Property', 'Name', 'Account'],
      rows.map((row) => [row.property, row.displayName, row.account]),
    )
  },
})
