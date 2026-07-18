export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'
export const INDEXNOW_MAX_URLS = 1_000
export const INDEXNOW_KEY_ENV = 'SEO_INDEXNOW_KEY'
export const INDEXNOW_KEYS_SECRET = 'indexnow-keys'

export type IndexNowKey = {
  host: string
  key: string
  keyLocation: string
  createdAt: string
}

export type IndexNowKeySource = 'environment' | 'keychain' | 'file'

export type IndexNowSubmission = {
  schemaVersion: 1
  generatedAt: string
  dryRun: boolean
  status: 'validated' | 'submitted' | 'pending-validation'
  endpoint: typeof INDEXNOW_ENDPOINT
  host: string
  keyLocation: string
  submittedUrls: number
  responseStatus?: 200 | 202
  caveats: string[]
}
