// Published blog paths for the sitemap, llms.txt and the site tests, read
// straight from the MDX files because those run outside Astro. A post with
// `draft: true` in its frontmatter is left out. With no published post the
// list is empty, so the empty /blog page stays out of both files.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const blogDirectory = fileURLToPath(new URL('./blog', import.meta.url))

/** @returns {string[]} '/blog' then each post path, newest first. */
export function publishedBlogPaths() {
  if (!existsSync(blogDirectory)) return []
  const posts = readdirSync(blogDirectory)
    .filter((file) => file.endsWith('.mdx'))
    .map((file) => {
      const source = readFileSync(`${blogDirectory}/${file}`, 'utf8')
      const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ''
      return {
        path: `/blog/${file.replace(/\.mdx$/, '')}`,
        date: frontmatter.match(/^date:\s*['"]?([\d-]+)/m)?.[1] ?? '',
        draft: /^draft:\s*true\s*$/m.test(frontmatter),
      }
    })
    .filter((post) => !post.draft)
    .sort(
      (a, b) => b.date.localeCompare(a.date) || a.path.localeCompare(b.path),
    )
  return posts.length > 0 ? ['/blog', ...posts.map((post) => post.path)] : []
}
