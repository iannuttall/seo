export function credentialSourceLabel(
  source: 'environment' | 'keychain' | 'file' | undefined,
): string {
  if (source === 'keychain') return 'system keychain'
  if (source === 'file') return 'private local file'
  return source ?? 'missing'
}

export function formatUsd(micros: number | null): string {
  return micros === null ? 'unavailable' : `$${(micros / 1_000_000).toFixed(2)}`
}
