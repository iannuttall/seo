#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const SEARCH_ROOTS = ['README.md', 'skills', 'packages']
const EXTENSIONS = new Set(['.md', '.mdx', '.ts'])
const EM_DASH = '\u2014'

const collectFiles = async (relativePath) => {
  const absolutePath = path.join(REPO_ROOT, relativePath)
  const ext = path.extname(relativePath)
  if (EXTENSIONS.has(ext)) return [relativePath]

  let entries
  try {
    entries = await readdir(absolutePath, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return []
    throw err
  }

  const files = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? collectFiles(path.join(relativePath, entry.name))
        : EXTENSIONS.has(path.extname(entry.name))
          ? [path.join(relativePath, entry.name)]
          : [],
    ),
  )
  return files.flat()
}

const run = async () => {
  const files = (
    await Promise.all(SEARCH_ROOTS.map((root) => collectFiles(root)))
  ).flat()
  const violations = []

  for (const file of files) {
    const source = await readFile(path.join(REPO_ROOT, file), 'utf8')
    const hits = source
      .split('\n')
      .map((line, index) => ({ line, index: index + 1 }))
      .filter(({ line }) => line.includes(EM_DASH))
    if (hits.length) violations.push({ file, hits })
  }

  if (!violations.length) return

  console.error(`Em-dash found in ${violations.length} file(s):`)
  for (const { file, hits } of violations) {
    for (const hit of hits)
      console.error(`  ${file}:${hit.index} ${hit.line.trim()}`)
  }
  process.exit(1)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
