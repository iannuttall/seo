import type { CheerioAPI } from 'cheerio'

// React server streaming (Fizz) sends Suspense fallbacks first and the real
// content later in hidden `<div hidden id="S:...">` segments. Small inline
// scripts then move each segment into place:
//   $RS("S:x", "P:x") replaces placeholder template P:x with segment S:x.
//   $RC("B:x", "S:y") replaces the fallback that follows template B:x, up to
//   the matching <!--/$--> comment, with segment S:y. $RR is the same with
//   stylesheet dependencies.
// A browser runs these scripts before hydration. Applying the same moves to
// the parsed document keeps content extraction on the visible article instead
// of the loading skeleton, without executing any page JavaScript.

export const MAX_STREAMED_SEGMENT_INSTRUCTIONS = 2_000

export type StreamedSegmentResolution = {
  /** Instructions whose segment was moved into place. */
  resolved: number
  /** Delivered segments that could not be placed; they stay hidden. */
  skipped: number
  /** More instructions than the limit; the rest were not applied. */
  truncated: boolean
}

type DomNode = {
  type: string
  data?: string
  parent: DomNode | null
  prev: DomNode | null
  next: DomNode | null
  children?: DomNode[]
}

const INSTRUCTION_PATTERN = /\$R([CRS])\(\s*"([^"]+)"\s*,\s*"([^"]+)"/gu
const BOUNDARY_OPEN = new Set(['$', '$?', '$!', '$~', '&'])
const BOUNDARY_CLOSE = new Set(['/$', '/&'])

type Instruction = {
  kind: 'segment' | 'boundary'
  target: string
  segment: string
}

function instructions($: CheerioAPI): {
  items: Instruction[]
  truncated: boolean
} {
  const items: Instruction[] = []
  for (const script of $('script:not([src])').toArray()) {
    const text = $(script).text()
    if (!text.includes('$R')) continue
    for (const match of text.matchAll(INSTRUCTION_PATTERN)) {
      const [, kind, first, second] = match
      if (!first || !second) continue
      if (items.length >= MAX_STREAMED_SEGMENT_INSTRUCTIONS) {
        return { items, truncated: true }
      }
      items.push(
        kind === 'S'
          ? { kind: 'segment', target: second, segment: first }
          : { kind: 'boundary', target: first, segment: second },
      )
    }
  }
  return { items, truncated: false }
}

function elementsById($: CheerioAPI): Map<string, DomNode> {
  const index = new Map<string, DomNode>()
  for (const element of $('[id]').toArray()) {
    const id = $(element).attr('id')
    if (id && !index.has(id)) index.set(id, element as unknown as DomNode)
  }
  return index
}

// Cheerio's insertion helpers clone nodes or skip comment anchors, so the
// resolver splices domhandler nodes directly.
function detach(node: DomNode): void {
  const siblings = node.parent?.children
  if (siblings) {
    const index = siblings.indexOf(node)
    if (index !== -1) siblings.splice(index, 1)
  }
  if (node.prev) node.prev.next = node.next
  if (node.next) node.next.prev = node.prev
  node.parent = null
  node.prev = null
  node.next = null
}

function moveChildrenBefore(segment: DomNode, anchor: DomNode): void {
  const parent = anchor.parent
  const siblings = parent?.children
  if (!parent || !siblings) return
  const children = [...(segment.children ?? [])]
  for (const child of children) detach(child)
  const index = siblings.indexOf(anchor)
  if (index === -1) return
  siblings.splice(index, 0, ...children)
  let previous = anchor.prev
  for (const child of children) {
    child.parent = parent
    child.prev = previous
    if (previous) previous.next = child
    previous = child
  }
  if (previous) previous.next = anchor
  anchor.prev = previous
}

function isComment(node: DomNode | null, values: Set<string>): boolean {
  return node?.type === 'comment' && values.has(node.data ?? '')
}

function replaceBoundary(template: DomNode, segment: DomNode): boolean {
  const parent = template.parent
  if (!parent) return false
  const opening = template.prev
  let depth = 0
  let node: DomNode | null = template
  let closing: DomNode | null = null
  const fallback: DomNode[] = []
  while (node) {
    if (isComment(node, BOUNDARY_CLOSE)) {
      if (depth === 0) {
        closing = node
        break
      }
      depth -= 1
    } else if (isComment(node, BOUNDARY_OPEN)) {
      depth += 1
    }
    fallback.push(node)
    node = node.next
  }
  if (!closing) return false
  detach(segment)
  moveChildrenBefore(segment, closing)
  for (const node of fallback) detach(node)
  if (opening?.type === 'comment') opening.data = '$'
  return true
}

function replacePlaceholder(placeholder: DomNode, segment: DomNode): boolean {
  if (!placeholder.parent) return false
  detach(segment)
  moveChildrenBefore(segment, placeholder)
  detach(placeholder)
  return true
}

/**
 * Applies React streaming segment moves to a parsed document in place.
 * Returns zero counts for documents without streaming instructions.
 */
export function resolveStreamedSegments(
  $: CheerioAPI,
): StreamedSegmentResolution {
  const { items, truncated } = instructions($)
  if (items.length === 0) return { resolved: 0, skipped: 0, truncated }
  const index = elementsById($)
  let resolved = 0
  let skipped = 0
  for (const instruction of items) {
    const segment = index.get(instruction.segment)
    // A missing segment was already moved (rendered HTML keeps the scripts)
    // or never arrived. Only a delivered segment that cannot be placed counts
    // as skipped.
    if (!segment?.parent) continue
    const target = index.get(instruction.target)
    const applied =
      target &&
      (instruction.kind === 'segment'
        ? replacePlaceholder(target, segment)
        : replaceBoundary(target, segment))
    if (applied) resolved += 1
    else skipped += 1
  }
  return { resolved, skipped, truncated }
}

/**
 * Next.js App Router pages carry their React Server Components payload in
 * inline `self.__next_f` scripts. On these pages a canonical in the body is
 * streamed metadata rather than a hand-placed tag.
 */
export function hasNextAppRouterPayload($: CheerioAPI): boolean {
  return $('script:not([src])')
    .toArray()
    .some((script) => $(script).text().includes('self.__next_f'))
}
