import { ProviderError } from '../errors.js'
import type { DataForSeoSerpRequest } from './client-types.js'

const MAX_KEYWORD_CHARACTERS = 80
const MAX_KEYWORD_WORDS = 10
const MAX_SERP_DEPTH = 100

export function validateSerpInput(
  input: Omit<DataForSeoSerpRequest, 'refresh' | 'context'>,
): { keyword: string; locationName: string | undefined } {
  const keyword = input.keyword.trim().replace(/\s+/gu, ' ')
  if (
    keyword.length < 1 ||
    keyword.length > MAX_KEYWORD_CHARACTERS ||
    keyword.split(/\s+/u).length > MAX_KEYWORD_WORDS
  ) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'serp-snapshot',
      code: 'configuration',
      message: `SERP snapshots require a keyword of at most ${MAX_KEYWORD_CHARACTERS} characters and ${MAX_KEYWORD_WORDS} words.`,
    })
  }
  if (
    /(?:^|\s)(?:allinanchor|allintext|allintitle|allinurl|cache|define|definition|filetype|id|inanchor|info|intext|intitle|inurl|link|site):/iu.test(
      keyword,
    )
  ) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'serp-snapshot',
      code: 'configuration',
      message:
        'SERP snapshot keywords cannot contain search operators with multiplied provider pricing.',
    })
  }
  if (
    !Number.isSafeInteger(input.depth) ||
    input.depth < 1 ||
    input.depth > MAX_SERP_DEPTH
  ) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'serp-snapshot',
      code: 'configuration',
      message: `SERP depth must be from 1 to ${MAX_SERP_DEPTH}.`,
    })
  }
  if (!/^[a-z]{2}$/.test(input.languageCode)) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'serp-snapshot',
      code: 'configuration',
      message: 'DataForSEO language code must contain two lowercase letters.',
    })
  }
  const locationName = input.locationName?.trim()
  if ((input.locationCode !== undefined) === Boolean(locationName)) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'serp-snapshot',
      code: 'configuration',
      message:
        'DataForSEO SERP snapshots require exactly one location code or location name.',
    })
  }
  return { keyword, locationName }
}
