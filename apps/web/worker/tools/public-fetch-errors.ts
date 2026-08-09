function errorDetails(error: unknown, depth = 0): string {
  if (depth > 3 || !error || typeof error !== 'object') {
    return typeof error === 'string' ? error : ''
  }
  const value = error as {
    message?: unknown
    code?: unknown
    cause?: unknown
  }
  return [
    typeof value.message === 'string' ? value.message : '',
    typeof value.code === 'string' ? value.code : '',
    errorDetails(value.cause, depth + 1),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function safePublicFetchMessage(
  error: unknown,
  resource: string,
): string {
  const details = errorDetails(error)
  if (
    /\b(?:enotfound|eai_again|dns|name_not_resolved)\b|could not resolve|host not found/u.test(
      details,
    )
  ) {
    return `The hostname for the ${resource} could not be resolved.`
  }
  if (/\b(?:tls|ssl|certificate|cert_|handshake)\b/u.test(details)) {
    return `A secure connection to the server hosting the ${resource} could not be established.`
  }
  if (
    /\b(?:econnrefused|econnreset|enetunreach|ehostunreach|network|socket)\b|failed to fetch|fetch failed/u.test(
      details,
    )
  ) {
    return `The server hosting the ${resource} could not be reached.`
  }
  return `The ${resource} could not be fetched.`
}
