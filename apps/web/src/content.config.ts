import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

export const collections = {
  docs: defineCollection({
    loader: glob({
      pattern: '**/*.{md,mdx}',
      base: './src/content/docs/docs',
    }),
    schema: z.object({
      title: z.string(),
      description: z.string(),
      heading: z.string().optional(),
      lead: z.string().optional(),
    }),
  }),
}
