import type { TermWeights } from './internal-links-placement.js'

// TF-IDF over every page of one crawl. Terms are kept as numbers, and each
// page keeps only its heaviest terms, so memory grows slowly with the site.
// An inverted index finds a page's nearest pages without comparing every
// pair. Pure code: runs in Node and in Workers.

// Terms kept per page before weighting, and per page vector after it.
const PAGE_TERMS = 300
const VECTOR_TERMS = 100

export class SiteIndex implements TermWeights {
  private readonly ids = new Map<string, number>()
  private readonly df: number[] = []
  private readonly counts: Array<{ ids: Int32Array; counts: Float32Array }> = []
  private vectors: Array<{ ids: Int32Array; weights: Float32Array }> = []
  private postings: Array<{ pages: Int32Array; weights: Float32Array }> = []
  private scratch = new Float64Array(0)

  get size(): number {
    return this.counts.length
  }

  // Adds a page's weighted term counts and returns its number.
  addPage(termCounts: Record<string, number>): number {
    const kept = Object.entries(termCounts)
      .sort(
        (left, right) =>
          right[1] - left[1] ||
          (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0),
      )
      .slice(0, PAGE_TERMS)
    const ids = new Int32Array(kept.length)
    const counts = new Float32Array(kept.length)
    kept.forEach(([term, count], index) => {
      let id = this.ids.get(term)
      if (id === undefined) {
        id = this.df.length
        this.ids.set(term, id)
        this.df.push(0)
      }
      this.df[id] = (this.df[id] ?? 0) + 1
      ids[index] = id
      counts[index] = count
    })
    this.counts.push({ ids, counts })
    return this.counts.length - 1
  }

  private idfOf(id: number): number {
    return Math.log((this.size + 1) / ((this.df[id] ?? 1) + 1)) + 1
  }

  idf(term: string): number {
    const id = this.ids.get(term)
    return id === undefined ? Math.log((this.size + 1) / 2) + 1 : this.idfOf(id)
  }

  // Builds the unit vectors and the inverted index. A term on one page only
  // cannot match another page, so it only adds to the vector's length.
  finish(): void {
    this.vectors = this.counts.map(({ ids, counts }) => {
      let norm = 0
      const shared: Array<[number, number]> = []
      for (let index = 0; index < ids.length; index += 1) {
        const id = ids[index] ?? 0
        const weight = (1 + Math.log(counts[index] ?? 1)) * this.idfOf(id)
        norm += weight * weight
        if ((this.df[id] ?? 0) >= 2) shared.push([id, weight])
      }
      norm = Math.sqrt(norm) || 1
      shared.sort((left, right) => right[1] - left[1] || left[0] - right[0])
      const top = shared.slice(0, VECTOR_TERMS)
      return {
        ids: Int32Array.from(top.map(([id]) => id)),
        weights: Float32Array.from(top.map(([, weight]) => weight / norm)),
      }
    })
    const lists = this.df.map(() => ({
      pages: [] as number[],
      weights: [] as number[],
    }))
    this.vectors.forEach((vector, page) => {
      vector.ids.forEach((id, index) => {
        const list = lists[id]
        if (!list) return
        list.pages.push(page)
        list.weights.push(vector.weights[index] ?? 0)
      })
    })
    this.postings = lists.map((list) => ({
      pages: Int32Array.from(list.pages),
      weights: Float32Array.from(list.weights),
    }))
    this.scratch = new Float64Array(this.size)
  }

  // Cosine similarity of two pages, 0 to 1.
  similarity(left: number, right: number): number {
    const a = this.vectors[left]
    const b = this.vectors[right]
    if (!a || !b) return 0
    const weights = new Map<number, number>()
    a.ids.forEach((id, index) => {
      weights.set(id, a.weights[index] ?? 0)
    })
    let sum = 0
    b.ids.forEach((id, index) => {
      sum += (weights.get(id) ?? 0) * (b.weights[index] ?? 0)
    })
    return sum
  }

  // The other pages at least `min` similar to a page, most similar first,
  // ties by page number.
  neighbours(
    page: number,
    min: number,
  ): Array<{ page: number; score: number }> {
    const vector = this.vectors[page]
    if (!vector) return []
    const scores = this.scratch
    const touched: number[] = []
    vector.ids.forEach((id, index) => {
      const weight = vector.weights[index] ?? 0
      const list = this.postings[id]
      if (!list) return
      for (let at = 0; at < list.pages.length; at += 1) {
        const other = list.pages[at] ?? 0
        if (other === page) continue
        if (scores[other] === 0) touched.push(other)
        scores[other] = (scores[other] ?? 0) + weight * (list.weights[at] ?? 0)
      }
    })
    const out: Array<{ page: number; score: number }> = []
    for (const other of touched) {
      const score = scores[other] ?? 0
      if (score >= min) out.push({ page: other, score })
      scores[other] = 0
    }
    return out.sort(
      (left, right) => right.score - left.score || left.page - right.page,
    )
  }
}
