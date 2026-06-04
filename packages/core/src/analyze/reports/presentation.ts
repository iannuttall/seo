import type { Presentation } from '../../presentation.js'
import type { ReportNarrative } from './types.js'

export function reportPresentation(report: ReportNarrative): Presentation {
  return {
    tables: [
      {
        id: 'report_caveats',
        title: 'Report Caveats',
        columns: [{ key: 'caveat', label: 'Caveat' }],
        rows: report.caveats.map((caveat) => ({ caveat })),
      },
      {
        id: 'report_sections',
        title: 'Report Sections',
        columns: [
          { key: 'section', label: 'Section' },
          { key: 'finding', label: 'Finding' },
        ],
        rows: report.sections.flatMap((section) =>
          section.bullets.map((finding) => ({
            section: section.title,
            finding,
          })),
        ),
      },
      {
        id: 'report_priorities',
        title: 'Report Priorities',
        columns: [
          { key: 'priority', label: 'Priority', type: 'number' },
          { key: 'title', label: 'Title' },
          { key: 'confidence', label: 'Confidence' },
          { key: 'action', label: 'Action' },
        ],
        rows: report.priorities.map((priority, index) => ({
          priority: index + 1,
          title: priority.title,
          confidence: priority.confidence,
          action: priority.action,
        })),
      },
    ],
    charts: [],
  }
}
