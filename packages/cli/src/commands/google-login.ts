import { note } from '@clack/prompts'
import { loginWithLoopback, type StoredTokens } from '@seo/core'

export function googleLoginGuidance(): string {
  return 'Your browser will open. Choose your Google account and select all permission boxes for read-only access. Keep this terminal open and finish the browser steps within five minutes.'
}

export async function loginWithGuidance(): Promise<StoredTokens> {
  note(googleLoginGuidance(), 'Google sign-in')
  return loginWithLoopback()
}
