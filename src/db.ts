// Every database call goes through here, so that rows written are counted for
// the owner's usage panel without any extra database work.
export type Param = string | number | null;

export class Db {
  private readonly d1: D1Database;
  private readonly onWrites: (rows: number) => void;

  constructor(d1: D1Database, onWrites: (rows: number) => void) {
    this.d1 = d1;
    this.onWrites = onWrites;
  }

  private count(meta: { rows_written?: number } | undefined): void {
    this.onWrites(meta?.rows_written ?? 0);
  }

  async all<T>(sql: string, ...params: Param[]): Promise<T[]> {
    const res = await this.d1.prepare(sql).bind(...params).all<T>();
    this.count(res.meta);
    return res.results;
  }

  async first<T>(sql: string, ...params: Param[]): Promise<T | null> {
    return (await this.all<T>(sql, ...params))[0] ?? null;
  }

  /** Runs one statement; returns how many rows it changed. */
  async run(sql: string, ...params: Param[]): Promise<number> {
    const res = await this.d1.prepare(sql).bind(...params).run();
    this.count(res.meta);
    return res.meta.changes ?? 0;
  }

  /** Runs several statements in one transaction. */
  async batch(statements: [string, ...Param[]][]): Promise<void> {
    const results = await this.d1.batch(statements.map(([sql, ...params]) => this.d1.prepare(sql).bind(...params)));
    for (const r of results) this.count(r.meta);
  }
}
