type OAuthCallbackPageOptions =
  | { status: 'cancelled' }
  | { status: 'connected' }
  | { status: 'failed' }
  | { status: 'permissions-missing'; missing: string[] }

function callbackCopy(options: OAuthCallbackPageOptions): {
  detail: string
  heading: string
  title: string
} {
  if (options.status === 'connected') {
    return {
      title: 'Google account connected',
      heading: 'Google account connected.',
      detail: 'This tab can be closed.',
    }
  }
  if (options.status === 'cancelled') {
    return {
      title: 'Google sign-in cancelled',
      heading: 'Google sign-in was cancelled.',
      detail:
        'No account was connected. Return to your terminal when you are ready.',
    }
  }
  if (options.status === 'permissions-missing') {
    return {
      title: 'Google permissions not selected',
      heading: 'Required Google permissions were not selected.',
      detail: `The login needs read-only access for ${options.missing.join(' and ')}. Return to your terminal and run seo auth login again. On Google's permissions screen, choose Select all, then continue.`,
    }
  }
  return {
    title: 'Google connection failed',
    heading: 'Google connection failed.',
    detail: 'Return to your terminal for the error and try again.',
  }
}

export function oauthCallbackPage(
  options: OAuthCallbackPageOptions = { status: 'connected' },
): string {
  const copy = callbackCopy(options)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'">
    <title>${copy.title}</title>
  </head>
  <body>
    <p>${copy.heading}</p>
    <p>${copy.detail}</p>
  </body>
</html>`
}
