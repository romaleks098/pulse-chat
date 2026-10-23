import Database from 'better-sqlite3';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { migrations } from './migrations/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const databaseUrl = process.env.DATABASE_URL?.trim();
export const isPostgres = Boolean(databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')));

// PostgreSQL Pool instance (used when DATABASE_URL is set)
let pgPool: pg.Pool | null = null;

// SQLite Database instance (used when DATABASE_URL is NOT set, for local development)
let sqliteDb: Database.Database | null = null;

if (isPostgres) {
  console.log('🐘 Initializing PostgreSQL database connection pool...');
  pgPool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl!.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pgPool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client:', err);
  });
} else {
  console.log('📁 Initializing local SQLite database...');
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, 'messenger.db');
  sqliteDb = new Database(dbPath);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
}

/**
 * Translates standard '?' placeholders to PostgreSQL '$1, $2...' positional placeholders,
 * safely ignoring any '?' characters inside single-quoted string literals.
 */
function translatePlaceholders(sql: string): string {
  let paramIndex = 1;
  return sql.replace(/(\?)(?=(?:[^']*'[^']*')*[^']*$)/g, () => `$${paramIndex++}`);
}

/**
 * Normalizes boolean/integer differences or date formatting if needed between engines.
 */
function normalizeParams(params: any[]): any[] {
  return params.map((p) => {
    if (p === undefined) return null;
    return p;
  });
}

/**
 * Unified Database Interface
 */
export interface IDatabase {
  isPostgres: boolean;
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  get<T = any>(sql: string, ...params: any[]): Promise<T | undefined>;
  all<T = any>(sql: string, ...params: any[]): Promise<T[]>;
  run(sql: string, ...params: any[]): Promise<{ lastInsertRowid: number | string; changes: number }>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (trx: IDatabase) => Promise<T>): Promise<T>;
  prepare(sql: string): {
    get(...params: any[]): Promise<any>;
    all(...params: any[]): Promise<any[]>;
    run(...params: any[]): Promise<{ lastInsertRowid: number | string; changes: number }>;
  };
}

class PostgresDatabaseAdapter implements IDatabase {
  public isPostgres = true;
  private client: any;

  constructor(client: any) {
    this.client = client;
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const pgSql = translatePlaceholders(sql);
    const cleanParams = normalizeParams(params);
    const result = await this.client.query(pgSql, cleanParams);
    return result.rows as T[];
  }

  async get<T = any>(sql: string, ...params: any[]): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  }

  async all<T = any>(sql: string, ...params: any[]): Promise<T[]> {
    return this.query<T>(sql, params);
  }

  async run(sql: string, ...params: any[]): Promise<{ lastInsertRowid: number | string; changes: number }> {
    const pgSql = translatePlaceholders(sql);
    const cleanParams = normalizeParams(params);
    const result = await this.client.query(pgSql, cleanParams);
    const firstRow = result.rows[0];
    const lastId = firstRow?.id || firstRow?.seq || 0;
    return {
      lastInsertRowid: lastId,
      changes: result.rowCount || 0,
    };
  }

  async exec(sql: string): Promise<void> {
    await this.client.query(sql);
  }

  async transaction<T>(fn: (trx: IDatabase) => Promise<T>): Promise<T> {
    if (typeof this.client.connect === 'function') {
      // Current client is the Pool, check out a client for transaction
      const client = await this.client.connect();
      const trxAdapter = new PostgresDatabaseAdapter(client);
      try {
        await client.query('BEGIN');
        const res = await fn(trxAdapter);
        await client.query('COMMIT');
        return res;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      // Already inside a client
      try {
        await this.client.query('SAVEPOINT sp');
        const res = await fn(this);
        await this.client.query('RELEASE SAVEPOINT sp');
        return res;
      } catch (err) {
        await this.client.query('ROLLBACK TO SAVEPOINT sp');
        throw err;
      }
    }
  }

  prepare(sql: string) {
    return {
      get: (...params: any[]) => this.get(sql, ...params),
      all: (...params: any[]) => this.all(sql, ...params),
      run: (...params: any[]) => this.run(sql, ...params),
    };
  }
}

class SQLiteDatabaseAdapter implements IDatabase {
  public isPostgres = false;
  private sqlite: Database.Database;

  constructor(sqlite: Database.Database) {
    this.sqlite = sqlite;
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const stmt = this.sqlite.prepare(sql);
    const cleanParams = normalizeParams(params);
    return stmt.all(...cleanParams) as T[];
  }

  async get<T = any>(sql: string, ...params: any[]): Promise<T | undefined> {
    const stmt = this.sqlite.prepare(sql);
    const cleanParams = normalizeParams(params);
    return stmt.get(...cleanParams) as T | undefined;
  }

  async all<T = any>(sql: string, ...params: any[]): Promise<T[]> {
    return this.query<T>(sql, params);
  }

  async run(sql: string, ...params: any[]): Promise<{ lastInsertRowid: number | string; changes: number }> {
    const stmt = this.sqlite.prepare(sql);
    const cleanParams = normalizeParams(params);
    const info = stmt.run(...cleanParams);
    return {
      lastInsertRowid: typeof info.lastInsertRowid === 'bigint' ? Number(info.lastInsertRowid) : info.lastInsertRowid,
      changes: info.changes,
    };
  }

  async exec(sql: string): Promise<void> {
    this.sqlite.exec(sql);
  }

  async transaction<T>(fn: (trx: IDatabase) => Promise<T>): Promise<T> {
    // Run inside BEGIN / COMMIT
    this.sqlite.exec('BEGIN');
    try {
      const res = await fn(this);
      this.sqlite.exec('COMMIT');
      return res;
    } catch (err) {
      this.sqlite.exec('ROLLBACK');
      throw err;
    }
  }

  prepare(sql: string) {
    return {
      get: (...params: any[]) => this.get(sql, ...params),
      all: (...params: any[]) => this.all(sql, ...params),
      run: (...params: any[]) => this.run(sql, ...params),
    };
  }
}

export const db: IDatabase = isPostgres
  ? new PostgresDatabaseAdapter(pgPool!)
  : new SQLiteDatabaseAdapter(sqliteDb!);

/**
 * Migration runner: ensures schema_migrations exists, applies all pending migrations
 */
export async function initDatabase() {
  console.log(`[Database] Initializing schema (${isPostgres ? 'PostgreSQL' : 'SQLite'})...`);

  // Create migrations tracker table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at ${isPostgres ? 'TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP' : 'DATETIME DEFAULT CURRENT_TIMESTAMP'}
    );
  `);

  // Query existing applied migration versions
  const appliedRows = await db.all<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version ASC');
  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  for (const m of migrations) {
    if (!appliedVersions.has(m.version)) {
      console.log(`[Database] Applying migration ${m.version}: ${m.name}...`);
      const statements = m.up(isPostgres);

      for (const statement of statements) {
        try {
          await db.exec(statement);
        } catch (stmtErr: any) {
          // If table/index already exists, ignore and continue
          if (!stmtErr.message.includes('already exists') && !stmtErr.message.includes('duplicate')) {
            console.warn(`[Database] Warning during migration ${m.name}:`, stmtErr.message);
          }
        }
      }

      await db.run(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
        m.version,
        m.name
      );
      console.log(`[Database] Successfully applied migration ${m.name}`);
    }
  }

  // Cleanup old sync events
  await cleanupOldSyncEvents();
  console.log('[Database] Schema initialization and migrations complete.');
}

let cachedServerEpoch = '';

export async function getServerEpoch(): Promise<string> {
  if (cachedServerEpoch) return cachedServerEpoch;

  try {
    const row = await db.get<{ value: string }>('SELECT value FROM server_meta WHERE key = ?', 'server_epoch');
    if (row && typeof row.value === 'string' && row.value) {
      cachedServerEpoch = row.value;
      return cachedServerEpoch;
    }

    const newEpoch = crypto.randomUUID();
    await db.run(
      'INSERT INTO server_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      'server_epoch',
      newEpoch
    );
    cachedServerEpoch = newEpoch;
    return newEpoch;
  } catch (err) {
    console.error('Error getting server epoch:', err);
    return 'default_epoch';
  }
}

export async function cleanupOldSyncEvents() {
  try {
    const query = isPostgres
      ? "DELETE FROM sync_events WHERE created_at < NOW() - INTERVAL '30 days'"
      : "DELETE FROM sync_events WHERE created_at < datetime('now', '-30 days')";
    await db.exec(query);
  } catch (err) {
    console.error('Error cleaning old sync events:', err);
  }
}

export async function recordSyncEvent(
  eventType: string,
  conversationId: string,
  payload: any,
  userId?: string
): Promise<number> {
  try {
    const row = await db.get<{ seq: number }>(
      'INSERT INTO sync_events (user_id, conversation_id, event_type, payload) VALUES (?, ?, ?, ?) RETURNING seq',
      userId || null,
      conversationId,
      eventType,
      JSON.stringify(payload)
    );

    const seq = Number(row?.seq || 0);
    return seq;
  } catch (err) {
    console.error('Failed to record sync event:', err);
    return 0;
  }
}
