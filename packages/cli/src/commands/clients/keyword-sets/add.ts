import { addKeywordsToSet, SeoError } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, listArg, stringArg } from '../../../args.js'
import { printJson, printKeyValue } from '../../../utils.js'
import {
  keywordInputs,
  keywordSetJsonArg,
  keywordSetProjectArgs,
  selectedProject,
} from './shared.js'

export const keywordSetAddCommand = defineCommand({
  meta: { name: 'add', description: 'Add or update keywords in a saved set' },
  args: {
    ...keywordSetProjectArgs,
    set: {
      type: 'string',
      description: 'Keyword set id or name.',
      required: true,
    },
    keyword: { type: 'string', description: 'One keyword.' },
    keywords: { type: 'string', description: 'Comma-separated keywords.' },
    file: { type: 'string', description: 'Newline-delimited keyword file.' },
    tags: {
      type: 'string',
      description: 'Comma-separated tags applied to every keyword.',
    },
    'target-url': {
      type: 'string',
      description: 'Existing target page for every keyword.',
    },
    'proposed-url': {
      type: 'string',
      description: 'Proposed page for every keyword.',
    },
    json: keywordSetJsonArg,
  },
  run: async ({ args }) => {
    const targetUrl = stringArg(args['target-url'])
    const proposedUrl = stringArg(args['proposed-url'])
    if (targetUrl && proposedUrl) {
      throw new SeoError(
        'INVALID_INPUT',
        'Use either --target-url or --proposed-url.',
      )
    }
    const project = await selectedProject(args)
    const result = addKeywordsToSet({
      projectId: project.id,
      idOrName: stringArg(args.set) ?? '',
      items: (await keywordInputs(args)).map((keyword) => ({
        keyword,
        tags: listArg(args.tags),
        ...(targetUrl || proposedUrl
          ? {
              page: {
                kind: targetUrl ? ('target' as const) : ('proposed' as const),
                url: targetUrl ?? proposedUrl ?? '',
              },
            }
          : {}),
      })),
    })
    if (jsonFlag(args)) printJson(result)
    else
      printKeyValue([
        ['Set', result.setId],
        ['Added', String(result.added)],
        ['Updated', String(result.updated)],
        ['Keywords', String(result.keywordCount)],
      ])
  },
})
