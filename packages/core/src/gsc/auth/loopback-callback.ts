import type http from 'node:http'
import { oauthCallbackPage } from './callback-page.js'

export function waitForCode(input: {
  server: http.Server
  redirectUri: string
  state: string
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
      () => reject(new Error('OAuth flow timed out after 5 minutes.')),
      300_000,
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
          throw new Error(`OAuth error: ${error}`)
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
