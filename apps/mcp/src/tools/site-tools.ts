import {
  LOST_PAGES_RULE,
  runCompare,
  runLostPages,
  runPage,
} from '@seo/core/commands'
import { z } from 'zod'
import { resolveProperty } from '../google.ts'
import { deps } from './deps.ts'
import { DateWindow, Detail, defineTool, Site } from './registry.ts'

export const seoPage = defineTool({
  name: 'seo_page',
  title: 'One page',
  description:
    'Everything for one URL: live page facts (status, redirect, title, description, H1, canonical, robots), Google’s index status from URL Inspection, and the page’s Search Console queries against the previous period.',
  input: z.object({ url: z.url(), ...DateWindow, ...Detail }),
  async run(context, input) {
    const site = await resolveProperty(context.google, input.url)
    const result = await runPage(
      {
        site,
        url: input.url,
        startDate: input.start_date,
        endDate: input.end_date,
        detail: input.detail,
        offset: input.offset,
      },
      deps(context.google),
    )
    return result.text
  },
})

export const seoCompare = defineTool({
  name: 'seo_compare',
  title: 'Before and after a date',
  description:
    'Compares equal periods before and after a date, such as a site change or a Google update: totals, devices, and the pages and queries that moved, with Google updates in the window. Optional pages narrows it to URLs that contain that text, such as /blog/.',
  input: z.object({
    site: Site,
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('YYYY-MM-DD: the first day after the change.'),
    pages: z
      .string()
      .min(1)
      .optional()
      .describe('Optional URL text, such as /blog/.'),
  }),
  async run(context, input) {
    const site = await resolveProperty(context.google, input.site)
    const result = await runCompare(
      { site, date: input.date, pages: input.pages },
      deps(context.google),
    )
    return result.text
  },
})

export const seoIndex = defineTool({
  name: 'seo_index',
  title: 'Pages that lost their clicks',
  description: `${LOST_PAGES_RULE} It shows pages that broke, redirect, block indexing or dropped out of Google.`,
  input: z.object({ site: Site, ...DateWindow }),
  async run(context, input) {
    const site = await resolveProperty(context.google, input.site)
    const result = await runLostPages(
      { site, startDate: input.start_date, endDate: input.end_date },
      deps(context.google),
    )
    return result.text
  },
})
