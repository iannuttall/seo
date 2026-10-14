import { runReport, SECTION_IDS, SECTIONS } from '@seo/core/commands'
import { z } from 'zod'
import { resolveProperty } from '../google.ts'
import { deps } from './deps.ts'
import { DateWindow, Detail, defineTool, Site } from './registry.ts'

export const seoReport = defineTool({
  name: 'seo_report',
  title: 'Search Console report',
  description: `The main report for a Search Console property. Without a section it returns the overview plus each section's row count and top rows. With a section it returns that section's rows; page sections also check their top 20 URLs live. Sections:\n${Object.entries(
    SECTIONS,
  )
    .map(([id, text]) => `- ${id}: ${text}`)
    .join('\n')}`,
  input: z.object({
    site: Site,
    section: z
      .enum(SECTION_IDS)
      .optional()
      .describe('Optional. Leave it out first; then ask for one section.'),
    ...DateWindow,
    ...Detail,
  }),
  async run(context, input) {
    const site = await resolveProperty(context.google, input.site)
    const result = await runReport(
      {
        site,
        section: input.section,
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
