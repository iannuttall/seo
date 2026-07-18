import type { ReportNarrative } from '../analyze/reports/types.js'

export type ReportHtmlView = 'client' | 'analyst'

export type ReportHtmlSection = {
  title: string
  summary?: string
  items: string[]
}

export type ReportHtmlInput = {
  report: ReportNarrative
  title?: string
  view?: ReportHtmlView
  additionalSections?: ReportHtmlSection[]
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function safeHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function siteMarkup(site: string): string {
  const safeUrl = safeHttpUrl(site)
  const label = escapeHtml(site)
  return safeUrl
    ? `<a href="${escapeHtml(safeUrl)}" rel="noreferrer">${label}</a>`
    : label
}

function list(items: string[]): string {
  if (items.length === 0) return '<p class="empty">No items to report.</p>'
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
}

function reportSections(report: ReportNarrative): string {
  return report.sections
    .map(
      (section) => `<section class="panel">
        <h2>${escapeHtml(section.title)}</h2>
        ${list(section.bullets)}
      </section>`,
    )
    .join('')
}

function additionalSections(sections: ReportHtmlSection[]): string {
  return sections
    .map(
      (section) => `<section class="panel">
        <h2>${escapeHtml(section.title)}</h2>
        ${section.summary ? `<p>${escapeHtml(section.summary)}</p>` : ''}
        ${list(section.items)}
      </section>`,
    )
    .join('')
}

function priorities(report: ReportNarrative): string {
  if (report.priorities.length === 0) {
    return '<p class="empty">No evidence-backed priorities were found.</p>'
  }
  return `<ol class="priorities">${report.priorities
    .map(
      (priority) => `<li>
        <div class="priority-heading">
          <strong>${escapeHtml(priority.title)}</strong>
          <span class="confidence">${escapeHtml(priority.confidence)} confidence</span>
        </div>
        <p>${escapeHtml(priority.action)}</p>
      </li>`,
    )
    .join('')}</ol>`
}

function analystEvidence(report: ReportNarrative): string {
  const skipped = report.diagnosis.skippedSections ?? []
  const attempts = report.changeMeasurementAttempts
  return `<section class="panel analyst-only">
    <h2>Evidence coverage</h2>
    <dl class="facts">
      <div><dt>Data status</dt><dd>${escapeHtml(report.dataStatus)}</dd></div>
      <div><dt>Generated</dt><dd>${escapeHtml(report.generatedAt)}</dd></div>
      <div><dt>Saved changes checked</dt><dd>${attempts.length}</dd></div>
      <div><dt>Unavailable sections</dt><dd>${skipped.length}</dd></div>
    </dl>
    ${
      skipped.length
        ? `<h3>Unavailable sections</h3>${list(
            skipped.map((section) =>
              'reason' in section && typeof section.reason === 'string'
                ? `${section.section}: ${section.reason}`
                : section.section,
            ),
          )}`
        : ''
    }
  </section>`
}

const styles = `
  :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17211b; background: #f2f4ef; }
  * { box-sizing: border-box; }
  body { margin: 0; line-height: 1.55; }
  a { color: inherit; text-decoration-color: #ff5b35; text-underline-offset: 0.18em; }
  main { width: min(980px, calc(100% - 32px)); margin: 32px auto 64px; }
  header { padding: clamp(28px, 6vw, 64px); color: #f9fbf7; background: #17211b; border-radius: 20px; }
  .eyebrow { margin: 0 0 12px; color: #ff7958; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
  h1 { max-width: 760px; margin: 0; font-size: clamp(2rem, 5vw, 4rem); line-height: 1.02; letter-spacing: -0.04em; }
  header .headline { max-width: 760px; margin: 24px 0 0; font-size: clamp(1.05rem, 2vw, 1.3rem); color: #d9e1d9; }
  .meta { display: flex; flex-wrap: wrap; gap: 10px 22px; margin-top: 28px; color: #b9c5ba; font-size: 0.9rem; }
  .status { display: inline-flex; width: fit-content; margin-top: 22px; padding: 6px 10px; border: 1px solid #4f6153; border-radius: 999px; font-size: 0.8rem; font-weight: 700; text-transform: capitalize; }
  .panel { margin-top: 20px; padding: clamp(22px, 4vw, 38px); background: #fff; border: 1px solid #dfe4dc; border-radius: 16px; box-shadow: 0 8px 30px rgba(23, 33, 27, 0.05); }
  h2 { margin: 0 0 16px; font-size: clamp(1.25rem, 3vw, 1.65rem); letter-spacing: -0.02em; }
  h3 { margin: 26px 0 10px; font-size: 1rem; }
  p { margin: 0 0 14px; }
  ul, ol { margin: 0; padding-left: 1.25rem; }
  li + li { margin-top: 10px; }
  .priorities { list-style: none; padding: 0; counter-reset: priority; }
  .priorities > li { counter-increment: priority; padding: 18px 0 18px 52px; position: relative; border-top: 1px solid #e6eae4; }
  .priorities > li:first-child { border-top: 0; padding-top: 4px; }
  .priorities > li::before { content: counter(priority); position: absolute; left: 0; top: 16px; display: grid; width: 34px; height: 34px; place-items: center; border-radius: 50%; color: #17211b; background: #ff7958; font-weight: 800; }
  .priorities > li:first-child::before { top: 2px; }
  .priority-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 20px; }
  .confidence { color: #647067; font-size: 0.82rem; text-transform: capitalize; }
  .priorities p { margin: 8px 0 0; color: #3e4941; }
  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 0; }
  .facts div { padding: 14px; background: #f5f7f3; border-radius: 10px; }
  dt { color: #647067; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; }
  dd { margin: 4px 0 0; font-weight: 700; }
  details summary { cursor: pointer; font-weight: 750; }
  details ul { margin-top: 14px; }
  .empty { color: #647067; font-style: italic; }
  footer { margin-top: 26px; color: #647067; font-size: 0.8rem; text-align: center; }
  @media print { :root { background: #fff; } main { width: 100%; margin: 0; } header, .panel { break-inside: avoid; box-shadow: none; } header { border-radius: 0; } }
`

export function renderReportHtml(input: ReportHtmlInput): string {
  const report = input.report
  const view = input.view ?? 'client'
  const title = input.title ?? 'SEO report'
  const evidenceNotesOpen = report.dataStatus !== 'complete' ? ' open' : ''
  const analyst = view === 'analyst' ? analystEvidence(report) : ''

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(title)}: ${escapeHtml(report.site)}</title>
  <style>${styles}</style>
</head>
<body>
  <main>
    <header>
      <p class="eyebrow">${escapeHtml(title)}</p>
      <h1>${siteMarkup(report.site)}</h1>
      <p class="headline">${escapeHtml(report.headline)}</p>
      <div class="meta">
        <span>${escapeHtml(report.period.startDate)} to ${escapeHtml(report.period.endDate)}</span>
        <span>Generated ${escapeHtml(report.generatedAt.slice(0, 10))}</span>
        <span>${escapeHtml(view)} view</span>
      </div>
      <span class="status">${escapeHtml(report.dataStatus)} data</span>
    </header>

    <section class="panel">
      <h2>Priorities</h2>
      ${priorities(report)}
    </section>

    ${reportSections(report)}
    ${additionalSections(input.additionalSections ?? [])}
    ${analyst}

    <section class="panel">
      <details${evidenceNotesOpen}>
        <summary>Evidence notes and limitations</summary>
        ${list(report.caveats)}
      </details>
    </section>

    <footer>Generated locally from observed report evidence.</footer>
  </main>
</body>
</html>`
}
