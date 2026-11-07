// DbClient — read-only, parameterised DB access for the integration tier (generating-api-script
// rule 5). Driver is chosen from the DB_CONNECTION scheme and loaded lazily, so the platform
// installs only the driver it needs:
//   postgres://…  → npm i -D pg          mssql://… or "Server=…" → npm i -D mssql
//   mysql://…     → npm i -D mysql2
// Queries use NAMED parameters (`WHERE id = @id`) and are rewritten per driver. Anything that is
// not a SELECT/WITH is refused — mutations happen through the API under test, never here.
type Row = Record<string, unknown>;
type Params = Record<string, string | number | boolean | null>;
type Driver = 'pg' | 'mssql' | 'mysql2';

interface Executor {
  query(sql: string, params: Params): Promise<Row[]>;
  close(): Promise<void>;
}

const READ_ONLY = /^\s*(select|with)\b/i;
const FORBIDDEN = /\b(insert|update|delete|merge|drop|alter|create|truncate|grant|exec|execute)\b/i;

export class DbClient {
  private exec: Executor | undefined;

  constructor(private readonly connection: string | undefined = process.env.DB_CONNECTION) {}

  /** true when DB_CONNECTION is set — specs guard with test.skip(!db.configured, 'DB_CONNECTION not set'). */
  get configured(): boolean {
    return !!this.connection;
  }

  async queryAll<T extends Row = Row>(sql: string, params: Params = {}): Promise<T[]> {
    if (!READ_ONLY.test(sql) || FORBIDDEN.test(sql)) {
      throw new Error(`DbClient is read-only: refused "${sql.slice(0, 80)}" — assert state, never change it (mutations go through the API under test)`);
    }
    const missing = [...sql.matchAll(/@([a-zA-Z_][a-zA-Z0-9_]*)/g)].map((m) => m[1]).filter((k) => !(k in params));
    if (missing.length) throw new Error(`DbClient: parameter(s) ${missing.join(', ')} used in SQL but not supplied`);
    return (await (await this.executor()).query(sql, params)) as T[];
  }

  async queryOne<T extends Row = Row>(sql: string, params: Params = {}): Promise<T | undefined> {
    const rows = await this.queryAll<T>(sql, params);
    return rows[0];
  }

  async close(): Promise<void> {
    await this.exec?.close();
    this.exec = undefined;
  }

  private async executor(): Promise<Executor> {
    if (this.exec) return this.exec;
    if (!this.connection) throw new Error('DB_CONNECTION is empty — fill <qa-root>/.env.<env> or skip the DB steps with test.skip(!db.configured, …)');
    const driver = detectDriver(this.connection);
    this.exec = await loadExecutor(driver, this.connection);
    return this.exec;
  }
}

function detectDriver(conn: string): Driver {
  if (/^postgres(ql)?:\/\//i.test(conn)) return 'pg';
  if (/^mysql:\/\//i.test(conn)) return 'mysql2';
  if (/^mssql:\/\//i.test(conn) || /(^|;)\s*server\s*=/i.test(conn)) return 'mssql';
  throw new Error('DB_CONNECTION scheme not recognised — use postgres://, mysql://, mssql:// or an ADO.NET "Server=…" string');
}

/** Rewrite `@name` placeholders to the driver's positional/named style. */
function bind(sql: string, params: Params, style: 'dollar' | 'question' | 'named'): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  const out = sql.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_m, name: string) => {
    if (style === 'named') return `@${name}`;
    values.push(params[name]);
    return style === 'dollar' ? `$${values.length}` : '?';
  });
  return { sql: out, values };
}

async function loadExecutor(driver: Driver, conn: string): Promise<Executor> {
  const hint = `> Project setup required: \`cd qa && npm i -D ${driver}\` (driver for DB_CONNECTION)`;
  let mod: unknown;
  try {
    mod = await import(driver);
  } catch {
    throw new Error(`DB driver "${driver}" is not installed.\n${hint}`);
  }
  if (driver === 'pg') {
    const { Pool } = mod as { Pool: new (o: { connectionString: string }) => { query(q: string, v: unknown[]): Promise<{ rows: Row[] }>; end(): Promise<void> } };
    const pool = new Pool({ connectionString: conn });
    return {
      async query(sql, params) { const b = bind(sql, params, 'dollar'); return (await pool.query(b.sql, b.values)).rows; },
      close: () => pool.end(),
    };
  }
  if (driver === 'mysql2') {
    const m = mod as { createPool(o: string): { query(q: string, v: unknown[]): Promise<[Row[], unknown]>; end(): Promise<void> } };
    const pool = m.createPool(conn);
    return {
      async query(sql, params) { const b = bind(sql, params, 'question'); return (await pool.query(b.sql, b.values))[0]; },
      close: () => pool.end(),
    };
  }
  // mssql — named parameters are native (`@id`)
  const m = mod as {
    connect(c: string): Promise<{ request(): { input(n: string, v: unknown): unknown; query(q: string): Promise<{ recordset: Row[] }> }; close(): Promise<void> }>;
  };
  const pool = await m.connect(conn);
  return {
    async query(sql, params) {
      const req = pool.request();
      for (const [k, v] of Object.entries(params)) req.input(k, v);
      return (await req.query(sql)).recordset;
    },
    close: () => pool.close(),
  };
}
