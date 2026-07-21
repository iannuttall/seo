import { readFile, stat } from 'node:fs/promises'
import { type ClientProfile, SeoError } from '@seo/core'
import { jsonFlag, projectArg, stringArg } from '../../../args.js'
import { resolveClient } from '../../../selection.js'

export const keywordSetProjectArgs = {
  project: { type: 'string', description: 'Saved project id or name.' },
  client: { type: 'string', description: 'Legacy alias for --project.' },
} as const

export const keywordSetJsonArg = {
  type: 'boolean' as const,
  default: false,
  description: 'Print machine-readable JSON.',
}

export async function selectedProject(
  args: Record<string, unknown>,
): Promise<ClientProfile> {
  const project = await resolveClient({
    project: projectArg(args),
    options: { json: jsonFlag(args) },
  })
  if (!project) {
    throw new SeoError(
      'INVALID_INPUT',
      'Select a saved project with --project or make one the default.',
    )
  }
  return project
}

const MAX_KEYWORD_FILE_BYTES = 100_000

export async function keywordInputs(
  args: Record<string, unknown>,
): Promise<string[]> {
  const keyword = stringArg(args.keyword)
  const keywords = stringArg(args.keywords)
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const file = stringArg(args.file)
  const values = [...(keyword ? [keyword] : []), ...(keywords ?? [])]
  if (file) {
    const info = await stat(file).catch(() => undefined)
    if (!info?.isFile() || info.size > MAX_KEYWORD_FILE_BYTES) {
      throw new SeoError(
        'INVALID_INPUT',
        'Keyword files must be regular files no larger than 100 KB.',
      )
    }
    values.push(
      ...(await readFile(file, 'utf8'))
        .split(/\r?\n/u)
        .map((value) => value.trim())
        .filter(Boolean),
    )
  }
  if (values.length === 0) {
    throw new SeoError(
      'INVALID_INPUT',
      'Pass --keyword, comma-separated --keywords, or a newline-delimited --file.',
    )
  }
  return values
}
