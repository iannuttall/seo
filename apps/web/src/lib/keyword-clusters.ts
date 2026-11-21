// Keyword clustering by SERP overlap. Two keywords are linked when their
// top results share at least `threshold` of the same pages. Each cluster is
// seeded by the keyword with the most links among the keywords not yet
// grouped (ties: the most shared pages over those links, then the keyword
// in alphabetical order), and takes every ungrouped keyword linked to it.
// Every keyword lands in at most one cluster, and the same keywords give
// the same clusters in any input order.

export type KeywordPages = { keyword: string; pages: readonly string[] }

export type KeywordCluster = {
  lead: string
  // The lead first (sharedWithLead null), then by pages shared with the
  // lead, most first.
  keywords: { keyword: string; sharedWithLead: number | null }[]
  // Pages that rank for two or more keywords in the cluster.
  sharedPages: { page: string; keywords: number }[]
}

export type KeywordClustering = {
  threshold: number
  clusters: KeywordCluster[]
  // Checked keywords that share too few pages with any lead.
  unclustered: string[]
}

// Code-unit order on the lowercased keyword, then the keyword itself, so
// the order never depends on the browser's locale.
export function compareKeywords(a: string, b: string): number {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  if (x !== y) return x < y ? -1 : 1
  if (a !== b) return a < b ? -1 : 1
  return 0
}

export function clusterKeywords(
  input: readonly KeywordPages[],
  threshold: number,
): KeywordClustering {
  const seen = new Set<string>()
  const items = [...input]
    .sort((a, b) => compareKeywords(a.keyword, b.keyword))
    .filter((item) => {
      const key = item.keyword.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((item) => ({
      keyword: item.keyword,
      pages: new Set(item.pages.filter(Boolean)),
    }))
  const shared = (a: Set<string>, b: Set<string>) => {
    let count = 0
    for (const page of a) if (b.has(page)) count += 1
    return count
  }
  // links[i] maps each linked keyword's index to the pages they share.
  const links = items.map(() => new Map<number, number>())
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i]
      const b = items[j]
      if (!a || !b) continue
      const count = shared(a.pages, b.pages)
      if (count >= threshold && count > 0) {
        links[i]?.set(j, count)
        links[j]?.set(i, count)
      }
    }
  }

  const open = new Set(items.map((_, index) => index))
  const clusters: KeywordCluster[] = []
  while (true) {
    let lead = -1
    let bestLinks = 0
    let bestPages = 0
    // items is in alphabetical order, so the first best index wins ties.
    for (const index of open) {
      let count = 0
      let pages = 0
      for (const [other, sharedPages] of links[index] ?? []) {
        if (!open.has(other)) continue
        count += 1
        pages += sharedPages
      }
      if (
        count > bestLinks ||
        (count === bestLinks && count > 0 && pages > bestPages)
      ) {
        lead = index
        bestLinks = count
        bestPages = pages
      }
    }
    if (lead < 0) break
    const members = [...(links[lead] ?? [])]
      .filter(([other]) => open.has(other))
      .map(([other, sharedWithLead]) => ({
        index: other,
        keyword: items[other]?.keyword ?? '',
        sharedWithLead,
      }))
      .sort(
        (a, b) =>
          b.sharedWithLead - a.sharedWithLead ||
          compareKeywords(a.keyword, b.keyword),
      )
    open.delete(lead)
    for (const member of members) open.delete(member.index)
    const group = [lead, ...members.map((member) => member.index)]
    const counts = new Map<string, number>()
    for (const index of group) {
      for (const page of items[index]?.pages ?? []) {
        counts.set(page, (counts.get(page) ?? 0) + 1)
      }
    }
    const leadItem = items[lead]
    clusters.push({
      lead: leadItem?.keyword ?? '',
      keywords: [
        { keyword: leadItem?.keyword ?? '', sharedWithLead: null },
        ...members.map(({ keyword, sharedWithLead }) => ({
          keyword,
          sharedWithLead,
        })),
      ],
      sharedPages: [...counts]
        .filter(([, keywords]) => keywords > 1)
        .map(([page, keywords]) => ({ page, keywords }))
        .sort(
          (a, b) =>
            b.keywords - a.keywords ||
            (a.page < b.page ? -1 : a.page > b.page ? 1 : 0),
        ),
    })
  }
  clusters.sort(
    (a, b) =>
      b.keywords.length - a.keywords.length || compareKeywords(a.lead, b.lead),
  )
  return {
    threshold,
    clusters,
    unclustered: [...open]
      .sort((a, b) => a - b)
      .map((index) => items[index]?.keyword ?? ''),
  }
}

const csvCell = (value: string | number) => {
  const text = String(value)
  // A leading =, +, - or @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

// One row per keyword: its cluster number and lead, or why it has none.
export function keywordClustersCsv(
  clustering: KeywordClustering,
  // Keywords that could not be compared, with the reason to show.
  unchecked: { keyword: string; reason: string }[],
): string {
  const lines: (string | number)[][] = [['keyword', 'cluster', 'lead keyword']]
  clustering.clusters.forEach((cluster, index) => {
    for (const { keyword } of cluster.keywords) {
      lines.push([keyword, index + 1, cluster.lead])
    }
  })
  for (const keyword of clustering.unclustered) {
    lines.push([keyword, 'unclustered', ''])
  }
  for (const { keyword, reason } of unchecked) lines.push([keyword, reason, ''])
  return `${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`
}
