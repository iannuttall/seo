export type CrawlUrlQueueItem = {
  url: string
  depth: number
}

function before(left: CrawlUrlQueueItem, right: CrawlUrlQueueItem): boolean {
  return (
    left.depth < right.depth ||
    (left.depth === right.depth && left.url < right.url)
  )
}

export class CrawlUrlQueue {
  readonly #items: CrawlUrlQueueItem[] = []
  readonly #positions = new Map<string, number>()

  get size(): number {
    return this.#items.length
  }

  has(url: string): boolean {
    return this.#positions.has(url)
  }

  push(item: CrawlUrlQueueItem): void {
    if (this.has(item.url)) {
      throw new Error(`URL is already queued: ${item.url}`)
    }
    const index = this.#items.length
    this.#items.push(item)
    this.#positions.set(item.url, index)
    this.#bubbleUp(index)
  }

  decreaseDepth(url: string, depth: number): boolean {
    const index = this.#positions.get(url)
    if (index === undefined) return false
    const item = this.#items[index]
    if (!item || depth >= item.depth) return false
    item.depth = depth
    this.#bubbleUp(index)
    return true
  }

  take(): CrawlUrlQueueItem | undefined {
    const first = this.#items[0]
    if (!first) return undefined
    const last = this.#items.pop()
    this.#positions.delete(first.url)
    if (last && last !== first) {
      this.#items[0] = last
      this.#positions.set(last.url, 0)
      this.#bubbleDown(0)
    }
    return first
  }

  #swap(left: number, right: number): void {
    const leftItem = this.#items[left]
    const rightItem = this.#items[right]
    if (!leftItem || !rightItem) return
    this.#items[left] = rightItem
    this.#items[right] = leftItem
    this.#positions.set(rightItem.url, left)
    this.#positions.set(leftItem.url, right)
  }

  #bubbleUp(start: number): void {
    let index = start
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      const item = this.#items[index]
      const parentItem = this.#items[parent]
      if (!item || !parentItem || !before(item, parentItem)) break
      this.#swap(index, parent)
      index = parent
    }
  }

  #bubbleDown(start: number): void {
    let index = start
    while (true) {
      const left = index * 2 + 1
      const right = left + 1
      let next = index
      const item = this.#items[next]
      const leftItem = this.#items[left]
      const rightItem = this.#items[right]
      if (leftItem && item && before(leftItem, item)) next = left
      const nextItem = this.#items[next]
      if (rightItem && nextItem && before(rightItem, nextItem)) next = right
      if (next === index) return
      this.#swap(index, next)
      index = next
    }
  }
}
