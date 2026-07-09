import { randomUUID } from 'node:crypto'
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path'
import {
  type OkfFile,
  type OkfValidationReport,
  SeoError,
  validateOkfFiles,
} from '@seo/core'

const markerName = '.seo-okf.json'
const marker = `${JSON.stringify({ generator: 'seo', format: 'okf', version: 1 })}\n`

function safeFilePath(root: string, filePath: string): string {
  const path = resolve(root, filePath)
  const fromRoot = relative(resolve(root), path)
  if (!fromRoot || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw new SeoError('INVALID_INPUT', `Unsafe OKF file path: ${filePath}`)
  }
  return path
}

async function writeFiles(root: string, files: OkfFile[]): Promise<void> {
  for (const file of files) {
    const path = safeFilePath(root, file.path)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, file.content)
  }
  await writeFile(join(root, markerName), marker)
}

export async function readOkfMarkdownFiles(root: string): Promise<OkfFile[]> {
  const files: OkfFile[] = []
  async function walk(dir: string, prefix = ''): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath, relative)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push({
          path: relative,
          content: await readFile(fullPath, 'utf8'),
        })
      }
    }
  }
  await walk(root)
  return files.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  )
}

async function assertReplaceable(path: string): Promise<boolean> {
  try {
    const stats = await lstat(path)
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new SeoError(
        'INVALID_INPUT',
        `OKF output must be a real directory: ${path}`,
      )
    }
    const entries = await readdir(path)
    if (!entries.length) return true
    try {
      const value = await readFile(join(path, markerName), 'utf8')
      if (value === marker) return true
    } catch {
      // The directory is not managed by seo.
    }
    throw new SeoError(
      'INVALID_INPUT',
      `Refusing to replace non-empty unmanaged directory: ${path}`,
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export async function writeOkfDirectory(
  output: string,
  files: OkfFile[],
): Promise<OkfValidationReport> {
  const validation = validateOkfFiles(files)
  if (!validation.valid) {
    throw new SeoError(
      'INVALID_INPUT',
      'Generated bundle did not pass seo OKF checks and was not written.',
    )
  }
  const target = resolve(output)
  const parent = dirname(target)
  await mkdir(parent, { recursive: true })
  const existed = await assertReplaceable(target)
  const staging = await mkdtemp(join(parent, `.${basename(target)}-staging-`))
  const backup = join(parent, `.${basename(target)}-backup-${randomUUID()}`)
  let movedExisting = false
  try {
    await writeFiles(staging, files)
    const diskValidation = validateOkfFiles(await readOkfMarkdownFiles(staging))
    if (!diskValidation.valid) {
      throw new SeoError(
        'INTERNAL_ERROR',
        'Staged OKF files failed validation after writing.',
      )
    }
    if (existed) {
      await rename(target, backup)
      movedExisting = true
    }
    await rename(staging, target)
    if (movedExisting) await rm(backup, { recursive: true, force: true })
    return diskValidation
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    if (movedExisting) {
      await rm(target, { recursive: true, force: true })
      await rename(backup, target)
    }
    throw error
  }
}
