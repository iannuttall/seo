import { glob, readdir, readFile, stat } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import type { LintSource } from '../commands/lint.js'
import { SeoError } from '../errors.js'
import { LINT_MAX_CHARS } from './types.js'

// Reads files for seo lint on this machine (the CLI and the local MCP).
// Paths, folders and globs are expanded and counted before any file is read.

export const LINT_MAX_FILES = 100
// A file bigger than this is skipped, not cut short: UTF-8 can take up to
// four bytes a character, so this is the most that can still fit.
const MAX_BYTES = LINT_MAX_CHARS * 4
const EXTENSIONS = new Set([
  '.md',
  '.mdx',
  '.markdown',
  '.html',
  '.htm',
  '.astro',
  '.txt',
])
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.astro', '.next'])

function tooMany(): SeoError {
  return new SeoError(
    'INVALID_INPUT',
    `More than ${LINT_MAX_FILES} files match. Point seo lint at fewer files or a smaller folder.`,
  )
}

async function walk(dir: string, found: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.isDirectory()) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(path, found)
    } else if (EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      found.push(path)
    }
    if (found.length > LINT_MAX_FILES) throw tooMany()
  }
}

export async function lintPaths(
  inputs: string[],
  cwd = process.cwd(),
): Promise<string[]> {
  const found: string[] = []
  for (const input of inputs) {
    if (/[*?[{]/.test(input)) {
      const matches: string[] = []
      for await (const match of glob(input, { cwd })) {
        matches.push(resolve(cwd, match))
        if (found.length + matches.length > LINT_MAX_FILES) throw tooMany()
      }
      found.push(...matches.sort())
      continue
    }
    const path = resolve(cwd, input)
    const info = await stat(path).catch(() => null)
    if (!info) {
      throw new SeoError('INVALID_INPUT', `No file or folder at ${input}.`)
    }
    if (info.isDirectory()) await walk(path, found)
    else found.push(path)
    if (found.length > LINT_MAX_FILES) throw tooMany()
  }
  return [...new Set(found)]
}

export async function readLintFiles(
  inputs: string[],
  cwd = process.cwd(),
): Promise<LintSource[]> {
  const paths = await lintPaths(inputs, cwd)
  if (!paths.length) {
    throw new SeoError(
      'INVALID_INPUT',
      'No Markdown, MDX, HTML, Astro or text files match.',
    )
  }
  const sources: LintSource[] = []
  for (const path of paths) {
    const shown = relative(cwd, path) || path
    const label = shown.startsWith('..') ? path : shown
    const info = await stat(path)
    if (info.size > MAX_BYTES) {
      sources.push({
        path: label,
        skipped: `It is ${Math.round(info.size / 1000).toLocaleString('en-US')} KB; seo lint reads files up to ${LINT_MAX_CHARS / 1000} KB of text.`,
      })
      continue
    }
    const text = await readFile(path, 'utf8')
    if (text.length > LINT_MAX_CHARS) {
      sources.push({
        path: label,
        skipped: `It has ${text.length.toLocaleString('en-US')} characters; seo lint reads up to ${LINT_MAX_CHARS.toLocaleString('en-US')}.`,
      })
      continue
    }
    sources.push({ path: label, text })
  }
  return sources
}
