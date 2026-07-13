import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(here, '..')
const sourceDir = path.resolve(
  process.argv[2] ?? '/Users/iannuttall/Downloads/pixelarticons-pro-2.2.0/svg',
)
const outputDir = path.join(webRoot, 'src/components/icons/pixelarticons')
const variantSuffix = /-(?:sharp|solid|glyph|sharpsolid)$/

const files = (await readdir(sourceDir))
  .filter((file) => file.endsWith('.svg'))
  .filter((file) => !variantSuffix.test(path.basename(file, '.svg')))
  .sort((a, b) => a.localeCompare(b))

await rm(outputDir, { recursive: true, force: true })
await mkdir(outputDir, { recursive: true })

for (const file of files) {
  const name = path.basename(file, '.svg')
  const source = await readFile(path.join(sourceDir, file), 'utf8')
  const body = source
    .replace(/^\s*<svg[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '')
    .trim()

  const component = `---
const { class: className, ...props } = Astro.props
---

<svg class={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
  ${body}
</svg>
`

  await writeFile(path.join(outputDir, `${name}.astro`), component)
}

console.log(`Generated ${files.length} base Pixelarticons Astro components.`)
