import { CommandError, dateWindow } from '@seo/core/commands'
import { propertyChoices } from './audit/choices.ts'
import { directory } from './google.ts'
import { accountsOf } from './store.ts'
import { internalLinksRoute } from './tool-internal-links.ts'

// JSON for the free tools on the seoskill.dev site, read with the account
// page's cookie, so a tool uses the Google accounts the person already
// linked. Removing a Google account or Delete everything on the account
// page ends it. Nothing fetched here is kept.

// Search Console keeps 16 months.
const DAILY_DAYS = 480

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export async function toolRoute(
  request: Request,
  env: Env,
  path: string,
  userId: string | null,
): Promise<Response> {
  // The internal linking tool, with its own POST (tool-internal-links.ts).
  if (path.startsWith('/account/tools/internal-links')) {
    return internalLinksRoute(request, env, path, userId)
  }
  if (request.method !== 'GET') return json({ error: 'not_found' }, 404)
  if (path === '/account/tools/session') {
    if (!userId) return json({ signedIn: false })
    const found = await propertyChoices(
      env,
      userId,
      await accountsOf(env, userId),
    )
    return json({
      signedIn: true,
      properties: found.choices.map((choice) => choice.property),
      failed: found.failed,
    })
  }
  if (!userId) return json({ error: 'not_signed_in' }, 401)
  if (path === '/account/tools/search-console/daily') {
    const property = new URL(request.url).searchParams.get('property') ?? ''
    if (!property || property.length > 300) {
      return json({ error: 'Pick a Search Console property.' }, 400)
    }
    try {
      const range = dateWindow({}, DAILY_DAYS)
      const result = await directory(
        env,
        await accountsOf(env, userId),
      ).searchAnalytics()(property, {
        ...range,
        dimensions: ['date'],
        type: 'web',
        maxRows: DAILY_DAYS + 10,
      })
      const days = result.rows
        .map((row) => ({
          date: row.keys[0] ?? '',
          clicks: row.clicks,
          impressions: row.impressions,
        }))
        .filter((day) => day.date)
        .sort((left, right) => (left.date < right.date ? -1 : 1))
      return json({ property, ...range, days })
    } catch (error) {
      if (error instanceof CommandError) {
        const status = error.code === 'NO_ACCESS' ? 403 : 502
        return json({ error: firstSentence(error.message) }, status)
      }
      throw error
    }
  }
  return json({ error: 'not_found' }, 404)
}

// Error texts end with an agent hint; the page shows only the first part.
const firstSentence = (text: string) => text.split(/(?<=\.)\s/)[0] ?? text
