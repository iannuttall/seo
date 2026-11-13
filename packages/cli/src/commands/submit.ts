import { readFile } from 'node:fs/promises'
import { confirm } from '@clack/prompts'
import { localError, nodeCommandDeps, SeoError } from '@seo/core'
import { runSubmit, type SubmitInput } from '@seo/core/commands'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, stringArg } from '../args.js'
import { canPrompt, printJson } from '../utils.js'
import { cliCall } from './core-commands.js'

// seo submit: IndexNow for free, or Index My Site with --indexmysite.
//   seo submit key <site>
//   seo submit <url...> | --file urls.txt [--indexmysite [--bing] [--fast]]
//   seo submit status [job-id]
//   seo submit approve <job-id> <url-id...> | --all
// The first word picks the action, so URLs can be plain arguments.

type Args = Record<string, unknown>

const write = (text: string) => process.stdout.write(`${text}\n`)

async function urlsFrom(args: Args, positionals: string[]): Promise<string[]> {
  const file = stringArg(args.file)
  const fromFile = file
    ? (
        await readFile(file, 'utf8').catch(() => {
          throw new SeoError('INVALID_INPUT', `Could not read ${file}.`)
        })
      )
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
    : []
  return [...positionals, ...fromFile]
}

async function show(input: SubmitInput, args: Args) {
  const result = await runSubmit(input, nodeCommandDeps({ call: cliCall }))
  if (jsonFlag(args)) printJson(result.data)
  else write(result.text)
  return result
}

// A paid action: quote first, then send on --yes or a yes at the prompt.
async function paid(input: SubmitInput, args: Args) {
  if (booleanArg(args.yes)) return show({ ...input, confirm: true }, args)
  const quote = await show({ ...input, confirm: false }, args)
  const data = quote.data as { sent?: boolean; approved?: number }
  if (data.sent === true || data.approved !== 0) return quote
  if (!canPrompt({ json: jsonFlag(args) })) return quote
  const answer = await confirm({ message: 'Spend these credits now?' })
  if (answer !== true) {
    write('Nothing was sent.')
    return quote
  }
  return show({ ...input, confirm: true }, args)
}

export const submitCommand = defineCommand({
  meta: {
    name: 'submit',
    description:
      'Ask search engines to crawl pages: IndexNow for free (Bing, Yandex and others, not Google), or Index My Site for Google, paid',
  },
  args: {
    file: {
      type: 'string',
      description: 'A file with one URL per line.',
    },
    indexmysite: {
      type: 'boolean',
      default: false,
      description:
        'Send to Google with Index My Site, from your own credits. Shows the cost first.',
    },
    bing: {
      type: 'boolean',
      default: false,
      description:
        'With --indexmysite: also send each URL to Bing, 1 more credit per URL, not returned.',
    },
    fast: {
      type: 'boolean',
      default: false,
      description:
        'With --indexmysite: faster Google indexing, 1 more credit per URL, not returned.',
    },
    name: { type: 'string', description: 'With --indexmysite: a job label.' },
    key: {
      type: 'string',
      description: 'An IndexNow key the site already serves at /<key>.txt.',
    },
    all: {
      type: 'boolean',
      default: false,
      description: 'With approve: every URL waiting for approval.',
    },
    yes: {
      type: 'boolean',
      default: false,
      description: 'Spend credits without asking (scripts).',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const words = ((args._ as unknown[] | undefined) ?? []).filter(
      (value): value is string => typeof value === 'string',
    )
    const [first, ...rest] = words
    const key = stringArg(args.key)
    try {
      if (first === 'key') {
        if (rest.length !== 1) {
          throw new SeoError('INVALID_INPUT', 'Usage: seo submit key <site>')
        }
        await show({ action: 'indexnow_key', site: rest[0], key }, args)
        return
      }
      if (first === 'status') {
        await show({ action: 'indexmysite_status', jobId: rest[0] }, args)
        return
      }
      if (first === 'approve') {
        const [jobId, ...urlIds] = rest
        await paid(
          {
            action: 'indexmysite_approve',
            jobId,
            urlIds,
            all: booleanArg(args.all),
          },
          args,
        )
        return
      }
      const urls = await urlsFrom(args, words)
      if (!urls.length) {
        throw new SeoError(
          'INVALID_INPUT',
          'Give URLs to submit, or --file with one URL per line. See seo submit --help.',
        )
      }
      if (booleanArg(args.indexmysite)) {
        await paid(
          {
            action: 'indexmysite',
            urls,
            bing: booleanArg(args.bing),
            fast: booleanArg(args.fast),
            name: stringArg(args.name),
          },
          args,
        )
        return
      }
      if (booleanArg(args.bing) || booleanArg(args.fast)) {
        throw new SeoError(
          'INVALID_INPUT',
          '--bing and --fast are Index My Site options; add --indexmysite. IndexNow already reaches Bing for free.',
        )
      }
      await show({ action: 'indexnow', urls, key }, args)
    } catch (error) {
      throw localError(error)
    }
  },
})
