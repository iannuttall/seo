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

/**
 * Up to `count` other posts for the end of `entry`: the posts after it in its
 * topic, oldest first and wrapping round, so every post in a topic gets links
 * from its siblings instead of the newest few getting them all. A topic with
 * too few posts is filled from the posts after it across the blog.
 */
export function relatedPosts(
  posts: BlogPost[],
  entry: BlogPost,
  count = 4,
): BlogPost[] {
  const oldestFirst = [...posts].reverse()
  const after = (list: BlogPost[]) => {
    const start = list.findIndex((post) => post.id === entry.id)
    return [...list.slice(start + 1), ...list.slice(0, start)]
  }
  const sameTopic = after(
    oldestFirst.filter(
      (post) => post.data.topic === entry.data.topic || post.id === entry.id,
    ),
  )
  const rest = after(oldestFirst).filter(
    (post) => post.data.topic !== entry.data.topic,
  )
  return [...sameTopic, ...rest].slice(0, count)
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
