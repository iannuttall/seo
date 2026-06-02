export function decodeJwtEmail(idToken?: string): string | undefined {
  if (!idToken) {
    return undefined
  }

  const [, payload] = idToken.split('.')
  if (!payload) {
    return undefined
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as { email?: string }
    return parsed.email
  } catch {
    return undefined
  }
}

export async function fetchUserEmail(
  accessToken: string,
): Promise<string | undefined> {
  const response = await fetch(
    'https://openidconnect.googleapis.com/v1/userinfo',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )
  if (!response.ok) {
    return undefined
  }
  const json = (await response.json()) as { email?: string }
  return json.email
}
