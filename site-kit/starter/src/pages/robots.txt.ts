import { absoluteUrl, site } from '../site'

// Open to every crawler. Content-Signal says what the content may be used
// for: search and AI answers always, AI training only when the site owner
// chose it in site.config.json.
export function GET() {
  const body = [
    'User-agent: *',
    'Allow: /',
    `Content-Signal: search=yes, ai-input=yes, ai-train=${site.aiTraining ? 'yes' : 'no'}`,
    '',
    `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
    '',
  ].join('\n')
  return new Response(body, { headers: { 'Content-Type': 'text/plain' } })
}
