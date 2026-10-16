import {
  CLOUD_URL,
  cloudCredentials,
  cloudLinked,
  cloudLogout,
  finishCloudLogin,
  openCloudLink,
  pendingCloudLogin,
  startCloudLogin,
} from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag } from '../args.js'
import { canPrompt, printJson } from '../utils.js'

// `seo login` links this machine to a seoskill.dev account, so the CLI uses
// the account's Google accounts, Bing and keys. In a terminal it waits for
// the person to approve. An agent or script gets the link and runs
// `seo login` again after the person approved it.

const write = (text: string) => process.stdout.write(`${text}\n`)

async function linkedSummary() {
  const { google, bing, keys } = await cloudCredentials()
  return {
    status: 'linked' as const,
    google: google.map((item) => item.email),
    bing: bing.length,
    keys: Object.keys(keys).filter((name) => name !== 'x-dataforseo-login'),
  }
}

function describe(summary: Awaited<ReturnType<typeof linkedSummary>>) {
  return [
    `Linked to your seoskill.dev account.`,
    `Google: ${summary.google.join(', ') || 'none'}.`,
    `Bing: ${summary.bing ? `${summary.bing} linked` : `not connected (add it at ${CLOUD_URL}/account)`}.`,
    `Keys: ${summary.keys.length ? summary.keys.map((key) => key.replace(/^x-|-(key|password)$/g, '')).join(', ') : 'none'}.`,
    'Next: seo sites, then seo report --site <site>.',
  ].join('\n')
}

export const loginCommand = defineCommand({
  meta: {
    name: 'login',
    description:
      'Link this machine to your seoskill.dev account: its Google accounts, Bing and keys',
  },
  args: {
    json: { type: 'boolean', default: false, description: 'Print JSON.' },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const done = async () => {
      const summary = await linkedSummary()
      if (json) printJson(summary)
      else write(describe(summary))
    }
    if (process.env.SEO_TOKEN?.trim()) {
      await done()
      return
    }
    // A login started earlier finishes once the person approved it.
    if (pendingCloudLogin()) {
      const result = await finishCloudLogin()
      if (result === 'linked') return done()
      if (result === 'pending' && !canPrompt({ json })) {
        const pending = pendingCloudLogin()
        if (json) printJson({ status: 'pending', ...link(pending) })
        else
          write(
            `Waiting for approval. Open ${pending?.url} and click "Link this machine", then run \`seo login\` again.`,
          )
        return
      }
    } else if (cloudLinked()) {
      await done()
      return
    }
    const pending = pendingCloudLogin() ?? (await startCloudLogin())
    if (!canPrompt({ json })) {
      if (json) printJson({ status: 'pending', ...link(pending) })
      else
        write(
          [
            `Open this link in the person's browser and ask them to approve it:`,
            pending.url,
            `Code: ${pending.code}. After they approve, run \`seo login\` again.`,
          ].join('\n'),
        )
      return
    }
    write(
      `Opening ${pending.url}\nApprove code ${pending.code} there. Waiting…`,
    )
    await openCloudLink(pending.url)
    while (pendingCloudLogin()) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      const result = await finishCloudLogin()
      if (result === 'linked') return done()
      if (result === 'expired') break
    }
    write('The login expired. Run `seo login` again.')
    process.exitCode = 1
  },
})

const link = (pending: { url: string; code: string } | null) => ({
  url: pending?.url,
  code: pending?.code,
})

export const logoutCommand = defineCommand({
  meta: {
    name: 'logout',
    description: 'Unlink this machine from your seoskill.dev account',
  },
  args: {
    json: { type: 'boolean', default: false, description: 'Print JSON.' },
  },
  run: async ({ args }) => {
    const removed = await cloudLogout()
    if (jsonFlag(args)) printJson({ unlinked: removed })
    else
      write(
        removed
          ? 'This machine is no longer linked to your seoskill.dev account.'
          : 'This machine was not linked.',
      )
  },
})
