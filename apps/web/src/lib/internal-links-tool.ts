// What the internal linking tool runs in the cloud, for the page's copy.
// The hosted server enforces the same numbers (INTERNAL_LINKS_LIMITS in
// apps/mcp/src/tool-internal-links.ts); change both together. A signed-in
// page shows the numbers the server sends.
export const ONLINE_LIMITS = {
  freePages: 100,
  freeRunsPerDay: 3,
  auditPages: 5000,
  auditRunsPerDay: 3,
} as const
