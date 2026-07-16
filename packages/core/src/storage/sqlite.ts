import Libsql from 'libsql'

type TransactionFunction = (...params: never[]) => unknown

function withoutDriverMetadata(row: unknown): unknown {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row
  const { _metadata: _driverMetadata, ...data } = row as Record<string, unknown>
  return data
}

class Statement {
  constructor(private readonly statement: Libsql.Statement) {}

  run(...params: unknown[]): SqliteDatabase.RunResult {
    return this.statement.run(...params)
  }

  get(...params: unknown[]): unknown {
    return withoutDriverMetadata(this.statement.get(...params))
  }

  all(...params: unknown[]): unknown[] {
    return this.statement.all(...params).map(withoutDriverMetadata)
  }
}

class SqliteDatabase {
  private readonly database: Libsql.Database

  constructor(filename: string | Buffer) {
    this.database = new Libsql(filename)
  }

  prepare(source: string): Statement {
    return new Statement(this.database.prepare(source))
  }

  transaction<F extends TransactionFunction>(fn: F): Libsql.Transaction<F> {
    return this.database.transaction(fn)
  }

  exec(source: string): this {
    this.database.exec(source)
    return this
  }

  pragma(source: string): unknown {
    const result = this.database.pragma(source)
    return Array.isArray(result)
      ? result.map(withoutDriverMetadata)
      : withoutDriverMetadata(result)
  }

  close(): this {
    this.database.close()
    return this
  }
}

namespace SqliteDatabase {
  export type Database = SqliteDatabase
  export type RunResult = {
    changes: number
    lastInsertRowid: number | bigint
  }
}

export default SqliteDatabase
