import { providerRegistrationSchema } from './contracts.js'
import type {
  SeoProviderActionAdapter,
  SeoProviderCapabilityAdapter,
  SeoProviderCapabilityId,
  SeoProviderHost,
  SeoProviderRegistration,
} from './sdk.js'
import { SEO_PROVIDER_API_VERSION } from './sdk.js'

export type RegisteredProviderExtension = SeoProviderRegistration & {
  package: string
  version: string
}

export class ProviderExtensionRegistry {
  readonly #providers = new Map<string, RegisteredProviderExtension>()

  hostFor(input: { package: string; version: string }): SeoProviderHost {
    return {
      apiVersion: SEO_PROVIDER_API_VERSION,
      registerProvider: (provider) => {
        const parsed = providerRegistrationSchema.parse(provider)
        if (this.#providers.has(parsed.id)) {
          throw new Error(`Provider ${parsed.id} is already registered.`)
        }
        this.#providers.set(parsed.id, {
          ...parsed,
          package: input.package,
          version: input.version,
        })
      },
    }
  }

  get(id: string): RegisteredProviderExtension | undefined {
    return this.#providers.get(id)
  }

  capability<TId extends SeoProviderCapabilityId>(
    providerId: string,
    capabilityId: TId,
  ): Extract<SeoProviderCapabilityAdapter, { id: TId }> | undefined {
    return this.#providers
      .get(providerId)
      ?.capabilities?.find((capability) => capability.id === capabilityId) as
      | Extract<SeoProviderCapabilityAdapter, { id: TId }>
      | undefined
  }

  providersFor(capabilityId: SeoProviderCapabilityId) {
    return this.list().filter((provider) =>
      provider.capabilities?.some(
        (capability) => capability.id === capabilityId,
      ),
    )
  }

  action(
    providerId: string,
    actionId: string,
  ): SeoProviderActionAdapter | undefined {
    return this.#providers
      .get(providerId)
      ?.actions?.find((action) => action.id === actionId)
  }

  list(): RegisteredProviderExtension[] {
    return [...this.#providers.values()].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    )
  }
}
