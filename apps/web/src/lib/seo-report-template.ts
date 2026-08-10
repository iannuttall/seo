export const SEO_REPORT_TEMPLATE_LIMITS = {
  text: 160,
  sections: 12,
  outputBytes: 100_000,
} as const

export const SEO_REPORT_AUDIENCES = [
  { value: 'owner', label: 'Site owner or founder' },
  { value: 'marketing', label: 'Marketing team' },
  { value: 'leadership', label: 'Leadership team' },
  { value: 'client', label: 'Client' },
] as const

export const SEO_REPORT_COMPARISONS = [
  { value: 'previous', label: 'Previous period' },
  { value: 'year', label: 'Same period last year' },
  { value: 'both', label: 'Previous period and last year' },
  { value: 'none', label: 'No comparison' },
] as const

export const SEO_REPORT_FORMATS = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'html', label: 'HTML' },
] as const

export const SEO_REPORT_SECTIONS = [
  {
    id: 'summary',
    label: 'Executive summary',
    description: 'The few changes and decisions that matter most.',
    prompts: [
      'What changed during this period?',
      'Which observation matters most to the business?',
      'What needs a decision or action now?',
    ],
  },
  {
    id: 'objectives',
    label: 'Objectives and measurement',
    description: 'The agreed business goal and the evidence used to track it.',
    prompts: [
      'State the agreed objective for this period.',
      'List each KPI with its source and definition.',
      'Record missing, partial, sampled, or delayed evidence.',
    ],
  },
  {
    id: 'search-performance',
    label: 'Search performance',
    description:
      'Search Console clicks, impressions, CTR, and average position.',
    prompts: [
      'Compare complete date ranges with the same number of days.',
      'Separate branded and non-branded queries when the retained rows support it.',
      'Name pages and queries that explain the largest observed changes.',
    ],
  },
  {
    id: 'analytics',
    label: 'Organic visits and outcomes',
    description: 'Google Analytics or another clearly named analytics source.',
    prompts: [
      'Report organic sessions or visits using the source definition.',
      'Show conversions or revenue only when tracking is configured and verified.',
      'Keep attribution limits visible.',
    ],
  },
  {
    id: 'landing-pages',
    label: 'Landing pages',
    description: 'Pages gaining, losing, or converting search demand.',
    prompts: [
      'List the pages with the largest useful changes.',
      'Explain the query, seasonality, release, or technical evidence behind each change.',
      'Do not treat a missing row as zero.',
    ],
  },
  {
    id: 'technical',
    label: 'Technical SEO',
    description:
      'Crawl, indexing, canonical, redirect, and page experience evidence.',
    prompts: [
      'State crawl coverage and the date the site was checked.',
      'Separate intentional controls from confirmed defects.',
      'Give one verification step for every recommended fix.',
    ],
  },
  {
    id: 'content',
    label: 'Content performance',
    description:
      'Published work, decay, overlap, and demand-backed opportunities.',
    prompts: [
      'Connect content changes to observed pages and queries.',
      'Separate completed work from new recommendations.',
      'Avoid traffic or ranking forecasts.',
    ],
  },
  {
    id: 'links',
    label: 'Links and authority research',
    description:
      'New, lost, or useful link evidence when it is relevant to the work.',
    prompts: [
      'Name the provider, date, coverage, and limits.',
      'Highlight links tied to actual outreach or recovery work.',
      'Keep provider estimates separate from first-party evidence.',
    ],
  },
  {
    id: 'ai-search',
    label: 'AI search evidence',
    description:
      'Technical readiness, referrals, mentions, or fixed prompt observations.',
    prompts: [
      'Keep referrals, technical eligibility, and provider-indexed mentions separate.',
      'Record provider, model, market, prompt, settings, and observation time where relevant.',
      'Do not turn a sampled observation into a universal visibility score.',
    ],
  },
  {
    id: 'work',
    label: 'Work completed',
    description:
      'Changes shipped during the reporting period and how they were checked.',
    prompts: [
      'List the page, release, or issue for each completed change.',
      'Record the release date and verification evidence.',
      'Do not claim an outcome before enough comparable data exists.',
    ],
  },
  {
    id: 'actions',
    label: 'Next actions',
    description:
      'A short, prioritised list tied to the evidence in this report.',
    prompts: [
      'Name the evidence that supports each action.',
      'Assign an owner and a clear completion check.',
      'Keep the list small enough to finish before the next report.',
    ],
  },
  {
    id: 'sources',
    label: 'Sources, coverage, and caveats',
    description: 'Dates, providers, limits, missing sections, and definitions.',
    prompts: [
      'List every source and its exact date range.',
      'Record caps, sampling, filters, stale data, and failed sections.',
      'Define any metric whose name can be interpreted more than one way.',
    ],
  },
] as const

export type SeoReportSectionId = (typeof SEO_REPORT_SECTIONS)[number]['id']
export type SeoReportFormat = (typeof SEO_REPORT_FORMATS)[number]['value']

export type SeoReportTemplateInput = {
  siteName: string
  reportTitle: string
  periodStart: string
  periodEnd: string
  audience: string
  comparison: string
  sections: SeoReportSectionId[]
  format: SeoReportFormat
}

export type SeoReportTemplateResult = {
  output: string
  filename: string
  includedSections: number
  capped: boolean
}

function boundedText(value: string, fallback: string): string {
  return value.trim().slice(0, SEO_REPORT_TEMPLATE_LIMITS.text) || fallback
}

function markdownInline(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function html(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function titleFor(input: SeoReportTemplateInput): string {
  return boundedText(
    input.reportTitle,
    `${boundedText(input.siteName, 'Website')} SEO report`,
  )
}

function periodFor(input: SeoReportTemplateInput): string {
  if (input.periodStart && input.periodEnd) {
    return `${input.periodStart} to ${input.periodEnd}`
  }
  return '[Add reporting period]'
}

function labelFor(
  choices: ReadonlyArray<{ value: string; label: string }>,
  value: string,
  fallback: string,
): string {
  return choices.find((choice) => choice.value === value)?.label ?? fallback
}

function selectedSections(ids: SeoReportSectionId[]) {
  const selected = new Set(ids.slice(0, SEO_REPORT_TEMPLATE_LIMITS.sections))
  return SEO_REPORT_SECTIONS.filter((section) => selected.has(section.id))
}

function markdownReport(input: SeoReportTemplateInput): string {
  const title = titleFor(input)
  const site = boundedText(input.siteName, '[Add site or project name]')
  const audience = labelFor(
    SEO_REPORT_AUDIENCES,
    input.audience,
    '[Add audience]',
  )
  const comparison = labelFor(
    SEO_REPORT_COMPARISONS,
    input.comparison,
    'Previous period',
  )
  const lines = [
    `# ${markdownInline(title)}`,
    '',
    `- Site or project: ${markdownInline(site)}`,
    `- Reporting period: ${periodFor(input)}`,
    `- Audience: ${audience}`,
    `- Comparison: ${comparison}`,
    '',
    '> Replace every bracketed prompt with observed evidence. Keep missing, partial, capped, sampled, and unavailable data distinct.',
  ]

  for (const section of selectedSections(input.sections)) {
    lines.push('', `## ${section.label}`, '', section.description, '')
    for (const prompt of section.prompts) lines.push(`- [ ] ${prompt}`)
    lines.push(
      '',
      '| Observation | Source and dates | Interpretation | Action | Verification |',
      '| --- | --- | --- | --- | --- |',
      '| [Add observed evidence] | [Name source, coverage, and status] | [Explain only what the evidence supports] | [Add action or state no action] | [Explain how to check it] |',
    )
  }

  return `${lines.join('\n')}\n`
}

function htmlReport(input: SeoReportTemplateInput): string {
  const audience = labelFor(
    SEO_REPORT_AUDIENCES,
    input.audience,
    '[Add audience]',
  )
  const comparison = labelFor(
    SEO_REPORT_COMPARISONS,
    input.comparison,
    'Previous period',
  )
  const sections = selectedSections(input.sections)
    .map(
      (section) => `  <section>
    <h2>${html(section.label)}</h2>
    <p>${html(section.description)}</p>
    <ul>
${section.prompts.map((prompt) => `      <li>[ ] ${html(prompt)}</li>`).join('\n')}
    </ul>
    <table>
      <thead><tr><th>Observation</th><th>Source and dates</th><th>Interpretation</th><th>Action</th><th>Verification</th></tr></thead>
      <tbody><tr><td>[Add observed evidence]</td><td>[Name source, coverage, and status]</td><td>[Explain only what the evidence supports]</td><td>[Add action or state no action]</td><td>[Explain how to check it]</td></tr></tbody>
    </table>
  </section>`,
    )
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${html(titleFor(input))}</title>
</head>
<body>
  <main>
    <h1>${html(titleFor(input))}</h1>
    <dl>
      <dt>Site or project</dt><dd>${html(boundedText(input.siteName, '[Add site or project name]'))}</dd>
      <dt>Reporting period</dt><dd>${html(periodFor(input))}</dd>
      <dt>Audience</dt><dd>${html(audience)}</dd>
      <dt>Comparison</dt><dd>${html(comparison)}</dd>
    </dl>
    <p><strong>Working rule:</strong> Replace every bracketed prompt with observed evidence. Keep missing, partial, capped, sampled, and unavailable data distinct.</p>
${sections}
  </main>
</body>
</html>
`
}

export function generateSeoReportTemplate(
  input: SeoReportTemplateInput,
): SeoReportTemplateResult {
  const raw =
    input.format === 'html' ? htmlReport(input) : markdownReport(input)
  const output = raw.slice(0, SEO_REPORT_TEMPLATE_LIMITS.outputBytes)
  const safeName = boundedText(input.siteName, 'seo-report')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 60)
  return {
    output,
    filename: `${safeName || 'seo-report'}-template.${input.format === 'html' ? 'html' : 'md'}`,
    includedSections: selectedSections(input.sections).length,
    capped: output.length < raw.length,
  }
}
