import type { Block, BlockKind, LinkSpan } from './types.js'

// Low-level scanning for the extractor: entities, tags, props, strings and
// ignore comments, each keeping source offsets.

// Props whose value is a sentence or two, read like a paragraph.
export const PROSE_PROPS = new Set([
  'caption',
  'body',
  'text',
  'note',
  'lead',
  'detail',
  'description',
  'summary',
  'subtitle',
])
// Props whose value is a short label, read for words but not for rhythm.
export const LABEL_PROPS = new Set(['title', 'label', 'heading'])
// Tags whose content is never prose.
export const RAW_TAGS = new Set([
  'pre',
  'code',
  'script',
  'style',
  'svg',
  'textarea',
  'template',
  'math',
])
export const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'body',
  'br',
  'button',
  'dd',
  'details',
  'dialog',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hr',
  'html',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
])

export const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201d',
  ldquo: '\u201c',
  mdash: '\u2014',
  ndash: '\u2013',
  hellip: '\u2026',
  rarr: '\u2192',
  larr: '\u2190',
  copy: '\u00a9',
}

export const ENTITY = /&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z]{2,8});/iy

export function decodeEntity(body: string): string | null {
  if (body.startsWith('#x') || body.startsWith('#X')) {
    const code = Number.parseInt(body.slice(2), 16)
    return Number.isFinite(code) && code <= 0x10ffff
      ? String.fromCodePoint(code)
      : null
  }
  if (body.startsWith('#')) {
    const code = Number.parseInt(body.slice(1), 10)
    return Number.isFinite(code) && code <= 0x10ffff
      ? String.fromCodePoint(code)
      : null
  }
  return ENTITIES[body.toLowerCase()] ?? null
}

// Straight quotes for matching, the same length as the text.
export function normalise(text: string): string {
  return text
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
}

export function lineStartsOf(source: string): number[] {
  const starts = [0]
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) starts.push(i + 1)
  }
  return starts
}

export function lineOf(starts: number[], offset: number): number {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((starts[mid] ?? 0) <= offset) lo = mid
    else hi = mid - 1
  }
  return lo
}

// A string of readable characters with the source offset of each.
export class Builder {
  chars: string[] = []
  map: number[] = []
  push(value: string, offset: number) {
    for (const char of value) {
      this.chars.push(char)
      this.map.push(offset)
    }
  }
  get length() {
    return this.chars.length
  }
}

// Collapses whitespace, trims, and makes a block.
export function makeBlock(
  kind: BlockKind,
  built: Builder,
  extra: {
    level?: number
    field?: string
    links?: LinkSpan[]
    // Where an empty title or description sits, so it is still reported.
    at?: number
  } = {},
): Block | null {
  const text: string[] = []
  const map: number[] = []
  let space = true
  for (let i = 0; i < built.chars.length; i++) {
    const char = built.chars[i] ?? ''
    if (/\s/.test(char)) {
      if (!space) {
        text.push(' ')
        map.push(built.map[i] ?? 0)
      }
      space = true
      continue
    }
    space = false
    text.push(char)
    map.push(built.map[i] ?? 0)
  }
  while (text.length && text[text.length - 1] === ' ') {
    text.pop()
    map.pop()
  }
  if (!text.length) {
    if (
      extra.at === undefined ||
      (kind !== 'title' && kind !== 'description')
    ) {
      return null
    }
    map.push(extra.at)
    return {
      kind,
      text: '',
      norm: '',
      map,
      field: extra.field,
      section: 0,
      links: [],
    }
  }
  const joined = text.join('')
  // Link ranges arrive as source offsets; find them in the text.
  const links: LinkSpan[] = []
  for (const link of extra.links ?? []) {
    let start = -1
    let end = -1
    for (let i = 0; i < map.length; i++) {
      const at = map[i] ?? 0
      if (at >= link.start && at < link.end) {
        if (start < 0) start = i
        end = i + 1
      }
    }
    if (start >= 0) links.push({ start, end })
  }
  return {
    kind,
    text: joined,
    norm: normalise(joined),
    map,
    level: extra.level,
    field: extra.field,
    section: 0,
    links,
  }
}

// The position after a balanced {...} that starts at `at`, skipping strings
// and comments. Returns the source length when it never closes.
export function scanBalanced(source: string, at: number): number {
  let depth = 0
  let i = at
  while (i < source.length) {
    const char = source[i]
    if (char === '"' || char === "'" || char === '`') {
      i = skipString(source, i)
      continue
    }
    if (char === '/' && source[i + 1] === '*') {
      const close = source.indexOf('*/', i + 2)
      i = close < 0 ? source.length : close + 2
      continue
    }
    if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) return i + 1
    }
    i++
  }
  return source.length
}

export function skipString(source: string, at: number): number {
  const quote = source[at]
  let i = at + 1
  while (i < source.length) {
    const char = source[i]
    if (char === '\\') {
      i += 2
      continue
    }
    if (char === quote) return i + 1
    // A plain string never crosses a line; a template literal can.
    if (char === '\n' && quote !== '`') return i
    i++
  }
  return source.length
}

// An MDX import or export statement: to the first line end outside
// brackets and strings.
export function scanStatement(source: string, at: number): number {
  let depth = 0
  let i = at
  while (i < source.length) {
    const char = source[i]
    if (char === '"' || char === "'" || char === '`') {
      i = skipString(source, i)
      continue
    }
    if (char === '{' || char === '(' || char === '[') depth++
    else if (char === '}' || char === ')' || char === ']') depth--
    else if (char === '\n' && depth <= 0) return i
    i++
  }
  return source.length
}

// Decodes a JS string literal body or an attribute value into readable
// characters, keeping offsets.
export function decodeValue(
  source: string,
  start: number,
  end: number,
  js: boolean,
): Builder {
  const built = new Builder()
  let i = start
  while (i < end) {
    const char = source[i] ?? ''
    if (js && char === '\\' && i + 1 < end) {
      const next = source[i + 1] ?? ''
      built.push(next === 'n' || next === 't' ? ' ' : next, i)
      i += 2
      continue
    }
    if (char === '&') {
      ENTITY.lastIndex = i
      const match = ENTITY.exec(source)
      const decoded = match ? decodeEntity(match[1] ?? '') : null
      if (match && decoded !== null && match.index + match[0].length <= end) {
        built.push(decoded, i)
        i += match[0].length
        continue
      }
    }
    built.push(char, i)
    i++
  }
  return built
}

export type Prop = { name: string; kind: BlockKind; built: Builder }

export const KEY_STRING =
  /(["']?)([A-Za-z]+)\1\s*:\s*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/g

// Readable strings inside a JSX expression, such as rows of
// { "note": "..." } objects.
export function propsInExpression(source: string, start: number, end: number) {
  const props: Prop[] = []
  const body = source.slice(start, end)
  for (const match of body.matchAll(KEY_STRING)) {
    const name = (match[2] ?? '').toLowerCase()
    const kind = propKind(name)
    if (!kind) continue
    const value = match[3] ?? ''
    const at = start + (match.index ?? 0) + match[0].length - value.length
    props.push({
      name,
      kind,
      built: decodeValue(source, at + 1, at + value.length - 1, true),
    })
  }
  return props
}

export function propKind(name: string): BlockKind | null {
  const lower = name.toLowerCase()
  if (PROSE_PROPS.has(lower)) return 'prop'
  if (LABEL_PROPS.has(lower)) return 'label'
  return null
}

export type Tag = {
  end: number
  name: string
  closing: boolean
  selfClosing: boolean
  attrs: Map<string, { start: number; end: number }>
  props: Prop[]
}

// Reads one tag that starts at `at`. Returns null when the text is not a tag
// after all (a blank line or the end of the file comes first).
export function scanTag(source: string, at: number): Tag | null {
  let i = at + 1
  const closing = source[i] === '/'
  if (closing) i++
  const nameMatch = /[A-Za-z][\w.:-]*/y
  nameMatch.lastIndex = i
  const name = nameMatch.exec(source)?.[0] ?? ''
  if (!name && source[i] !== '>') return null
  i += name.length
  const attrs = new Map<string, { start: number; end: number }>()
  const props: Prop[] = []
  while (i < source.length) {
    const char = source[i] ?? ''
    if (char === '\n' && /^\n[ \t]*\n/.test(source.slice(i, i + 80))) {
      return null
    }
    if (/\s/.test(char)) {
      i++
      continue
    }
    if (char === '>') {
      return { end: i + 1, name, closing, selfClosing: false, attrs, props }
    }
    if (char === '/' && source[i + 1] === '>') {
      return { end: i + 2, name, closing, selfClosing: true, attrs, props }
    }
    if (char === '{') {
      i = scanBalanced(source, i)
      continue
    }
    const attrMatch = /[^\s=>/{}]+/y
    attrMatch.lastIndex = i
    const attr = attrMatch.exec(source)?.[0]
    if (!attr) {
      i++
      continue
    }
    i += attr.length
    while (/[ \t\r\n]/.test(source[i] ?? '')) i++
    if (source[i] !== '=') continue
    i++
    while (/[ \t\r\n]/.test(source[i] ?? '')) i++
    const quote = source[i]
    const kind = propKind(attr)
    if (quote === '"' || quote === "'") {
      const close = source.indexOf(quote, i + 1)
      if (close < 0) return null
      attrs.set(attr.toLowerCase(), { start: i + 1, end: close })
      if (kind) {
        props.push({
          name: attr,
          kind,
          built: decodeValue(source, i + 1, close, false),
        })
      }
      i = close + 1
      continue
    }
    if (quote === '{') {
      const close = scanBalanced(source, i)
      const inner = source.slice(i + 1, close - 1).trim()
      const literal = /^(["'`])([\s\S]*)\1$/.exec(inner)
      if (literal && kind && !(literal[1] === '`' && inner.includes('${'))) {
        const offset = source.indexOf(inner, i) + 1
        props.push({
          name: attr,
          kind,
          built: decodeValue(source, offset, offset + inner.length - 2, true),
        })
      } else {
        props.push(...propsInExpression(source, i + 1, close - 1))
      }
      i = close
      continue
    }
    while (i < source.length && !/[\s>]/.test(source[i] ?? '')) i++
  }
  return null
}

// The text inside an ignore comment, or null when it is not one. An empty
// set means every rule.
export function directive(comment: string): Set<string> | null | undefined {
  const match = /seo-lint-ignore(?:-next-line)?\b([\s\S]*)/.exec(comment)
  if (!match) return undefined
  const rules = (match[1] ?? '')
    .replace(/(?:-->|\*\/\}?)\s*$/, '')
    .split(/[\s,]+/)
    .filter((rule) => /^[a-z][a-z0-9-]*$/.test(rule))
  return rules.length ? new Set(rules) : null
}
