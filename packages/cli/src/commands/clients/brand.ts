import { detectBrandTerms, getClient, saveClient } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  jsonFlag,
  numberArg,
  projectArg,
  stringArg,
} from '../../args.js'
import { resolveSite } from '../../selection.js'
import { printJson, printKeyValue, printTable } from '../../utils.js'

export const clientBrandCommand = defineCommand({
  meta: {
    name: 'brand',
    description: 'Detect and manage project brand query terms',
  },
  subCommands: {
    detect: defineCommand({
      meta: {
        name: 'detect',
        description:
          'Suggest branded query terms from GSC navigational queries',
      },
      args: {
        client: {
          type: 'string',
          description: 'Legacy alias for --project.',
        },
        project: {
          type: 'string',
          description: 'Saved project id or name. Defaults to default.',
        },
        site: {
          type: 'string',
          description: 'GSC property URL, for example sc-domain:example.com.',
        },
        days: {
          type: 'string',
          description: 'Detection window length in days. Defaults to 28.',
        },
        limit: {
          type: 'string',
          description: 'Maximum candidate terms. Defaults to 10.',
        },
        'min-impressions': {
          type: 'string',
          description: 'Minimum query impressions. Defaults to 10.',
        },
        save: {
          type: 'boolean',
          default: false,
          description: 'Save suggested terms to the selected project.',
        },
        json: {
          type: 'boolean',
          default: false,
          description: 'Print machine-readable JSON.',
        },
        refresh: {
          type: 'boolean',
          default: false,
          description: 'Bypass local GSC cache.',
        },
      },
      run: async ({ args }) => {
        const json = jsonFlag(args)
        const client = getClient(projectArg(args))
        const siteUrl = await resolveSite({
          site: stringArg(args.site) ?? client?.siteUrl,
          options: { json, refresh: booleanArg(args.refresh) },
        })
        const detection = await detectBrandTerms({
          site: siteUrl,
          id: client?.id,
          name: client?.name,
          days: numberArg(args.days),
          limit: numberArg(args.limit),
          minImpressions: numberArg(args['min-impressions']),
          refresh: booleanArg(args.refresh),
        })
        const saved =
          booleanArg(args.save) && client
            ? saveClient({
                id: client.id,
                name: client.name,
                siteUrl: client.siteUrl,
                startUrl: client.startUrl,
                watchUrls: client.watchUrls,
                ga4PropertyId: client.ga4PropertyId,
                brandTerms: detection.suggestedTerms,
                reportDay: client.reportDay,
                technicalWeekday: client.technicalWeekday,
                isDefault: client.isDefault,
              })
            : undefined

        if (booleanArg(args.save) && !client) {
          throw new Error('Pass --project to save detected brand terms.')
        }
        if (json) {
          printJson({ ...detection, saved })
          return
        }

        printKeyValue([
          ['Property', detection.site],
          ['Derived terms', detection.derivedTerms.join(', ')],
          ['Suggested terms', detection.suggestedTerms.join(', ')],
          ['Saved', saved ? saved.id : 'no'],
        ])
        printTable(
          ['Term', 'Score', 'Evidence'],
          detection.candidates.map((candidate) => [
            candidate.term,
            candidate.score,
            candidate.evidence
              .map(
                (item) => `${item.query} (${Math.round(item.clicks)} clicks)`,
              )
              .join(', '),
          ]),
        )
      },
    }),
  },
})
