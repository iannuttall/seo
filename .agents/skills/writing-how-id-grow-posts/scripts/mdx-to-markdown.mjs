// Turns a How I'd grow MDX post into Markdown for an Amp draft document:
// each exhibit becomes a table or list with its caption, marked as interactive.
// Usage: node mdx-to-markdown.mjs apps/web/src/content/blog/<slug>.mdx > /tmp/<slug>.md
import { readFileSync } from 'node:fs'

const src = readFileSync(process.argv[2], 'utf8')
const [, fm, bodyRaw] = src.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
const meta = Object.fromEntries(
  [...fm.matchAll(/^(\w+): (.*)$/gm)].map((m) => [
    m[1],
    m[2].replace(/^'|'$/g, ''),
  ]),
)
const exportsSrc = [
  ...bodyRaw.matchAll(/^export const (\w+) = (`[\s\S]*?`)$/gm),
]
const env = {}
for (const [, n, v] of exportsSrc) env[n] = Function(`return ${v}`)()
let body = bodyRaw.replace(/^export const \w+ = `[\s\S]*?`\n*/gm, '')
const fmt = (v) =>
  typeof v === 'number' ? v.toLocaleString('en-GB') : v == null ? '' : String(v)
const strip = (h) => {
  if (h.includes('<pre>'))
    return (
      '```text\n' +
      h
        .replace(/<\/?pre>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim() +
      '\n```'
    )
  return h
    .replace(/<li>/g, '- ')
    .replace(/<\/li>|<\/p>/g, '\n')
    .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
    .replace(/<[^>]+>/g, '')
    .trim()
}
function props(attrs) {
  const p = {}
  const re = /(\w+)=(?:"([^"]*)"|\{)/g
  for (;;) {
    const m = re.exec(attrs)
    if (!m) break
    if (m[2] !== undefined) {
      p[m[1]] = m[2].replace(/&quot;/g, '"')
      continue
    }
    let depth = 1,
      i = re.lastIndex
    while (depth) {
      const c = attrs[i++]
      if (c === '/' && attrs[i] === '/') i = attrs.indexOf('\n', i)
      else if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '`' || c === "'" || c === '"') {
        while (attrs[i++] !== c) if (attrs[i - 1] === '\\') i++
      }
    }
    const expr = attrs.slice(re.lastIndex, i - 1)
    p[m[1]] = Function(
      ...Object.keys(env),
      `return (${expr})`,
    )(...Object.values(env))
    re.lastIndex = i
  }
  for (const b of attrs.matchAll(/\s(\w+)(?=\s|$)/g))
    if (!(b[1] in p)) p[b[1]] = true
  return p
}
const table = (head, rows) =>
  [
    `| ${head.join(' | ')} |`,
    `|${head.map(() => '---|').join('')}`,
    ...rows.map((r) => `| ${r.map(fmt).join(' | ')} |`),
  ].join('\n')
function render(name, p, inner) {
  const out = []
  if (p.caption) out.push(`**Exhibit:** *${p.caption}*`, '')
  if (p.title) out.push(`**${p.title}**`, '')
  if (name === 'StatCards')
    out.push(
      table(
        ['', ''],
        p.cards.map((c) => [
          `**${c.value}**`,
          c.label + (c.detail ? ` (${c.detail})` : ''),
        ]),
      ),
      inner ? `\n*${inner.trim()}*` : '',
    )
  if (name === 'VerticalBars')
    out.push(
      table(
        ['', p.unit || ''],
        p.data.map((d) => [
          p.highlight?.includes(d.label) ? `**${d.label}**` : d.label,
          d.value,
        ]),
      ),
      ...(p.markers || []).map((m) => `- Marker at ${m.at}: ${m.text}`),
      ...p.data.filter((d) => d.note).map((d) => `- ${d.label}: ${d.note}`),
    )
  if (name === 'TrafficCurve') {
    const series = p.series || [{ name: p.unit || 'Value', data: p.data || [] }]
    const labels = [
      ...new Set(series.flatMap((x) => x.data.map((d) => d.label))),
    ]
    out.push(
      table(
        ['Month', ...series.map((x) => x.name)],
        labels.map((l) => [
          l,
          ...series.map((x) => x.data.find((d) => d.label === l)?.value ?? ''),
        ]),
      ),
    )
  }
  if (name === 'CompareBars') {
    const hl = [].concat(p.highlight || [])
    out.push(
      table(
        ['', p.unit || '', 'Note'],
        p.rows.map((r) => [
          hl.includes(r.label) ? `**${r.label}**` : r.label,
          r.value,
          r.note || '',
        ]),
      ),
    )
  }
  if (name === 'KeywordTable') {
    const cols = p.columns || [
      { key: 'keyword', label: 'Search' },
      { key: 'volume', label: 'US searches' },
      { key: 'global', label: 'Global' },
      { key: 'difficulty', label: 'KD' },
    ]
    out.push(
      table(
        cols.map((c) => c.label),
        p.rows.map((r) => cols.map((c) => r[c.key])),
      ),
    )
  }
  if (name === 'SerpLadder') {
    out.push(
      `Results for "${p.keyword}"${p.volume ? ` (${fmt(p.volume)} US searches a month)` : ''}:`,
      '',
      table(
        ['Position', 'Site', 'DR', 'Type'],
        p.rows.map((r) => [r.position, r.domain, r.dr ?? '', r.tag || '']),
      ),
    )
    if (p.target && !p.rows.some((r) => r.domain === p.target))
      out.push('', `**${p.target}: not ranking in these results.**`)
  }
  if (name === 'PageGrid')
    out.push(
      table(
        ['Kind of page', 'Pages', p.litLabel || 'Lit', 'Notes'],
        p.groups.map((g) => [
          g.label,
          g.pages.length,
          g.pages.filter((x) => x.lit).length,
          g.pages
            .filter((x) => x.note)
            .map((x) => `${x.name}: ${x.note}`)
            .join('; '),
        ]),
      ),
    )
  if (name === 'TrafficMap') {
    const total = p.items.reduce((a, b) => a + b.value, 0)
    out.push(
      table(
        ['Pages', p.unit || 'Visits', 'Share', 'Note'],
        p.items.map((i) => [
          i.tone === 'sells' ? `**${i.label}**` : i.label,
          i.value,
          `${Math.round((i.value / total) * 100) || '<1'}%`,
          i.note || '',
        ]),
      ),
    )
  }
  if (name === 'UrlMap')
    out.push(
      table(
        ['Address', 'Action', 'Note'],
        p.rows.map((r) => [
          '`' + r.url + '`',
          r.action + (r.to ? ` to \`${r.to}\`` : ''),
          r.note || '',
        ]),
      ),
    )
  if (name === 'BeforeAfter')
    out.push(
      `*${p.before.label}*`,
      '',
      strip(p.before.html || p.before.code || ''),
      '',
      `*${p.after.label}*`,
      '',
      strip(p.after.html || p.after.code || ''),
    )
  if (name === 'SearchResult')
    for (const side of [p.before, p.after].filter(Boolean))
      out.push(
        `*${side.label || (side === p.before && p.after ? 'Today' : 'After the fix')}*`,
        '',
        `> **${side.title}**  `,
        `> ${side.url}  `,
        `> ${side.description}`,
        '',
      )
  if (name === 'TitleSheet')
    out.push(
      table(
        ['Page', 'Title', 'Characters', 'Fix'],
        p.rows.map((r) => [
          '`' + r.page + '`',
          r.title,
          r.title.length,
          r.after || 'Keep',
        ]),
      ),
    )
  if (name === 'BrowserFrame')
    out.push(
      `> **Tab:** ${p.tab}  `,
      `> **Address:** ${p.url}${p.status ? ` (${p.status})` : ''}  `,
      `> ${strip(inner).replace(/\n+/g, ' ')}`,
    )
  if (name === 'PlanSteps')
    out.push(
      p.steps
        .map(
          (s, i) =>
            `${i + 1}. **${s.marker ? s.marker + ': ' : ''}${s.title}.** ${s.body}`,
        )
        .join('\n'),
    )
  if (name === 'Exhibit' || name === 'Callout') out.push(inner.trim())
  out.push('', `*(Interactive in the post: ${name})*`)
  return out.join('\n')
}
const NAMES =
  'TrafficMap|UrlMap|StatCards|VerticalBars|TrafficCurve|CompareBars|KeywordTable|SerpLadder|PageGrid|BeforeAfter|SearchResult|TitleSheet|BrowserFrame|PlanSteps|Exhibit|Callout'
body = body.replace(
  new RegExp(`<(${NAMES})\\b([\\s\\S]*?)(?:/>|>([\\s\\S]*?)</\\1>)`, 'g'),
  (_, n, a, inner) => render(n, props(a.replace(/>$/, '')), inner || ''),
)
body = body.replace(/\]\(\/(?!\/)/g, '](https://seoskill.dev/')
body = body.replace(/^\*\*true\*\*\n/gm, '').replace(/\n{3,}/g, '\n\n')
console.log(
  `# ${meta.heading}\n\n*${meta.lead}*\n\n> Draft. Title tag: ${meta.title}. Description: ${meta.description} Exhibits are shown as tables here; in the post each one is interactive.\n\n${body.trim()}\n`,
)
