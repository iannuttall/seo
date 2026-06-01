import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const target = resolve(
  process.cwd(),
  'packages/core/src/gsc/shared-client.generated.ts',
)
const clientId = process.env.SEO_GOOGLE_CLIENT_ID
const clientSecret = process.env.SEO_GOOGLE_CLIENT_SECRET

if (!clientId || !clientSecret) {
  console.error(
    'SEO_GOOGLE_CLIENT_ID and SEO_GOOGLE_CLIENT_SECRET must both be set.',
  )
  process.exit(1)
}

const contents = `export const SHARED_OAUTH_CLIENT = {
  clientId: ${JSON.stringify(clientId)},
  clientSecret: ${JSON.stringify(clientSecret)},
} as const;
`

mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, contents, 'utf8')
console.log(`Wrote shared OAuth client to ${target}`)
