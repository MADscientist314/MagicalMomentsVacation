// A D1-compatible stand-in over Node's built-in SQLite, for unit tests.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

type Value = string | number | bigint | null | Uint8Array;

class FakeStatement {
  constructor(
    private db: DatabaseSync,
    readonly sql: string,
    private params: Value[] = [],
  ) {}

  bind(...values: unknown[]): FakeStatement {
    return new FakeStatement(this.db, this.sql, values.map((v) => (v === undefined ? null : (v as Value))));
  }

  async all<T>() {
    return this.allSync<T>();
  }

  allSync<T>() {
    return { results: this.db.prepare(this.sql).all(...this.params) as T[], success: true, meta: {} };
  }

  async first<T>(column?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }

  async run() {
    return this.runSync();
  }

  runSync() {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

export function fakeD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const dir = join(import.meta.dirname, "..", "..", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    db.exec(readFileSync(join(dir, file), "utf8"));
  }
  const fake = {
    prepare: (sql: string) => new FakeStatement(db, sql),
    // All-or-nothing and one batch at a time, like D1 (synchronous, so concurrent batches can't interleave).
    async batch(statements: FakeStatement[]) {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const s of statements) {
          results.push(/^\s*(select|with)/i.test(s.sql) ? s.allSync() : s.runSync());
        }
        db.exec("COMMIT");
        return results;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
    async exec(sql: string) {
      db.exec(sql);
      return { count: 1, duration: 0 };
    },
  };
  return fake as unknown as D1Database;
}
