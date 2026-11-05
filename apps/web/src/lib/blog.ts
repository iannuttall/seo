import { type CollectionEntry, getCollection } from 'astro:content'
import { isPostLive } from '@/content/blog-posts.mjs'

export type BlogPost = CollectionEntry<'blog'>

/**
 * Blog posts newest first. Drafts, and posts whose date hasn't reached 09:00
 * UK time, show only in `astro dev`, so a production build has no page, card
 * or footer link for them.
 */
export async function getBlogPosts(): Promise<BlogPost[]> {
  const posts = await getCollection(
    'blog',
    ({ data }) => import.meta.env.DEV || (!data.draft && isPostLive(data.date)),
  )
  return posts.sort(
    (a, b) =>
      b.data.date.localeCompare(a.data.date) || a.id.localeCompare(b.id),
  )
}

/** "4 November 2026" from a YYYY-MM-DD date, read as a calendar day. */
export function formatPostDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
