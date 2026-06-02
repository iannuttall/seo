import { authedFetch, getAuthorized } from './fetch.js'
import type { UrlInspectionRequest, UrlInspectionResult } from './types.js'

export async function inspectUrl(
  input: UrlInspectionRequest,
): Promise<UrlInspectionResult> {
  const { client } = await getAuthorized()
  const response = await authedFetch(
    client,
    'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
    {
      method: 'POST',
      body: JSON.stringify({
        siteUrl: input.siteUrl,
        inspectionUrl: input.inspectionUrl,
        ...(input.languageCode ? { languageCode: input.languageCode } : {}),
      }),
    },
  )

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(
        'URL Inspection rate limit hit. Back off before retrying.',
      )
    }
    throw new Error(`URL Inspection failed with ${response.status}.`)
  }

  return (await response.json()) as UrlInspectionResult
}
