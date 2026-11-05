import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

export const collections = {
  docs: defineCollection({
    loader: glob({
      pattern: '**/*.{md,mdx}',
      base: './src/content/docs',
    }),
    schema: z.object({
      title: z.string(),
      description: z.string(),
      heading: z.string().optional(),
      lead: z.string().optional(),
    }),
  }),
  // Framework guides at /guides/<file name>. `checked` is the date the code
  // and sources were last tested.
  guides: defineCollection({
    loader: glob({
      pattern: '*.mdx',
      base: './src/content/guides',
    }),
    schema: z.object({
      title: z.string(),
      description: z.string(),
      heading: z.string(),
      lead: z.string(),
      checked: z.string(),
    }),
  }),
  // Blog posts at /blog/<file name>. Dates are YYYY-MM-DD, and a post goes
  // live at 09:00 UK time on its date. A draft or a future post renders in
  // `astro dev` only; src/lib/blog.ts and src/content/blog-posts.mjs keep it
  // out of the build, the index, the sitemap and llms.txt.
  blog: defineCollection({
    loader: glob({
      pattern: '*.mdx',
      base: './src/content/blog',
    }),
    schema: z.object({
      title: z.string(),
      description: z.string(),
      heading: z.string(),
      lead: z.string(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      updated: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      company: z.string().optional(),
      // The account to tag in the launch post on X, without the @, read from
      // the company's own site. A founder's handle when the founder is the
      // brand and there is no company account.
      x: z.object({ company: z.string().regex(/^[A-Za-z0-9_]{1,15}$/) }).optional(),
      // The post's illustration, at public/blog/covers/<file name>.webp
      // (1200 by 630). It tops the post and becomes its sharing card, with
      // the heading drawn over it. Without one the post gets the plain card.
      // Set `title: left` when the art's subject stands on the right.
      cover: z
        .object({ alt: z.string(), title: z.enum(['center', 'left']).default('center') })
        .optional(),
      draft: z.boolean().default(false),
    }),
  }),
}
