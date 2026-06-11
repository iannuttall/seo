import { deleteClient } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, stringArg } from '../../../args.js'
import { printJson } from '../../../utils.js'

export const clientDeleteCommand = defineCommand({
  meta: {
    name: 'delete',
    description: 'Delete a project profile',
  },
  args: {
    id: {
      type: 'string',
      required: true,
      description: 'Project id or name.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const id = stringArg(args.id) ?? ''
    const deleted = deleteClient(id)
    if (jsonFlag(args)) {
      printJson({ id, deleted })
      return
    }
    process.stdout.write(`${deleted ? 'Deleted' : 'Not found'} ${id}.\n`)
  },
})
