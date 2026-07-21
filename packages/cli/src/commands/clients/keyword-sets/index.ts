import { defineCommand } from 'citty'
import { keywordSetAddCommand } from './add.js'
import { keywordSetCreateCommand } from './create.js'
import { keywordSetDeleteCommand } from './delete.js'
import { keywordSetExportCommand } from './export.js'
import { keywordSetListCommand } from './list.js'
import { keywordSetRefreshCommand } from './refresh.js'
import { keywordSetRemoveCommand } from './remove.js'
import { keywordSetShowCommand } from './show.js'

export const keywordSetsCommand = defineCommand({
  meta: {
    name: 'keyword-sets',
    description: 'Manage project keyword research sets',
  },
  subCommands: {
    create: keywordSetCreateCommand,
    list: keywordSetListCommand,
    show: keywordSetShowCommand,
    add: keywordSetAddCommand,
    remove: keywordSetRemoveCommand,
    refresh: keywordSetRefreshCommand,
    export: keywordSetExportCommand,
    delete: keywordSetDeleteCommand,
  },
})
