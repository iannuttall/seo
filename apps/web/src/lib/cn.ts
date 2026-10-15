// Joins class names and drops empty values. The site has no class merging
// library, so later classes do not remove earlier ones.
export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}
