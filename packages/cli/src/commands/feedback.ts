import { confirm } from '@clack/prompts'
import { cloudFeedback, cloudLinked, localError } from '@seo/core'
import { cleanFeedback, runFeedback } from '@seo/core/commands'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, stringArg } from '../args.js'
import { canPrompt, printJson } from '../utils.js'

// seo feedback: a bug or idea about SEO Skill, sent to its maintainer
// through seoskill.dev. A person at a terminal sees the text and agrees
// first; an agent asks the person before it runs this.

const write = (text: string) => process.stdout.write(`${text}\n`)

export const feedbackCommand = defineCommand({
  meta: {
    name: 'feedback',
    description:
      'Send a bug or idea about SEO Skill, with a proposed fix, to its maintainer',
  },
  args: {
    summary: {
      type: 'string',
      required: true,
      description: 'One line: what is wrong or missing.',
    },
    details: {
      type: 'string',
      required: true,
      description:
        'What you ran, what happened, what you expected, and the fix you propose.',
    },
    tool: {
      type: 'string',
      description: 'The command or tool it is about, such as report.',
    },
    yes: {
      type: 'boolean',
      default: false,
      description: 'Send without asking.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    try {
      const input = {
        summary: stringArg(args.summary),
        details: stringArg(args.details),
        tool: stringArg(args.tool),
      }
      if (!booleanArg(args.yes) && canPrompt({ json: jsonFlag(args) })) {
        const report = cleanFeedback(input)
        write(`Summary: ${report.summary}\n\n${report.details}\n`)
        write(
          cloudLinked()
            ? 'This goes to the maintainer of SEO Skill with your seoskill.dev account email.'
            : 'This goes to the maintainer of SEO Skill, with no account or email.',
        )
        if ((await confirm({ message: 'Send it?' })) !== true) {
          write('Nothing was sent.')
          return
        }
      }
      const result = await runFeedback(input, cloudFeedback)
      if (jsonFlag(args)) printJson(result.data)
      else write('Sent. Thanks.')
    } catch (error) {
      throw localError(error)
    }
  },
})
