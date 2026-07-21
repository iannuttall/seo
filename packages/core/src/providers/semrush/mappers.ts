import type { KeywordOverview, KeywordRow } from '../../types.js'

function optionalFiniteNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function mapOverview(rows: string[][]): KeywordOverview {
  const [header, first] = rows
  if (!header || !first) {
    return { phrase: '' }
  }

  const record = Object.fromEntries(
    header.map((key, index) => [key, first[index]]),
  )
  return {
    phrase: record.Ph ?? '',
    volume: optionalFiniteNumber(record.Nq),
    cpc: optionalFiniteNumber(record.Cp),
    competition: optionalFiniteNumber(record.Co),
    difficulty: optionalFiniteNumber(record.Kd),
    results: optionalFiniteNumber(record.Nr),
  }
}

export function mapKeywordRows(rows: string[][]): KeywordRow[] {
  const [header, ...body] = rows
  if (!header) {
    return []
  }

  return body.map((row) => {
    const record = Object.fromEntries(
      header.map((key, index) => [key, row[index]]),
    )
    return {
      phrase: record.Ph ?? '',
      volume: optionalFiniteNumber(record.Nq),
      difficulty: optionalFiniteNumber(record.Kd),
      cpc: optionalFiniteNumber(record.Cp),
      competition: optionalFiniteNumber(record.Co),
      url: record.Ur,
      domain: record.Dn,
      position: optionalFiniteNumber(record.Po),
    }
  })
}
