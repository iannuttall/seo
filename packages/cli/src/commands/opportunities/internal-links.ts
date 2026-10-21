import {
  internalLinksReport,
  localInternalLinksDependencies,
  SeoError,
} from '@seo/core'
import { internalLinksText } from '@seo/core/commands'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, numberArg, stringArg } from '../../args.js'
import { createProgressReporter } from '../../progress.js'
import { printJson } from '../../utils.js'
import { cliCall, dates, detail, detailArg } from '../core-commands.js'

// `seo internal-links --site <site>` audits a whole site; `--url <page>`
// finds links to one page. Both crawl the site from this machine.

export const internalLinksCommand = defineCommand({
  meta: {
    name: 'internal-links',
    description:
      'Internal links to add across a site (--site) or to one page (--url), placed in real sentences',
  },
  args: {
    site: {
      type: 'string',
      description: 'Site to audit: a domain, URL or Search Console property.',
    },
    url: {
      type: 'string',
      description: 'One page to find internal links to.',
    },
    'max-pages': {
      type: 'string',
      description:
        'Site audits only: pages to crawl, 500 by default, up to 5,000.',
    },
    ...dates,
    ...detail,
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass the local cache and fetch fresh data.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const refresh = booleanArg(args.refresh)
    const url = stringArg(args.url)
    const site = stringArg(args.site)
    if (Boolean(url) === Boolean(site)) {
      throw new SeoError(
        'INVALID_INPUT',
        'Send --site to audit a whole site, or --url to find links to one page.',
      )
    }
    const maxPagesArg = stringArg(args['max-pages'])
    const maxPages =
      maxPagesArg === undefined ? undefined : numberArg(maxPagesArg)
    if (maxPagesArg !== undefined && maxPages === undefined) {
      throw new SeoError('INVALID_INPUT', '--max-pages is a whole number.')
    }
    const target = (url ?? site) as string
    const report = await internalLinksReport(
      {
        site: target,
        targetUrl: url,
        maxPages,
        startDate: stringArg(args['start-date']),
        endDate: stringArg(args['end-date']),
        refresh,
      },
      {
        ...(await localInternalLinksDependencies({ site: target, refresh })),
        progress: createProgressReporter(!json && process.stderr.isTTY),
      },
    )
    if (json) {
      printJson(report)
      return
    }
    const base = {
      ...(url ? { url } : { site }),
      ...(maxPages !== undefined ? { 'max-pages': maxPages } : {}),
    }
    process.stdout.write(
      `${internalLinksText(report, {
        detail: detailArg(args),
        offset: numberArg(args.offset) ?? 0,
        more: (view, offset) =>
          cliCall('internal-links', { ...base, detail: view, offset }),
      })}\n`,
    )
  },
})
