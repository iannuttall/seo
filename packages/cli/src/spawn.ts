import {
  type SpawnSyncOptions,
  type SpawnSyncReturns,
  spawnSync,
} from 'node:child_process'

// spawnSync that also starts Windows .cmd shims such as npx, npm.cmd and
// codex.cmd, which Node runs only through a shell. On Windows each argument
// is quoted for cmd.exe; elsewhere this is plain spawnSync.
export function spawnCommand(
  command: string,
  args: string[],
  options: SpawnSyncOptions = {},
): SpawnSyncReturns<string | Buffer> {
  if (process.platform !== 'win32') return spawnSync(command, args, options)
  const quote = (value: string) =>
    /^[\w./:=@\\-]+$/.test(value) ? value : `"${value.replaceAll('"', '""')}"`
  return spawnSync([command, ...args].map(quote).join(' '), {
    ...options,
    shell: true,
  })
}
