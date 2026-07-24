import { AhrefsLinkProvider } from '../providers/ahrefs/link-research.js'
import type { ProviderRequestContext } from '../providers/contracts.js'
import type { LinkTargetScope } from '../providers/link-contracts.js'
import { collectExternalProviderLinkEvidence } from './external-provider.js'

export async function collectAhrefsLinkEvidence(input: {
  target: string
  scope?: LinkTargetScope
  includeSubdomains?: boolean
  rowLimit?: number
  refresh?: boolean
  context?: ProviderRequestContext
  provider?: Pick<AhrefsLinkProvider, 'linkSummary' | 'backlinks'>
}) {
  return collectExternalProviderLinkEvidence({
    ...input,
    providerId: 'ahrefs',
    provider: input.provider ?? new AhrefsLinkProvider(),
  })
}
