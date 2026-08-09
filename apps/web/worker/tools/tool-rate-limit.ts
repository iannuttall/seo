type ToolRateLimitEnv = Pick<
  Env,
  'TOOL_CLIENT_RATE_LIMITER' | 'TOOL_ROUTE_RATE_LIMITER'
>

const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}

function jsonResponse(value: unknown, status: number): Response {
  return Response.json(value, { status, headers: JSON_HEADERS })
}

export async function applyToolRateLimit(
  request: Request,
  env: ToolRateLimitEnv,
): Promise<Response | undefined> {
  if (request.method !== 'POST') return undefined

  const clientIp = request.headers.get('cf-connecting-ip')?.trim()
  if (!clientIp) {
    return jsonResponse({ error: 'The tool is temporarily unavailable.' }, 503)
  }

  const pathname = new URL(request.url).pathname
  try {
    const [client, route] = await Promise.all([
      env.TOOL_CLIENT_RATE_LIMITER.limit({ key: `${clientIp}\n${pathname}` }),
      env.TOOL_ROUTE_RATE_LIMITER.limit({ key: pathname }),
    ])
    if (!client.success || !route.success) {
      return jsonResponse(
        { error: 'Too many checks. Wait a minute and try again.' },
        429,
      )
    }
  } catch {
    return jsonResponse({ error: 'The tool is temporarily unavailable.' }, 503)
  }

  return undefined
}
