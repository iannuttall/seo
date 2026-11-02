import { ACTIVE_SQL } from './billing.ts'

// Beta features, granted one account at a time by a maintainer
// (scripts/beta.mjs). A granted account sees the feature on its account page
// and in the tools; every other account sees nothing of it. A paid weekly
// audit (billing.ts) grants weekly-audit too.

export const BETA = {
  'weekly-audit': {
    title: 'Weekly site audit',
    text: 'Crawls your sites every week, checks Google indexing every day, and adds what is new since last week to the report and seo index.',
  },
  // For the maintainer's own accounts: the weekly audit on up to 100 sites
  // without a plan.
  'unlimited-sites': {
    title: 'Sites without a plan',
    text: 'The weekly site audit runs on up to 100 of your sites at no charge.',
  },
} as const

export type BetaFlag = keyof typeof BETA

const isFlag = (flag: string): flag is BetaFlag => Object.hasOwn(BETA, flag)

// SQL that is true when the account in column has the weekly audit: the
// beta flag (or unlimited-sites), or a paid subscription that is still active.
export const hasWeeklyAudit = (column: string) =>
  `(EXISTS (SELECT 1 FROM beta_flags f WHERE f.user_id = ${column} AND f.flag IN ('weekly-audit', 'unlimited-sites'))
    OR EXISTS (SELECT 1 FROM billing b WHERE b.user_id = ${column} AND b.status IN ${ACTIVE_SQL}))`

// The account's beta flags, from one query. Unknown flags are ignored.
export async function betaFlags(
  env: Env,
  userId: string,
): Promise<ReadonlySet<BetaFlag>> {
  const rows = await env.DB.prepare(
    `SELECT flag FROM beta_flags WHERE user_id = ?1
     UNION SELECT 'weekly-audit' FROM billing WHERE user_id = ?1 AND status IN ${ACTIVE_SQL}
     UNION SELECT 'weekly-audit' FROM beta_flags WHERE user_id = ?1 AND flag = 'unlimited-sites'`,
  )
    .bind(userId)
    .all<{ flag: string }>()
  return new Set(rows.results.map((row) => row.flag).filter(isFlag))
}
