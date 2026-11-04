import {
  defaultPreset,
  formatFromPath,
  LINT_MAX_CHARS,
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

export type LintSource =
  | { path: string; text: string }
  | { path: string; skipped: string }

export type LintInput = {
  text?: string
  paths?: string[]
  format?: LintFormat
  preset?: LintPreset
  ignoreRules?: string[]
  ignorePhrases?: string[]
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
  const sources: LintSource[] = hasText
    ? [{ path: 'text', text: input.text as string }]
    : await (readFiles as NonNullable<typeof readFiles>)(input.paths ?? [])
  const files: LintFileResult[] = sources.map((source) => {
    if ('skipped' in source) return source
    const format =
      input.format ?? (hasText ? 'md' : formatFromPath(source.path))
    return {
      path: source.path,
      result: lintText(source.text, {
        format,
        preset: input.preset ?? defaultPreset(format),
        ignoreRules: input.ignoreRules,
        ignorePhrases: input.ignorePhrases,
      }),
    }
  })
  return {
    text: lintReportText(files),
    data: {
      files: files.map((file) =>
        'skipped' in file ? file : { path: file.path, ...file.result },
      ),
      errors: files.reduce(
        (sum, file) => sum + ('result' in file ? file.result.errors : 0),
        0,
      ),
      warnings: files.reduce(
        (sum, file) => sum + ('result' in file ? file.result.warnings : 0),
        0,
      ),
      review: files.reduce(
        (sum, file) => sum + ('result' in file ? file.result.review.length : 0),
        0,
      ),
    },
  }
}
