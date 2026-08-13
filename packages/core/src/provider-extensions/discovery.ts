import { loadInstalledProviderExtensions } from './loader.js'
import { readInstalledProviderPackages } from './store.js'

export async function listInstalledProviderExtensions() {
  const installed = readInstalledProviderPackages().packages
  const loaded = await loadInstalledProviderExtensions({ installed })
  const failures = new Map(
    loaded.failures.map((failure) => [failure.id, failure]),
  )
  return {
    schemaVersion: 1 as const,
    installed: installed.map((provider) => ({
      ...provider,
      loadStatus: failures.has(provider.id)
        ? ('failed' as const)
        : ('ready' as const),
      error: failures.get(provider.id)?.message,
    })),
  }
}

export async function describeInstalledProviderExtension(id: string) {
  const loaded = await loadInstalledProviderExtensions()
  const provider = loaded.registry.get(id)
  if (!provider) {
    const failure = loaded.failures.find((item) => item.id === id)
    throw new Error(
      failure
        ? `Provider ${id} could not load: ${failure.message}`
        : `Provider ${id} is not installed.`,
    )
  }
  return {
    schemaVersion: 1 as const,
    id: provider.id,
    displayName: provider.displayName,
    description: provider.description,
    package: provider.package,
    version: provider.version,
    kinds: provider.kinds,
    connection: provider.connection.fields.map((field) => ({
      id: field.id,
      label: field.label,
      description: field.description,
      kind: field.kind,
      required: field.required !== false,
      envVar: field.envVar,
    })),
    capabilities: provider.capabilities.map((capability) =>
      JSON.parse(JSON.stringify(capability)),
    ),
    actions: (provider.actions ?? []).map((action) => ({
      id: action.id,
      description: action.description,
      inputSchema: action.inputSchema,
      outputSchema: action.outputSchema,
      cacheTtlMs: action.cacheTtlMs ?? 0,
    })),
  }
}
