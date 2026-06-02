import { clientAddCommand } from './profiles/add.js'
import { clientDefaultCommand } from './profiles/default.js'
import { clientDeleteCommand } from './profiles/delete.js'
import { clientListCommand } from './profiles/list.js'
import { clientShowCommand } from './profiles/show.js'

export const clientProfileCommands = {
  list: clientListCommand,
  add: clientAddCommand,
  show: clientShowCommand,
  default: clientDefaultCommand,
  delete: clientDeleteCommand,
}
