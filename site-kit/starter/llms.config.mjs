import parks from './src/data/parks.json' with { type: 'json' }
import config from './site.config.json' with { type: 'json' }

const regions = [...new Set(parks.map((park) => park.region))].sort()
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** @satisfies {import('@iannuttall/seo-graph-core').LlmsTxtConfig} */
export const llmsTxt = {
  title: config.name,
  summary: config.description,
  sections: [
    {
      heading: 'Start here',
      items: [
        { path: '/', label: config.name },
        { path: '/about', label: 'Where the data comes from' },
      ],
    },
    {
      heading: 'Regions',
      items: regions.map((region) => ({
        path: `/regions/${slug(region)}`,
        label: `Parks in ${region}`,
      })),
    },
    {
      heading: 'Parks',
      items: parks.map((park) => ({
        path: `/parks/${park.slug}`,
        label: park.name,
      })),
    },
  ],
}
