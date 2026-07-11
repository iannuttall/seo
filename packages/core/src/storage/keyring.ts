type Keyring = {
  getPassword(service: string, account: string): Promise<string | null>
  setPassword(service: string, account: string, password: string): Promise<void>
  deletePassword(service: string, account: string): Promise<boolean>
}

let testKeyring: Keyring | undefined
let useTestKeyring = false
let loadedKeyring: Promise<Keyring> | undefined

async function resolveKeyring(): Promise<Keyring> {
  if (useTestKeyring && testKeyring) return testKeyring
  if (!loadedKeyring) {
    loadedKeyring = import('@napi-rs/keyring/keytar.js').then(
      (module) => module,
    )
  }
  return loadedKeyring
}

export async function getKeyringPassword(
  service: string,
  account: string,
): Promise<string | null> {
  return (await resolveKeyring()).getPassword(service, account)
}

export async function setKeyringPassword(
  service: string,
  account: string,
  password: string,
): Promise<void> {
  await (await resolveKeyring()).setPassword(service, account, password)
}

export async function deleteKeyringPassword(
  service: string,
  account: string,
): Promise<boolean> {
  return (await resolveKeyring()).deletePassword(service, account)
}

export function setKeyringForTests(keyring?: Keyring): void {
  testKeyring = keyring
  useTestKeyring = keyring !== undefined
}
