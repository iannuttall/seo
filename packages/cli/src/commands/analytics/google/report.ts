import { LOCAL_SIGN_IN, localAccounts } from '@seo/core'
import { analyticsSignIn, runAnalyticsRows } from '@seo/core/commands'
import { defineCommand } from 'citty'
import { numberArg, stringArg } from '../../../args.js'
import { requireGoogleAnalyticsProperty } from '../../../selection.js'
import { dates, detail, detailArg, run } from '../../core-commands.js'

// The same Google Analytics rows as seo_data in the MCP servers.
export const googleAnalyticsReportCommand = defineCommand({
  meta: {
    name: 'report',
    description: 'Google Analytics landing pages for visits from search',
  },
  args: {
    property: {
      type: 'string',
      description:
        'Numeric Google Analytics property ID. Run `seo analytics google properties` to list them.',
    },
    ...dates,
    ...detail,
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const property = requireGoogleAnalyticsProperty(stringArg(args.property))
    await run(args, async () =>
      runAnalyticsRows(
        {
          property,
          startDate: stringArg(args['start-date']),
          endDate: stringArg(args['end-date']),
          detail: detailArg(args),
          offset: numberArg(args.offset),
        },
        await analyticsSignIn(
          await localAccounts(),
          property,
          LOCAL_SIGN_IN.signIn,
        ),
        {
          signIn: LOCAL_SIGN_IN.signIn,
          call: (offset) =>
            `seo analytics google report --property ${property} --detail rows --offset ${offset}`,
        },
      ),
    )
  },
})
