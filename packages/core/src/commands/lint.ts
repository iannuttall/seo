import {
  defaultPreset,
  formatFromPath,
  LINT_CATEGORIES,
  LINT_MAX_CHARS,
  type LintCategory,
  type LintFileResult,
  type LintFormat,
  type LintMetaKind,
  type LintPreset,
  lintReportText,
  lintText,
} from '../lint/index.js'
import { CommandError, type CommandResult, type PageMarkdown } from './types.js'

// seo lint: checks copy for patterns common in AI-written text, weak copy and
// SEO length rules. Runs offline on text; the CLI and the local MCP also read
// files from paths and the main content of a live page from a URL.

// note says where the text came from; partial says what part of it was not
// read, so the result is not an all-clear.
export type LintSource =
  | { path: string; text: string; note?: string; partial?: string }
  | { path: string; skipped: string }

export type LintInput = {
  text?: string
  paths?: string[]
  // A live page: its main content, extracted as Markdown, is checked.
  url?: string
  format?: LintFormat
  preset?: LintPreset
  ignoreRules?: string[]
  ignorePhrases?: string[]
  // Check only these categories, such as ai for AI writing patterns.
  only?: LintCategory[]
  // With the meta preset: what a line with no "title:" or "description:"
  // label is.
  metaKind?: LintMetaKind
}

// One live page's main content as a lint source. A page that cannot be read
// is not checked; Markdown cut short is partly checked.
async function pageSource(
  url: string,
  readPage: (url: string) => Promise<PageMarkdown>,
): Promise<LintSource> {
  const page = await readPage(url).catch(
    (error: unknown): PageMarkdown => ({
      error: error instanceof Error ? error.message : String(error),
    }),
  )
  if ('error' in page) {
    return { path: url, skipped: `The page could not be read (${page.error}).` }
  }
  if (!page.markdown) {
    return { path: url, skipped: 'The page has no main content to read.' }
  }
  return {
    path: url,
    text: page.markdown,
    note: 'Checked the main content extracted from the live page (the Markdown `seo page --detail full` shows), not the whole HTML.',
    ...(page.truncated
      ? {
          partial: `the main content has ${page.characters.toLocaleString('en-US')} characters; the first ${page.markdown.length.toLocaleString('en-US')} were checked.`,
        }
      : {}),
  }
}

export async function runLint(
  input: LintInput,
  // Reads files on this machine. Only the CLI and the local MCP have it.
  readFiles?: (paths: string[]) => Promise<LintSource[]>,
  // Reads a live page's main content. Only the CLI and the local MCP have it.
  readPage?: (url: string) => Promise<PageMarkdown>,
): Promise<CommandResult> {
  const hasText = typeof input.text === 'string' && input.text.length > 0
  const hasPaths = Boolean(input.paths?.length)
  const hasUrl = typeof input.url === 'string' && input.url.length > 0
  if ([hasText, hasPaths, hasUrl].filter(Boolean).length !== 1) {
    throw new CommandError(
      'INVALID_INPUT',
      readFiles
        ? 'Send one of text, paths to files on this machine, or a url.'
        : 'Send the copy to check as text, or a url.',
    )
  }
  if (hasPaths && !readFiles) {
    throw new CommandError(
      'INVALID_INPUT',
      'This server cannot read files. Send the copy as text, or run `seo lint <files>` in the CLI.',
    )
  }
  if (hasUrl) {
    if (!/^https?:\/\/[^\s/]+/i.test(input.url as string)) {
      throw new CommandError(
        'INVALID_INPUT',
        'url is a full http or https address, such as https://example.com/page.',
      )
    }
    if (!readPage) {
      throw new CommandError(
        'INVALID_INPUT',
        `This server cannot read live pages. Run \`seo lint --url ${input.url}\` in the CLI or the local MCP server, or send the page copy as text.`,
      )
    }
    if (input.format && input.format !== 'md') {
      throw new CommandError(
        'INVALID_INPUT',
        'A url is checked as the Markdown of its main content, so format is md or left out.',
      )
    }
  }
  if (hasText && (input.text as string).length > LINT_MAX_CHARS) {
    throw new CommandError(
      'INVALID_INPUT',
      `text is ${(input.text as string).length.toLocaleString('en-US')} characters; the most one check reads is ${LINT_MAX_CHARS.toLocaleString('en-US')}. Send one page at a time.`,
    )
  }
  const only = input.only?.length
    ? LINT_CATEGORIES.filter((category) => input.only?.includes(category))
    : undefined
  const sources: LintSource[] = hasText
    ? [{ path: 'text', text: input.text as string }]
    : hasUrl
      ? [
          await pageSource(
            input.url as string,
            readPage as NonNullable<typeof readPage>,
          ),
        ]
      : await (readFiles as NonNullable<typeof readFiles>)(input.paths ?? [])
  const files: LintFileResult[] = sources.map((source) => {
    if ('skipped' in source) return source
    // Text given with the meta preset is one title or description a line.
    const format =
      input.format ??
      (hasPaths
        ? formatFromPath(source.path)
        : hasText && input.preset === 'meta'
          ? 'text'
          : 'md')
    return {
      path: source.path,
      ...(source.note ? { note: source.note } : {}),
      ...(source.partial ? { partial: source.partial } : {}),
      result: lintText(source.text, {
        format,
        // A page's main content reads as an article, so it gets the blog
        // preset, as Markdown does.
        preset: input.preset ?? defaultPreset(format),
        ignoreRules: input.ignoreRules,
        ignorePhrases: input.ignorePhrases,
        only,
        metaKind: input.metaKind,
      }),
    }
  })
  const checked = files.flatMap((file) => ('result' in file ? [file] : []))
  const total = (count: (file: (typeof checked)[number]) => number) =>
    checked.reduce((sum, file) => sum + count(file), 0)
  return {
    text: lintReportText(files),
    data: {
      files: files.map((file) =>
        'skipped' in file
          ? file
          : {
              path: file.path,
              ...(file.note ? { note: file.note } : {}),
              ...(file.partial ? { partial: file.partial } : {}),
              ...file.result,
            },
      ),
      errors: total((file) => file.result.errors),
      warnings: total((file) => file.result.warnings),
      review: total((file) => file.result.review.length),
      checked: checked.length,
      skipped: files.length - checked.length,
      partial: checked.filter((file) => file.partial).length,
      categories: Object.fromEntries(
        LINT_CATEGORIES.map((category) => [
          category,
          total((file) => file.result.categories[category]),
        ]),
      ),
      ...(only ? { only } : {}),
    },
  }
}
