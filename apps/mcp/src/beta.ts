// Beta features, granted one account at a time by a maintainer
// (scripts/beta.mjs). A granted account sees the feature on its account page
// and in the tools; every other account sees nothing of it.

export const BETA = {
  'weekly-audit': {
    title: 'Weekly site audit',
    text: 'Crawls your sites every week, checks Google indexing every day, and adds what is new since last week to the report and seo index.',
  },
} as const

export type BetaFlag = keyof typeof BETA

const isFlag = (flag: string): flag is BetaFlag => Object.hasOwn(BETA, flag)

// The account's beta flags, from one query. Unknown flags are ignored.
export async function betaFlags(
  env: Env,
  userId: string,
): Promise<ReadonlySet<BetaFlag>> {
  const rows = await env.DB.prepare(
    'SELECT flag FROM beta_flags WHERE user_id = ?',
  )
    .bind(userId)
    .all<{ flag: string }>()
  return new Set(rows.results.map((row) => row.flag).filter(isFlag))
}
