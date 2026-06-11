import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { type CsvFile, countLabel, renderCsv } from '@seo/core'
import { reportFetchArgs } from '../reports/args.js'

const { json: _json, ...reportFetchArgsWithoutJson } = reportFetchArgs

export const exportReportFetchArgs = reportFetchArgsWithoutJson

export const exportSelectionArgs = {
  client: {
    type: 'string',
    description: 'Legacy alias for --project.',
  },
  project: {
    type: 'string',
    description:
      'Saved project id or name. Defaults to the configured default.',
  },
  site: {
    type: 'string',
    description: 'GSC property URL/id when not using a saved project.',
  },
} as const

export function outArg(report: string) {
  return {
    type: 'string',
    description: `Output folder. Defaults to ./seo-export/<project>-${report}-YYYY-MM-DD.`,
  } as const
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/^sc-domain:/, '')
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function defaultOutDir(input: {
  report: string
  clientId?: string
  site: string
}) {
  const day = new Date().toISOString().slice(0, 10)
  const id = slug(input.clientId ?? input.site)
  return resolve(process.cwd(), 'seo-export', `${id}-${input.report}-${day}`)
}

export async function writeCsvFiles(outDir: string, files: CsvFile[]) {
  await mkdir(outDir, { recursive: true })
  const written: string[] = []
  for (const file of files) {
    const path = resolve(outDir, file.filename)
    await writeFile(path, renderCsv(file.rows, file.headers), 'utf8')
    written.push(path)
  }
  return written
}

export function printWritten(outDir: string, files: string[]) {
  process.stdout.write(
    `Wrote ${countLabel(files.length, 'CSV file')} to ${outDir}\n`,
  )
  for (const file of files) {
    process.stdout.write(`- ${file}\n`)
  }
}
