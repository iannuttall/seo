import {
  defaultPreset,
  formatFromPath,
  LINT_CATEGORIES,
  LINT_MAX_CHARS,
  type LintCategory,
  type LintFileResult,
  type LintFormat,
  type LintPreset,
  lintReportText,
  lintText,
} from '../lint/index.js'
import { CommandError, type CommandResult } from './types.js'

// seo lint: checks copy for patterns common in AI-written text, weak copy and
// SEO length rules. Runs offline on text; the CLI and the local MCP also read
// files from paths.

// note says where the text came from; partial says what part of it was not
// read, so the result is not an all-clear.
export type LintSource =
  | { path: string; text: string; note?: string; partial?: string }
  | { path: string; skipped: string }

export type LintInput = {
  text?: string
  paths?: string[]
  format?: LintFormat
  preset?: LintPreset
  ignoreRules?: string[]
  ignorePhrases?: string[]
  // Check only these categories, such as ai for AI writing patterns.
  only?: LintCategory[]
}

export async function runLint(
  input: LintInput,
  // Reads files on this machine. Only the CLI and the local MCP have it.
  readFiles?: (paths: string[]) => Promise<LintSource[]>,
): Promise<CommandResult> {
  const hasText = typeof input.text === 'string' && input.text.length > 0
  const hasPaths = Boolean(input.paths?.length)
  if (hasText === hasPaths) {
    throw new CommandError(
      'INVALID_INPUT',
      readFiles
        ? 'Send text, or paths to files on this machine, but not both.'
        : 'Send the copy to check as text.',
    )
  }
  if (hasPaths && !readFiles) {
    throw new CommandError(
      'INVALID_INPUT',
      'This server cannot read files. Send the copy as text, or run `seo lint <files>` in the CLI.',
    )
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
    : await (readFiles as NonNullable<typeof readFiles>)(input.paths ?? [])
  const files: LintFileResult[] = sources.map((source) => {
    if ('skipped' in source) return source
    const format =
      input.format ?? (hasPaths ? formatFromPath(source.path) : 'md')
    return {
      path: source.path,
      ...(source.note ? { note: source.note } : {}),
      ...(source.partial ? { partial: source.partial } : {}),
      result: lintText(source.text, {
        format,
        preset: input.preset ?? defaultPreset(format),
        ignoreRules: input.ignoreRules,
        ignorePhrases: input.ignorePhrases,
        only,
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
