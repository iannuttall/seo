import { reportIds } from '@/content/reports/manifest.mjs'

export const site = {
  name: 'SEO Skill',
  packageName: 'seo',
  url: 'https://seoskill.dev',
  description: `Give your agent ${reportIds.length} SEO reports that run locally across crawling, Search Console, Google Analytics, keyword research, competitors, programmatic SEO, AI search, and monitoring.`,
  repository: 'https://github.com/iannuttall/seo',
  issues: 'https://github.com/iannuttall/seo/issues',
  advisory: 'https://github.com/iannuttall/seo/security/advisories/new',
  npm: 'https://www.npmjs.com/package/seo',
  clickySiteId: '101508763',
} as const
