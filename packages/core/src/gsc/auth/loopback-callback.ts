import type http from 'node:http'
import { SeoError } from '../../errors.js'
import { oauthCallbackPage } from './callback-page.js'

const OAUTH_CALLBACK_TIMEOUT_MS = 300_000

function timeoutError(): SeoError {
  return new SeoError(
    'AUTH_REQUIRED',
    'Google sign-in timed out. No account was connected. Run `seo auth login` again and finish the browser steps within five minutes. Keep the terminal open while you sign in.',
  )
}

function callbackError(error: string): SeoError {
  if (error === 'access_denied') {
    return new SeoError(
      'ACCESS_DENIED',
      'Google sign-in was cancelled. No account was connected. Run `seo auth login` again when you are ready.',
    )
  }
  return new SeoError(
    'AUTH_REQUIRED',
    'Google sign-in could not finish. No account was connected. Run `seo auth login` again.',
  )
}

export function waitForCode(input: {
  server: http.Server
  redirectUri: string
  state: string
  timeoutMs?: number
}): Promise<{
  code: string
  respond: (status: number, page: string) => void
}> {
  return new Promise<{
    code: string
    respond: (status: number, page: string) => void
  }>((resolve, reject) => {
    const callbackPath = new URL(input.redirectUri).pathname
    const timer = setTimeout(
      () => reject(timeoutError()),
      input.timeoutMs ?? OAUTH_CALLBACK_TIMEOUT_MS,
    )

    input.server.on('request', (req, res) => {
      try {
        const reqUrl = new URL(req.url ?? '/', input.redirectUri)
        if (reqUrl.pathname !== callbackPath) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('Not found.')
          return
        }
        if (reqUrl.searchParams.get('state') !== input.state) {
          res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' })
          res.end(oauthCallbackPage({ status: 'failed' }))
          return
        }

        const error = reqUrl.searchParams.get('error')
        if (error) {
          res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' })
          res.end(
            oauthCallbackPage({
              status: error === 'access_denied' ? 'cancelled' : 'failed',
            }),
          )
          clearTimeout(timer)
          reject(callbackError(error))
          return
        }

        const incomingCode = reqUrl.searchParams.get('code')
        if (!incomingCode) {
          throw new Error('OAuth code missing.')
        }

        let responded = false
        clearTimeout(timer)
        resolve({
          code: incomingCode,
          respond: (status, page) => {
            if (responded) return
            responded = true
            res.writeHead(status, {
              'content-type': 'text/html; charset=utf-8',
            })
            res.end(page)
          },
        })
      } catch (error) {
        res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' })
        res.end(oauthCallbackPage({ status: 'failed' }))
        clearTimeout(timer)
        reject(error)
      }
    })
  })
}
