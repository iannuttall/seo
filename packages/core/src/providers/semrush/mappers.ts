import type { KeywordOverview, KeywordRow } from '../../types.js'

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
    volume: Number(record.Nq ?? 0) || undefined,
    cpc: Number(record.Cp ?? 0) || undefined,
    competition: Number(record.Co ?? 0) || undefined,
    difficulty: Number(record.Kd ?? 0) || undefined,
    results: Number(record.Nr ?? 0) || undefined,
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
      volume: Number(record.Nq ?? 0) || undefined,
      difficulty: Number(record.Kd ?? 0) || undefined,
      cpc: Number(record.Cp ?? 0) || undefined,
      competition: Number(record.Co ?? 0) || undefined,
      url: record.Ur,
      domain: record.Dn,
      position: Number(record.Po ?? 0) || undefined,
    }
  })
}
