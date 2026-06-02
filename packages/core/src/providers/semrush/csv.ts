export function parseSemicolonCsv(text: string): string[][] {
  return text
    .trim()
    .split('\n')
    .map((line) =>
      line.split(';').map((cell) => cell.replace(/^"|"$/g, '').trim()),
    )
}
