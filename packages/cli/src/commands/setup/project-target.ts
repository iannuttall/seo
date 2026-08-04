import { select } from '@clack/prompts'
import type { ClientProfile } from '@seo/core'
import { maybeExitCancelled } from '../../utils.js'
import { slugId } from '../shared.js'

const CREATE_PROJECT = '__create_project__'
const SKIP_PROJECT = '__skip_project__'

export type SetupProjectTarget =
  | { mode: 'create'; requestedId?: string }
  | { mode: 'update'; client: ClientProfile }
  | { mode: 'skip' }

export type SetupProjectOption = {
  value: string
  label: string
  hint?: string
}

export function setupProjectOptions(
  clients: ClientProfile[],
): SetupProjectOption[] {
  return [
    {
      value: CREATE_PROJECT,
      label: 'Create a new project',
      hint: 'Save a separate site and its data sources',
    },
    ...clients.map((client) => ({
      value: client.id,
      label: `Update ${client.name}`,
      hint: `${client.id}, ${client.siteUrl}`,
    })),
    {
      value: SKIP_PROJECT,
      label: 'Continue without a project profile',
      hint: 'Pass --site or --url when you run reports',
    },
  ]
}

export function nextAvailableProjectId(
  name: string,
  clients: ClientProfile[],
): string {
  const base = slugId(name)
  if (!base) throw new Error('Project id could not be derived.')
  const ids = new Set(clients.map((client) => client.id.toLowerCase()))
  if (!ids.has(base.toLowerCase())) return base
  let suffix = 2
  while (ids.has(`${base}-${suffix}`.toLowerCase())) suffix += 1
  return `${base}-${suffix}`
}

export async function chooseSetupProjectTarget(input: {
  clients: ClientProfile[]
  interactive: boolean
  requestedId?: string
  skipProfile?: boolean
  prompt?: (options: SetupProjectOption[]) => Promise<string | symbol>
}): Promise<SetupProjectTarget> {
  if (input.skipProfile) return { mode: 'skip' }
  if (input.requestedId) {
    const normalized = input.requestedId.toLowerCase()
    const normalizedId = slugId(input.requestedId).toLowerCase()
    const existing = input.clients.find(
      (client) =>
        client.id.toLowerCase() === normalizedId ||
        client.name.toLowerCase() === normalized,
    )
    return existing
      ? { mode: 'update', client: existing }
      : { mode: 'create', requestedId: input.requestedId }
  }
  if (!input.interactive) return { mode: 'create' }

  const options = setupProjectOptions(input.clients)
  const choice = maybeExitCancelled(
    await (input.prompt
      ? input.prompt(options)
      : select({
          message: 'Create a project or update an existing one?',
          options,
        })),
  )
  if (choice === CREATE_PROJECT) return { mode: 'create' }
  if (choice === SKIP_PROJECT) return { mode: 'skip' }
  const client = input.clients.find((item) => item.id === choice)
  if (!client) throw new Error(`Project not found: ${choice}`)
  return { mode: 'update', client }
}
