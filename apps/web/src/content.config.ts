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
}
