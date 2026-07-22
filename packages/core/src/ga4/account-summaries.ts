import { z } from 'zod'

export const GA4_ACCOUNT_SUMMARY_PAGE_LIMIT = 20

export interface Ga4PropertySummary {
  property: string
  displayName?: string
  propertyType?: string
  parent?: string
}

export interface Ga4AccountSummary {
  account: string
  displayName?: string
  propertySummaries: Ga4PropertySummary[]
}

type Ga4AccountSummaryPage = {
  accountSummaries: Ga4AccountSummary[]
  nextPageToken?: string
}

const propertySummarySchema = z
  .object({
    property: z.string().trim().min(1),
    displayName: z.string().optional(),
    propertyType: z.string().optional(),
    parent: z.string().optional(),
  })
  .strip()

const accountSummaryPageSchema = z
  .object({
    accountSummaries: z
      .array(
        z
          .object({
            account: z.string().trim().min(1),
            displayName: z.string().optional(),
            propertySummaries: z.array(propertySummarySchema).optional(),
          })
          .strip(),
      )
      .max(200)
      .optional(),
    nextPageToken: z.string().optional(),
  })
  .strip()

export function parseGa4AccountSummaryPage(
  value: unknown,
): Ga4AccountSummaryPage {
  const parsed = accountSummaryPageSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error('Google Analytics account summary response was invalid.')
  }

  return {
    accountSummaries: (parsed.data.accountSummaries ?? []).map((account) => ({
      ...account,
      propertySummaries: account.propertySummaries ?? [],
    })),
    nextPageToken: parsed.data.nextPageToken || undefined,
  }
}

export async function collectGa4AccountSummaries(
  fetchPage: (pageToken?: string) => Promise<unknown>,
): Promise<Ga4AccountSummary[]> {
  const summaries: Ga4AccountSummary[] = []
  const seenPageTokens = new Set<string>()
  let pageToken: string | undefined

  for (let page = 0; page < GA4_ACCOUNT_SUMMARY_PAGE_LIMIT; page += 1) {
    const result = parseGa4AccountSummaryPage(await fetchPage(pageToken))
    summaries.push(...result.accountSummaries)

    if (!result.nextPageToken) return summaries
    if (seenPageTokens.has(result.nextPageToken)) {
      throw new Error(
        'Google Analytics account summary pagination repeated a page token.',
      )
    }
    seenPageTokens.add(result.nextPageToken)
    pageToken = result.nextPageToken
  }

  throw new Error(
    `Google Analytics account summary discovery exceeded ${GA4_ACCOUNT_SUMMARY_PAGE_LIMIT} pages.`,
  )
}
