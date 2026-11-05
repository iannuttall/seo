// Published blog paths for the sitemap, llms.txt and the site tests, read
// straight from the MDX files because those run outside Astro. A post with
// `draft: true` in its frontmatter is left out, and so is a post whose date
// hasn't reached 09:00 UK time yet. With no published post the list is
// empty, so the empty /blog page stays out of both files.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const blogDirectory = fileURLToPath(new URL('./blog', import.meta.url))

/**
 * Whether a post dated `date` (YYYY-MM-DD) is live at `now`. Posts go live
 * at 09:00 UK time on their date, so a merged post with a future date stays
 * out of the build until a rebuild after then
 * (.github/workflows/scheduled-posts.yml).
 * @param {string} date
 * @param {Date} [now]
 */
export function isPostLive(date, now = new Date()) {
  const london = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(now)
    .replace(' ', 'T')
  return london >= `${date}T09:00`
}

/**
 * @param {Date} [now]
 * @returns {string[]} '/blog' then each post path, newest first.
 */
export function publishedBlogPaths(now = new Date()) {
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
    .filter((post) => !post.draft && isPostLive(post.date, now))
    .sort(
      (a, b) => b.date.localeCompare(a.date) || a.path.localeCompare(b.path),
    )
  return posts.length > 0 ? ['/blog', ...posts.map((post) => post.path)] : []
}
