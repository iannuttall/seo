import type { APIRoute } from 'astro'
import { getBlogPosts } from '@/lib/blog'
import { site } from '@/lib/site'
import { canonicalUrl } from '@/lib/urls'

// The blog's RSS 2.0 feed, built with the site. Same posts and order as the
// /blog index: published only, newest first.

/** Escapes element text. Quotes stay as they are, since HTML readers show `&apos;` as written. */
function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** RFC 822 date for a YYYY-MM-DD date, read as a UTC calendar day. */
function rfc822(date: string): string {
  return new Date(`${date}T00:00:00Z`).toUTCString()
}

export const GET: APIRoute = async () => {
  const posts = await getBlogPosts()
  const blogUrl = canonicalUrl('/blog')
  const items = posts.map((post) => {
    const url = canonicalUrl(`/blog/${post.id}`)
    return `    <item>
      <title>${escapeXml(post.data.heading)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${escapeXml(post.data.lead)}</description>
      <pubDate>${rfc822(post.data.date)}</pubDate>
    </item>`
  })
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(`${site.name} blog`)}</title>
    <link>${blogUrl}</link>
    <description>Practical guides to getting found in Google and AI answers, built on real search data.</description>
    <language>en-gb</language>
    <atom:link href="${canonicalUrl('/rss.xml')}" rel="self" type="application/rss+xml" />
${items.join('\n')}
  </channel>
</rss>
`
  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
}
