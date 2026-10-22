// Every SQL statement in the site object goes through here, so each wake
// knows the rows it read and wrote, which is what Cloudflare bills. The
// totals are saved in the run row at the end of each wake, not only kept in
// memory. setAlarm() is billed as one row written and is counted by callers.

export class Meter {
  rowsRead = 0
  rowsWritten = 0

  constructor(private readonly storage: DurableObjectStorage) {}

  all<T extends Record<string, SqlStorageValue>>(
    query: string,
    ...bindings: unknown[]
  ): T[] {
    const cursor = this.storage.sql.exec<T>(query, ...bindings)
    const rows = cursor.toArray()
    this.rowsRead += cursor.rowsRead
    this.rowsWritten += cursor.rowsWritten
    return rows
  }

  one<T extends Record<string, SqlStorageValue>>(
    query: string,
    ...bindings: unknown[]
  ): T | null {
    return this.all<T>(query, ...bindings)[0] ?? null
  }

  run(query: string, ...bindings: unknown[]): void {
    this.all(query, ...bindings)
  }

  transaction<T>(fn: () => T): T {
    return this.storage.transactionSync(fn)
  }
}
