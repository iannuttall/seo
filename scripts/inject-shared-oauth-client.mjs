import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const target = resolve(
  process.env.SEO_SHARED_OAUTH_OUTPUT_PATH ??
    'packages/core/src/gsc/shared-client.generated.ts',
)
const clientId = process.env.SEO_GOOGLE_CLIENT_ID
const clientSecret = process.env.SEO_GOOGLE_CLIENT_SECRET

function singleQuotedString(value) {
  let escaped = ''
  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (character === '\\') escaped += '\\\\'
    else if (character === "'") escaped += "\\'"
    else if (
      codePoint !== undefined &&
      (codePoint <= 0x1f ||
        (codePoint >= 0x7f && codePoint <= 0x9f) ||
        codePoint === 0x2028 ||
        codePoint === 0x2029)
    ) {
      escaped += `\\u${codePoint.toString(16).padStart(4, '0')}`
    } else escaped += character
  }
  return `'${escaped}'`
}

function property(name, value) {
  const literal = singleQuotedString(value)
  const inline = `  ${name}: ${literal},`

  return inline.length <= 80 ? inline : `  ${name}:\n    ${literal},`
}

if (!clientId || !clientSecret) {
  console.error(
    'SEO_GOOGLE_CLIENT_ID and SEO_GOOGLE_CLIENT_SECRET must both be set.',
  )
  process.exit(1)
}

const contents = `export const SHARED_OAUTH_CLIENT = {
${property('clientId', clientId)}
${property('clientSecret', clientSecret)}
} as const
`

mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, contents, 'utf8')
console.log(`Wrote shared OAuth client to ${target}`)
