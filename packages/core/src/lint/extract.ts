import {
  BLOCK_TAGS,
  Builder,
  decodeEntity,
  decodeValue,
  directive,
  ENTITY,
  lineOf,
  lineStartsOf,
  makeBlock,
  type Prop,
  RAW_TAGS,
  scanBalanced,
  scanStatement,
  scanTag,
} from './scan.js'
import type {
  Block,
  BlockKind,
  Doc,
  LinkSpan,
  LintFormat,
  LintMetaKind,
  LintPreset,
} from './types.js'

// Turns Markdown, MDX, HTML, Astro or plain text into readable blocks that
// keep each character's source offset, so every finding points at the right
// line and column. Code, imports, exports, tags, expressions and URLs are
// left out. Prose inside component props (caption="...") and frontmatter
// titles and descriptions is kept, because people read it.

export { lineOf, lineStartsOf, normalise } from './scan.js'

type Extracted = {
  blocks: Block[]
  suppressed: Map<number, Set<string> | null>
}

class Extractor {
  readonly source: string
  readonly out: string[]
  readonly hidden: Uint8Array
  readonly props: Array<{ at: number; block: Block }> = []
  readonly links: LinkSpan[] = []
  // Source lines followed by an ignore directive's target.
  readonly pending: Array<{ line: number; rules: Set<string> | null }> = []
  readonly starts: number[]

  constructor(source: string) {
    this.source = source
    this.out = source.split('')
    this.hidden = new Uint8Array(source.length)
    this.starts = lineStartsOf(source)
  }

  hide(start: number, end: number) {
    this.hidden.fill(1, Math.max(0, start), Math.min(this.source.length, end))
  }

  addProps(props: Prop[]) {
    for (const prop of props) {
      const block = makeBlock(prop.kind, prop.built, { field: prop.name })
      if (block) this.props.push({ at: block.map[0] ?? 0, block })
    }
  }

  comment(text: string, end: number) {
    const rules = directive(text)
    if (rules === undefined) return
    this.pending.push({ line: lineOf(this.starts, end), rules })
  }

  // Frontmatter fields people read: title, description, heading and lead.
  frontmatter(code: boolean): number {
    const source = this.source
    const open = /^---[ \t]*\r?\n/.exec(source)
    if (!open) return 0
    const close = /\r?\n---[ \t]*(?:\r?\n|$)/g
    close.lastIndex = open[0].length - 1
    const found = close.exec(source)
    if (!found) return 0
    const end = found.index + found[0].length
    this.hide(0, end)
    if (code) return end
    const field = /^([A-Za-z_]+):[ \t]*(.+?)[ \t]*$/gm
    const body = source.slice(0, found.index)
    for (const match of body.matchAll(field)) {
      const key = (match[1] ?? '').toLowerCase()
      let value = match[2] ?? ''
      let at = (match.index ?? 0) + match[0].length - value.length
      const kind: BlockKind | null =
        key === 'title' || key === 'seo_title' || key === 'meta_title'
          ? 'title'
          : key === 'description' || key === 'meta_description'
            ? 'description'
            : key === 'heading' || key === 'h1'
              ? 'heading'
              : ['lead', 'summary', 'excerpt', 'subtitle', 'intro'].includes(
                    key,
                  )
                ? 'prop'
                : null
      if (!kind || /^[|>]/.test(value)) continue
      const quoted = /^(["'])(.*)\1$/.exec(value)
      if (quoted) {
        value = quoted[2] ?? ''
        at += 1
      }
      const block = makeBlock(
        kind,
        decodeValue(source, at, at + value.length, Boolean(quoted)),
        { field: key, level: kind === 'heading' ? 1 : undefined, at },
      )
      if (block) this.props.push({ at, block })
    }
    return end
  }
}

const URL_AT = /(?:https?:\/\/|www\.)[^\s<>)\]"'`]+/y

// Markdown and MDX.
function extractMarkdown(source: string, mdx: boolean): Extracted {
  const x = new Extractor(source)
  const n = source.length
  type LineInfo = { kind: BlockKind; level?: number }
  const info = new Map<number, LineInfo>()
  let p = x.frontmatter(false)

  const inline = (from: number, lineEnd: number): number => {
    let end = lineEnd
    let i = from
    while (i < end) {
      const char = source[i] ?? ''
      if (char === '\\' && i + 1 < end && /[^\w\s]/.test(source[i + 1] ?? '')) {
        x.hide(i, i + 1)
        i += 2
        continue
      }
      if (char === '`') {
        let run = 1
        while (source[i + run] === '`') run++
        const fence = '`'.repeat(run)
        let close = source.indexOf(fence, i + run)
        const blank = source.indexOf('\n\n', i)
        if (close >= 0 && blank >= 0 && blank < close) close = -1
        if (close < 0) {
          i += run
          continue
        }
        x.out[i] = 'x'
        x.hide(i + 1, close + run)
        i = close + run
        if (i > end) end = lineEndAt(source, i)
        continue
      }
      if (char === '<') {
        if (source.startsWith('<!--', i)) {
          const close = source.indexOf('-->', i + 4)
          const stop = close < 0 ? n : close + 3
          x.comment(source.slice(i, stop), stop)
          x.hide(i, stop)
          i = stop
          if (i > end) end = lineEndAt(source, i)
          continue
        }
        if (/^<(?:https?:|mailto:)[^>\s]+>/.test(source.slice(i, i + 300))) {
          const close = source.indexOf('>', i)
          x.hide(i, close + 1)
          i = close + 1
          continue
        }
        if (/[A-Za-z/>]/.test(source[i + 1] ?? '')) {
          const tag = scanTag(source, i)
          if (tag) {
            // An ignore comment inside the tag, such as above a quoted prop.
            for (const found of source
              .slice(i, tag.end)
              .matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g)) {
              const stop = i + (found.index ?? 0) + found[0].length
              x.comment(found[0], stop)
            }
            x.addProps(tag.props)
            x.hide(i, tag.end)
            let next = tag.end
            const lower = tag.name.toLowerCase()
            if (RAW_TAGS.has(lower) && !tag.closing && !tag.selfClosing) {
              const close = source.toLowerCase().indexOf(`</${lower}`, tag.end)
              const stop = close < 0 ? n : source.indexOf('>', close) + 1
              if (lower === 'code' && close >= 0) x.out[i] = 'x'
              x.hide(lower === 'code' ? i + 1 : i, stop)
              next = stop
            }
            i = next
            if (i > end) end = lineEndAt(source, i)
            continue
          }
        }
      }
      if (mdx && char === '{') {
        const close = scanBalanced(source, i)
        const body = source.slice(i, close)
        if (body.startsWith('{/*')) x.comment(body, close)
        x.hide(i, close)
        i = close
        if (i > end) end = lineEndAt(source, i)
        continue
      }
      if (char === '!' && source[i + 1] === '[') {
        const close = source.indexOf('](', i)
        const paren = close >= 0 ? source.indexOf(')', close) : -1
        if (paren >= 0 && paren < end) {
          x.hide(i, paren + 1)
          i = paren + 1
          continue
        }
      }
      if (char === '[') {
        const close = source.indexOf(']', i + 1)
        if (close > i && close < end) {
          if (source[close + 1] === '(') {
            const paren = source.indexOf(')', close)
            if (paren > close && paren <= end) {
              x.hide(i, i + 1)
              x.hide(close, paren + 1)
              x.links.push({ start: i + 1, end: close })
              i++
              continue
            }
          } else if (source[close + 1] === '[') {
            const ref = source.indexOf(']', close + 2)
            if (ref > close && ref < end) {
              x.hide(i, i + 1)
              x.hide(close, ref + 1)
              x.links.push({ start: i + 1, end: close })
              i++
              continue
            }
          }
        }
      }
      if (char === 'h' || char === 'w') {
        URL_AT.lastIndex = i
        const url = URL_AT.exec(source)
        if (url && (i === 0 || /[\s(<[]/.test(source[i - 1] ?? ''))) {
          x.hide(i, i + url[0].length)
          i += url[0].length
          continue
        }
      }
      if (char === '*' || char === '~') {
        x.hide(i, i + 1)
        i++
        continue
      }
      if (
        char === '_' &&
        !(/\w/.test(source[i - 1] ?? '') && /\w/.test(source[i + 1] ?? ''))
      ) {
        x.hide(i, i + 1)
        i++
        continue
      }
      if (char === '&') {
        ENTITY.lastIndex = i
        const match = ENTITY.exec(source)
        const decoded = match ? decodeEntity(match[1] ?? '') : null
        if (match && decoded !== null) {
          x.out[i] = decoded
          x.hide(i + 1, i + match[0].length)
          i += match[0].length
          continue
        }
      }
      i++
    }
    return end
  }

  while (p < n) {
    const lineEnd = lineEndAt(source, p)
    const line = source.slice(p, lineEnd)
    const trimmed = line.trimStart()
    const indent = line.length - trimmed.length
    const fence = /^(`{3,}|~{3,})/.exec(trimmed)
    if (fence) {
      const marker = fence[1] ?? '```'
      let q = lineEnd + 1
      let stop = n
      while (q < n) {
        const end = lineEndAt(source, q)
        if (source.slice(q, end).trimStart().startsWith(marker)) {
          stop = end
          break
        }
        q = end + 1
      }
      x.hide(p, stop)
      p = stop + 1
      continue
    }
    if (mdx && indent === 0 && /^(?:import|export)\s/.test(line)) {
      const stop = scanStatement(source, p)
      x.hide(p, stop)
      p = stop + 1
      continue
    }
    if (/^\s*\|/.test(line) || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      x.hide(p, lineEnd)
      p = lineEnd + 1
      continue
    }
    if (/^\s{0,3}\[[^\]]+\]:\s*\S/.test(line)) {
      x.hide(p, lineEnd)
      p = lineEnd + 1
      continue
    }
    let from = p + indent
    const lineIndex = lineOf(x.starts, p)
    const heading = /^(#{1,6})[ \t]+/.exec(trimmed)
    if (heading) {
      info.set(lineIndex, { kind: 'heading', level: heading[1]?.length })
      x.hide(from, from + heading[0].length)
      const closing = /[ \t]+#+[ \t]*$/.exec(line)
      if (closing) x.hide(p + closing.index, lineEnd)
      from += heading[0].length
    } else {
      const quote = /^(?:>[ \t]?)+/.exec(trimmed)
      if (quote) {
        info.set(lineIndex, { kind: 'quote' })
        x.hide(from, from + quote[0].length)
        from += quote[0].length
      }
      const rest = source.slice(from, lineEnd)
      const item = /^(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/.exec(rest)
      if (item) {
        info.set(lineIndex, { kind: 'list' })
        x.hide(from, from + item[0].length)
        from += item[0].length
      }
    }
    const stop = inline(from, lineEnd)
    p = stop + 1
  }

  // Group lines into blocks.
  const blocks: Block[] = []
  let current: { kind: BlockKind; level?: number; built: Builder } | null = null
  const flush = () => {
    if (!current) return
    const block = makeBlock(current.kind, current.built, {
      level: current.level,
      links: x.links,
    })
    if (block) blocks.push(block)
    current = null
  }
  for (let line = 0; line < x.starts.length; line++) {
    const start = x.starts[line] ?? 0
    const end = lineEndAt(source, start)
    let visible = false
    for (let i = start; i < end; i++) {
      if (!x.hidden[i] && /\S/.test(x.out[i] ?? '')) {
        visible = true
        break
      }
    }
    if (!visible) {
      flush()
      continue
    }
    const lineInfo = info.get(line)
    if (lineInfo?.kind === 'heading' || lineInfo?.kind === 'list') flush()
    if (lineInfo?.kind === 'quote' && current?.kind !== 'quote') flush()
    if (!current) {
      current = {
        kind: lineInfo?.kind ?? 'paragraph',
        level: lineInfo?.level,
        built: new Builder(),
      }
    } else {
      current.built.push(' ', start - 1)
    }
    for (let i = start; i < end; i++) {
      if (!x.hidden[i]) current.built.push(x.out[i] ?? '', i)
    }
    if (lineInfo?.kind === 'heading') flush()
  }
  flush()
  return finish(x, blocks)
}

function lineEndAt(source: string, at: number): number {
  const end = source.indexOf('\n', at)
  return end < 0 ? source.length : end
}

// HTML and Astro.
function extractHtml(source: string, astro: boolean): Extracted {
  const x = new Extractor(source)
  const n = source.length
  const blocks: Block[] = []
  let kind: BlockKind = 'paragraph'
  let level: number | undefined
  let built = new Builder()
  let links: LinkSpan[] = []
  let linkStart = -1
  const flush = (next: BlockKind = 'paragraph', nextLevel?: number) => {
    const block = makeBlock(kind, built, { level, links })
    if (block) blocks.push(block)
    built = new Builder()
    links = []
    kind = next
    level = nextLevel
  }
  let i = x.frontmatter(astro)
  while (i < n) {
    const char = source[i] ?? ''
    if (char === '<' && source.startsWith('<!--', i)) {
      const close = source.indexOf('-->', i + 4)
      const stop = close < 0 ? n : close + 3
      x.comment(source.slice(i, stop), stop)
      i = stop
      continue
    }
    if (char === '<' && /[A-Za-z/!]/.test(source[i + 1] ?? '')) {
      if (source[i + 1] === '!') {
        const close = source.indexOf('>', i)
        i = close < 0 ? n : close + 1
        continue
      }
      const tag = scanTag(source, i)
      if (!tag) {
        built.push(char, i)
        i++
        continue
      }
      const lower = tag.name.toLowerCase()
      x.addProps(tag.props)
      if (lower === 'meta' && !tag.closing) {
        const name = tag.attrs.get('name') ?? tag.attrs.get('property')
        const content = tag.attrs.get('content')
        const value = name ? source.slice(name.start, name.end) : ''
        if (content && /^description$/i.test(value)) {
          const block = makeBlock(
            'description',
            decodeValue(source, content.start, content.end, false),
            { field: 'description', at: content.start },
          )
          if (block) x.props.push({ at: content.start, block })
        }
      }
      if (lower === 'title' && !tag.closing) {
        const close = source.toLowerCase().indexOf('</title', tag.end)
        const stop = close < 0 ? n : close
        const block = makeBlock(
          'title',
          decodeValue(source, tag.end, stop, false),
          { field: 'title', at: tag.end },
        )
        if (block) x.props.push({ at: tag.end, block })
        i = close < 0 ? n : source.indexOf('>', close) + 1
        continue
      }
      if (RAW_TAGS.has(lower) && !tag.closing && !tag.selfClosing) {
        const close = source.toLowerCase().indexOf(`</${lower}`, tag.end)
        if (lower === 'code' && close >= 0) built.push('x', i)
        else flush()
        i = close < 0 ? n : source.indexOf('>', close) + 1
        continue
      }
      if (lower === 'a' || lower === 'button') {
        if (tag.closing && linkStart >= 0) {
          links.push({ start: linkStart, end: i })
          linkStart = -1
        } else if (!tag.closing) linkStart = tag.end
      }
      if (
        BLOCK_TAGS.has(lower) ||
        /^[A-Z]/.test(tag.name) ||
        lower === 'a' ||
        lower === 'button'
      ) {
        if (lower === 'a' || lower === 'button') {
          // Inline, but a word on each side stays apart.
          built.push(' ', i)
        } else if (tag.closing || tag.selfClosing) {
          flush()
        } else {
          const heading = /^h([1-6])$/.exec(lower)
          flush(
            heading
              ? 'heading'
              : lower === 'li'
                ? 'list'
                : lower === 'blockquote'
                  ? 'quote'
                  : 'paragraph',
            heading ? Number(heading[1]) : undefined,
          )
        }
      }
      i = tag.end
      continue
    }
    if (astro && char === '{') {
      i = scanBalanced(source, i)
      continue
    }
    if (char === '&') {
      ENTITY.lastIndex = i
      const match = ENTITY.exec(source)
      const decoded = match ? decodeEntity(match[1] ?? '') : null
      if (match && decoded !== null) {
        built.push(decoded, i)
        i += match[0].length
        continue
      }
    }
    if (char === 'h' || char === 'w') {
      URL_AT.lastIndex = i
      const url = URL_AT.exec(source)
      if (url && (i === 0 || /[\s(<[]/.test(source[i - 1] ?? ''))) {
        i += url[0].length
        continue
      }
    }
    built.push(char, i)
    i++
  }
  flush()
  return finish(x, blocks)
}

// Plain text: paragraphs between blank lines.
function extractText(source: string): Extracted {
  const x = new Extractor(source)
  const blocks: Block[] = []
  let built = new Builder()
  const flush = () => {
    const block = makeBlock('paragraph', built)
    if (block) blocks.push(block)
    built = new Builder()
  }
  for (let line = 0; line < x.starts.length; line++) {
    const start = x.starts[line] ?? 0
    const end = lineEndAt(source, start)
    const text = source.slice(start, end)
    if (!text.trim()) {
      flush()
      continue
    }
    const directiveRules = directive(text)
    if (
      directiveRules !== undefined &&
      /^\s*(?:<!--|\{\/\*|\/\/|#)/.test(text)
    ) {
      x.comment(text, end)
      flush()
      continue
    }
    if (built.length) built.push(' ', start - 1)
    let i = start
    while (i < end) {
      URL_AT.lastIndex = i
      const url = URL_AT.exec(source)
      if (url && (i === start || /[\s(<[]/.test(source[i - 1] ?? ''))) {
        i += url[0].length
        continue
      }
      built.push(source[i] ?? '', i)
      i++
    }
  }
  flush()
  return finish(x, blocks)
}

// One title or description per line, for the meta preset. A line can start
// with "title:" or "description:"; otherwise it is metaKind, or without one
// a line up to 70 characters is read as a title and a longer one as a
// description.
function extractMetaLines(source: string, metaKind?: LintMetaKind): Extracted {
  const x = new Extractor(source)
  const blocks: Block[] = []
  for (let line = 0; line < x.starts.length; line++) {
    const start = x.starts[line] ?? 0
    const end = lineEndAt(source, start)
    const text = source.slice(start, end)
    if (!text.trim()) continue
    const label = /^\s*(title|description)\s*:\s*/i.exec(text)
    const from = start + (label ? label[0].length : 0)
    const built = decodeValue(source, from, end, false)
    const value = source.slice(from, end).trim()
    const kind: BlockKind = label
      ? (label[1]?.toLowerCase() as BlockKind)
      : metaKind
        ? metaKind
        : value.length <= 70
          ? 'title'
          : 'description'
    // A labelled line with nothing after it is an empty tag.
    const block = makeBlock(kind, built, {
      field: kind,
      ...(label ? { at: from } : {}),
    })
    if (block) blocks.push(block)
  }
  return finish(x, blocks)
}

function finish(x: Extractor, blocks: Block[]): Extracted {
  const all = [...blocks, ...x.props.map((prop) => prop.block)].sort(
    (a, b) => (a.map[0] ?? 0) - (b.map[0] ?? 0),
  )
  let section = 0
  for (const block of all) {
    if (block.kind === 'heading' && block.field === undefined) section++
    block.section = section
  }
  for (let i = 0; i < all.length; i++) {
    const block = all[i] as Block
    const next = all[i + 1]
    block.endsSection = !next || next.kind === 'heading'
  }
  const suppressed = new Map<number, Set<string> | null>()
  for (const { line, rules } of x.pending) {
    // The next line with visible text after the comment.
    let target = line + 1
    while (target < x.starts.length) {
      const start = x.starts[target] ?? 0
      const text = x.source.slice(start, lineEndAt(x.source, start))
      if (text.trim()) break
      target++
    }
    const had = suppressed.get(target)
    if (had === null || rules === null) suppressed.set(target, null)
    else suppressed.set(target, new Set([...(had ?? []), ...rules]))
  }
  return { blocks: all, suppressed }
}

export function formatFromPath(path: string): LintFormat {
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase()
  if (ext === 'mdx') return 'mdx'
  if (ext === 'md' || ext === 'markdown') return 'md'
  if (ext === 'html' || ext === 'htm') return 'html'
  if (ext === 'astro') return 'astro'
  return 'text'
}

export function defaultPreset(format: LintFormat): LintPreset {
  return format === 'html' || format === 'astro' ? 'landing' : 'blog'
}

export function extract(
  source: string,
  format: LintFormat,
  preset: LintPreset,
  metaKind?: LintMetaKind,
): Doc {
  const extracted =
    preset === 'meta' && format === 'text'
      ? extractMetaLines(source, metaKind)
      : format === 'md' || format === 'mdx'
        ? extractMarkdown(source, format === 'mdx')
        : format === 'html' || format === 'astro'
          ? extractHtml(source, format === 'astro')
          : extractText(source)
  return {
    source,
    format,
    blocks: extracted.blocks,
    suppressed: extracted.suppressed,
    lineStarts: lineStartsOf(source),
  }
}
