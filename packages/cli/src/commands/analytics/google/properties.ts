import { ga4PropertyIdFromName, listGa4AccountSummaries } from '@seo/core'
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
    account: {
      type: 'string',
      description: 'Saved Google account email.',
    },
  },
  run: async ({ args }) => {
    const summaries = await listGa4AccountSummaries(stringArg(args.account))
    const rows = summaries.flatMap((account) =>
      account.propertySummaries.map((property) => ({
        account: account.displayName ?? account.account,
        property: ga4PropertyIdFromName(property.property),
        displayName: property.displayName ?? property.property,
      })),
    )

    if (jsonFlag(args)) {
      printJson({ accountSummaries: summaries, properties: rows })
      return
    }
    printTable(
      ['Property', 'Name', 'Account'],
      rows.map((row) => [row.property, row.displayName, row.account]),
    )
  },
})
