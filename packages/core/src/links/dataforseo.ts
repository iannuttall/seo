import type { ProviderRequestContext } from '../providers/contracts.js'
import { DataForSeoLinkProvider } from '../providers/dataforseo/link-research.js'
import type { LinkTargetScope } from '../providers/link-contracts.js'
import { collectExternalProviderLinkEvidence } from './external-provider.js'

export async function collectDataForSeoLinkEvidence(input: {
  target: string
  scope?: LinkTargetScope
  includeSubdomains?: boolean
  rowLimit?: number
  refresh?: boolean
  context?: ProviderRequestContext
  provider?: Pick<DataForSeoLinkProvider, 'linkSummary' | 'backlinks'>
}) {
  return collectExternalProviderLinkEvidence({
    ...input,
    providerId: 'dataforseo',
    provider: input.provider ?? new DataForSeoLinkProvider(),
  })
}
