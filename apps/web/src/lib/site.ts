import { reportIds } from '@/content/reports/manifest.mjs'

export const site = {
  name: 'SEO Skill',
  packageName: 'seo',
  url: 'https://seoskill.dev',
  description: `Run local SEO audits with your agent using ${reportIds.length} reports across crawling, Search Console, Google Analytics, keyword research, competitors, AI search, and monitoring.`,
  repository: 'https://github.com/iannuttall/seo',
  issues: 'https://github.com/iannuttall/seo/issues',
  advisory: 'https://github.com/iannuttall/seo/security/advisories/new',
  npm: 'https://www.npmjs.com/package/seo',
  clickySiteId: '101508763',
} as const
