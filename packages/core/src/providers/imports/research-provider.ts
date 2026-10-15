import type { ProviderImportEvidence, ProviderWarning } from '../contracts.js'
import type { ResearchImportSource } from '../domain-contracts.js'
import {
  compareImportedResearchRows,
  type ImportedResearchRow,
  importedResearchRowKey,
  importResearchRows,
} from './research-rows.js'

export type CombinedResearchRows = {
  rows: ImportedResearchRow[]
  imports: ProviderImportEvidence[]
  warnings: ProviderWarning[]
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareSources(
  left: ResearchImportSource,
  right: ResearchImportSource,
): number {
  return (
    compareText(left.file, right.file) ||
    compareText(left.exportedAt, right.exportedAt) ||
    compareText(left.format ?? '', right.format ?? '') ||
    (left.rowLimit ?? 0) - (right.rowLimit ?? 0)
  )
}

export async function combineResearchRows(
  sources: readonly ResearchImportSource[],
  now = new Date(),
): Promise<CombinedResearchRows> {
  const ordered = [...sources].sort(compareSources)
  const rowsByKey = new Map<string, ImportedResearchRow>()
  const imports: ProviderImportEvidence[] = []
  const warnings: ProviderWarning[] = []
  let crossFileDuplicates = 0
  for (const source of ordered) {
    const imported = await importResearchRows(source, now)
    imports.push(imported.importEvidence)
    warnings.push(...imported.warnings)
    for (const row of imported.rows) {
      const key = importedResearchRowKey(row)
      const existing = rowsByKey.get(key)
      if (!existing) {
        rowsByKey.set(key, row)
      } else {
        crossFileDuplicates += 1
        if (compareImportedResearchRows(row, existing) < 0) {
          rowsByKey.set(key, row)
        }
      }
    }
  }
  if (crossFileDuplicates > 0) {
    warnings.push({
      code: 'cross-file-duplicate-rows',
      message: `${crossFileDuplicates} duplicate row${crossFileDuplicates === 1 ? '' : 's'} across research files were removed deterministically.`,
    })
  }
  if (new Set(imports.map((item) => item.exportedAt)).size > 1) {
    warnings.push({
      code: 'mixed-export-times',
      message:
        'The research files were exported at different times. Compare each imports entry before interpreting differences between domains.',
    })
  }
  return {
    rows: [...rowsByKey.values()].sort(compareImportedResearchRows),
    imports,
    warnings,
  }
}
