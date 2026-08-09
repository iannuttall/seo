export function parseEnv(source) {
  const values = new Map()
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) throw new Error('Invalid production vars file.')
    const name = line.slice(0, separator).trim()
    const rawValue = line.slice(separator + 1).trim()
    let value = rawValue
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      try {
        value = JSON.parse(rawValue)
      } catch {
        throw new Error(`Invalid quoted value for ${name}.`)
      }
    } else if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
      value = rawValue.slice(1, -1)
    }
    values.set(name, value)
  }
  return values
}

export function invalidRequiredSecretNames(values, requiredNames) {
  return requiredNames.filter((name) => {
    const value = values.get(name)
    return !value || value.startsWith('replace-with-')
  })
}

export function setEnvValue(source, name, value) {
  if (!/^[A-Z][A-Z0-9_]*$/u.test(name)) throw new Error('Invalid secret name.')
  if (!value || /[\r\n]/u.test(value)) throw new Error('Invalid secret value.')

  const assignment = `${name}=${JSON.stringify(value)}`
  const lines = source.split(/\r?\n/u)
  while (lines.at(-1) === '') lines.pop()
  const index = lines.findIndex((line) => line.startsWith(`${name}=`))
  if (index >= 0) lines[index] = assignment
  else lines.push(assignment)
  return `${lines.join('\n')}\n`
}
