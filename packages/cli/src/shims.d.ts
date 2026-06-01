declare module 'update-notifier'
declare module '@seo/mcp' {
  export function startMcpServer(opts?: { test?: boolean }): Promise<void>
}
