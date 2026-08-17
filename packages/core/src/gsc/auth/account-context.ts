import { AsyncLocalStorage } from 'node:async_hooks'

export type GoogleAccountContext = {
  searchConsole?: string
  googleAnalytics?: string
}

const googleAccountContext = new AsyncLocalStorage<GoogleAccountContext>()

export function selectGoogleAccounts(
  accounts: GoogleAccountContext | undefined,
): void {
  googleAccountContext.enterWith(accounts ?? {})
}

export function selectedGoogleAccount(
  source: keyof GoogleAccountContext,
): string | undefined {
  return googleAccountContext.getStore()?.[source]
}
