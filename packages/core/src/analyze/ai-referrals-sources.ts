import type { AiReferralSourceDefinition } from './ai-referrals-types.js'

export const AI_REFERRAL_SOURCES_VERSION = 'ai-referral-sources@1' as const

export const AI_REFERRAL_SOURCES: readonly AiReferralSourceDefinition[] = [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    domains: ['chatgpt.com', 'chat.openai.com'],
  },
  { id: 'perplexity', label: 'Perplexity', domains: ['perplexity.ai'] },
  { id: 'claude', label: 'Claude', domains: ['claude.ai'] },
  {
    id: 'gemini',
    label: 'Gemini',
    domains: ['gemini.google.com', 'bard.google.com'],
  },
  {
    id: 'copilot',
    label: 'Copilot',
    domains: ['copilot.com', 'copilot.microsoft.com'],
  },
  { id: 'grok', label: 'Grok', domains: ['grok.com'] },
  { id: 'deepseek', label: 'DeepSeek', domains: ['chat.deepseek.com'] },
  { id: 'meta-ai', label: 'Meta AI', domains: ['meta.ai'] },
  { id: 'you', label: 'You.com', domains: ['you.com'] },
  { id: 'poe', label: 'Poe', domains: ['poe.com'] },
  { id: 'phind', label: 'Phind', domains: ['phind.com'] },
  {
    id: 'mistral',
    label: 'Le Chat',
    domains: ['chat.mistral.ai'],
  },
  {
    id: 'notebooklm',
    label: 'NotebookLM',
    domains: ['notebooklm.google.com'],
  },
]

function hostnameFromSource(value: string): string | undefined {
  const normalized = value.normalize('NFKC').trim().toLowerCase()
  if (!normalized || normalized.startsWith('(')) return undefined
  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(normalized)
        ? normalized
        : `https://${normalized}`,
    )
    return url.hostname.replace(/^www\./, '').replace(/\.$/, '') || undefined
  } catch {
    return undefined
  }
}

function matchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

export function aiReferralSourceForValue(
  value: string,
): AiReferralSourceDefinition | undefined {
  const hostname = hostnameFromSource(value)
  if (!hostname) return undefined
  return AI_REFERRAL_SOURCES.find((source) =>
    source.domains.some((domain) => matchesDomain(hostname, domain)),
  )
}
