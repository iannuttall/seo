import { createCloudflareMarkdownHandler } from '@seo/astro/cloudflare'

const handleRequest = createCloudflareMarkdownHandler({
  canonicalHosts: ['seoskill.dev'],
  contentSignal: 'search=yes, ai-input=yes, ai-train=no',
  noindexPaths: ['/cookies', '/privacy', '/security', '/terms', '/trademarks'],
  responseHeaders: {
    'Strict-Transport-Security': 'max-age=300',
  },
  site: 'https://seoskill.dev',
})

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env.ASSETS)
  },
} satisfies ExportedHandler<Env>
