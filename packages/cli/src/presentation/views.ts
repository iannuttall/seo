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

export type SummaryItemView = {
  description?: string
  meta?: string[]
  title: string
}

export type ParameterView = {
  description?: string
  name: string
  required: boolean
  type: string
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
      ...indented(item.id, 2, context.columns).map((line) =>
        context.colors.cyan(line),
      ),
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

function categoryLabel(category: string): string {
  const value = category.replaceAll('-', ' ')
  return value.charAt(0).toUpperCase() + value.slice(1)
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
      const label =
        options.categoryLabels?.[category] ?? categoryLabel(category)
      return [
        context.colors.bold(`${label} (${entries.length})`),
        ...entries.map((item) => renderCatalogItem(item, idWidth, context)),
      ].join('\n')
    },
  )
  return [intro, ...sections].join('\n\n')
}

export function renderSummaryList(
  items: SummaryItemView[],
  context: TerminalContext,
  options: { empty: string },
): string {
  if (items.length === 0) return context.colors.dim(options.empty)

  return items
    .map((item) => {
      const lines = [context.colors.bold(item.title)]
      if (item.description) {
        lines.push(...indented(item.description, 2, context.columns))
      }
      const meta = item.meta?.filter(Boolean).join(' · ')
      if (meta) {
        lines.push(
          ...indented(meta, 2, context.columns).map((line) =>
            context.colors.dim(line),
          ),
        )
      }
      return lines.join('\n')
    })
    .join('\n\n')
}

export function renderSection(
  title: string,
  paragraphs: readonly string[],
  context: TerminalContext,
): string {
  const body = paragraphs
    .filter((paragraph) => paragraph.trim().length > 0)
    .flatMap((paragraph) => wrapText(paragraph, context.columns))
  return [context.colors.bold(title), ...body].join('\n')
}

export function renderBulletSection(
  title: string,
  items: readonly string[],
  context: TerminalContext,
): string {
  const body = items.flatMap((item) => {
    const wrapped = wrapText(item, Math.max(1, context.columns - 2))
    return wrapped.map((line, index) => `${index === 0 ? '- ' : '  '}${line}`)
  })
  return [context.colors.bold(title), ...body].join('\n')
}

export function renderParameters(
  parameters: ParameterView[],
  context: TerminalContext,
): string {
  if (parameters.length === 0) {
    return context.colors.dim('No parameters.')
  }

  return renderSummaryList(
    parameters.map((parameter) => ({
      title: parameter.name,
      description: parameter.description,
      meta: [parameter.type, parameter.required ? 'required' : 'optional'],
    })),
    context,
    { empty: 'No parameters.' },
  )
}
