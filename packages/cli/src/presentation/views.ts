import { type TerminalContext, visibleWidth, wrapText } from './context.js'

export type CheckView = {
  detail: string
  fix?: string
  label: string
  status: 'pass' | 'warn' | 'fail'
}

export type CatalogItemView = {
  category: string
  id: string
  name: string
}

function plural(count: number, singular: string, multiple = `${singular}s`) {
  return count === 1 ? singular : multiple
}

function indented(value: string, indent: number, width: number): string[] {
  const prefix = ' '.repeat(indent)
  return wrapText(value, Math.max(1, width - indent)).map(
    (line) => `${prefix}${line}`,
  )
}

export function renderHeading(
  title: string,
  context: TerminalContext,
  summary?: string,
): string {
  return [
    context.colors.bold(title),
    ...(summary ? wrapText(summary, context.columns) : []),
  ].join('\n')
}

export function renderChecks(
  checks: CheckView[],
  context: TerminalContext,
): string {
  const styles = {
    pass: context.colors.green,
    warn: context.colors.yellow,
    fail: context.colors.red,
  }
  return checks
    .map((check) => {
      const status = styles[check.status](check.status.toUpperCase().padEnd(4))
      const lines = [`${status}  ${context.colors.bold(check.label)}`]
      lines.push(...indented(check.detail, 6, context.columns))
      if (check.fix) {
        const fixLines = wrapText(check.fix, Math.max(1, context.columns - 11))
        lines.push(
          ...fixLines.map(
            (line, index) =>
              `${' '.repeat(6)}${index === 0 ? `${context.colors.bold('Fix')}  ` : '     '}${line}`,
          ),
        )
      }
      return lines.join('\n')
    })
    .join('\n\n')
}

export function checkSummary(checks: CheckView[]): string {
  const passed = checks.filter((check) => check.status === 'pass').length
  const warnings = checks.filter((check) => check.status === 'warn').length
  const failed = checks.filter((check) => check.status === 'fail').length
  return `${passed} ${plural(passed, 'check')} passed, ${warnings} ${plural(warnings, 'warning')}, ${failed} failed.`
}

function renderCatalogItem(
  item: CatalogItemView,
  idWidth: number,
  context: TerminalContext,
): string {
  const gap = 2
  const nameWidth = context.columns - idWidth - gap - 2
  if (nameWidth < 24 || visibleWidth(item.id) > idWidth) {
    return [
      `  ${context.colors.cyan(item.id)}`,
      ...indented(item.name, 4, context.columns),
    ].join('\n')
  }
  const names = wrapText(item.name, nameWidth)
  return names
    .map((name, index) => {
      const id = index === 0 ? item.id.padEnd(idWidth) : ''.padEnd(idWidth)
      return `  ${context.colors.cyan(id)}${' '.repeat(gap)}${name}`
    })
    .join('\n')
}

export function renderCatalog(
  items: CatalogItemView[],
  context: TerminalContext,
  options: {
    categoryLabels?: Record<string, string>
    noun: string
  },
): string {
  const groups = new Map<string, CatalogItemView[]>()
  for (const item of items) {
    const group = groups.get(item.category) ?? []
    group.push(item)
    groups.set(item.category, group)
  }
  const intro = `${items.length} ${plural(items.length, options.noun)} across ${groups.size} ${plural(groups.size, 'category', 'categories')}.`
  const idWidth = Math.min(
    30,
    Math.max(...items.map((item) => visibleWidth(item.id)), 0),
  )
  const labelledCategories = Object.keys(options.categoryLabels ?? {}).filter(
    (category) => groups.has(category),
  )
  const remainingCategories = [...groups.keys()].filter(
    (category) => !labelledCategories.includes(category),
  )
  const sections = [...labelledCategories, ...remainingCategories].map(
    (category) => {
      const entries = groups.get(category) ?? []
      const label = options.categoryLabels?.[category] ?? category
      return [
        context.colors.bold(`${label} (${entries.length})`),
        ...entries.map((item) => renderCatalogItem(item, idWidth, context)),
      ].join('\n')
    },
  )
  return [intro, ...sections].join('\n\n')
}
