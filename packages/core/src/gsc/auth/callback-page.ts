type OAuthCallbackPageOptions =
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
  if (options.status === 'permissions-missing') {
    return {
      title: 'Google permissions not granted',
      heading: 'Google permissions were not granted.',
      detail: `Return to your terminal and run seo auth login again. Select all permission boxes for ${options.missing.join(' and ')}.`,
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
