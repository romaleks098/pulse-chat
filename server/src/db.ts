import Database from 'better-sqlite3';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { migrations } from './migrations/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const rawDatabaseUrl = process.env.DATABASE_URL?.trim();
const hasDatabaseUrl = Boolean(rawDatabaseUrl && rawDatabaseUrl.length > 0);

/**
 * Sanitizes and safely encodes DATABASE_URL if user passed special characters
 * (like '}' or brackets) in password without percent-encoding.
 */
export function sanitizeDatabaseUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  // Strip optional quotes around string e.g. "postgresql://..."
  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
    url = url.slice(1, -1).trim();
  }

  // Extract protocol://user:password@host...
  const match = url.match(/^(postgres(?:ql)?:\/\/)([^:]+):([^@]+)@(.+)$/);
  if (match) {
    const [, protocol, username, rawPassword, rest] = match;
    let cleanPassword = rawPassword;
    // Strip optional brackets around password e.g. [my_password]
    if (cleanPassword.startsWith('[') && cleanPassword.endsWith(']')) {
      cleanPassword = cleanPassword.slice(1, -1);
    }
    // Safely decode if already partially encoded, then encode special characters
    try {
      cleanPassword = decodeURIComponent(cleanPassword);
    } catch {}
    const safePassword = encodeURIComponent(cleanPassword);
    return `${protocol}${username}:${safePassword}@${rest}`;
  }
  return url;
}

const sanitizedUrl = hasDatabaseUrl ? sanitizeDatabaseUrl(rawDatabaseUrl!) : '';
export const isPostgres = Boolean(
  sanitizedUrl && (sanitizedUrl.startsWith('postgres://') || sanitizedUrl.startsWith('postgresql://'))
);

// Logging provider status (without leaking secrets)
console.log(`[Database] Provider: ${isPostgres ? 'PostgreSQL' : 'SQLite'} | DATABASE_URL: ${hasDatabaseUrl ? 'SET' : 'NOT SET'} | Environment: ${process.env.NODE_ENV || 'development'}`);

// STRICT PRODUCTION CHECK: SQLite is strictly forbidden in production to prevent data loss on ephemeral disks
if (isProduction) {
  if (!hasDatabaseUrl) {
    console.error('================================================================================');
    console.error('❌ [FATAL CONFIG ERROR] Running in PRODUCTION (NODE_ENV=production) requires PostgreSQL.');
    console.error('DATABASE_URL environment variable is NOT SET.');
    console.error('Ephemeral SQLite is strictly prohibited in production to prevent loss of chats/messages.');
    console.error('Please configure DATABASE_URL in your hosting environment (e.g. Render Dashboard -> Environment).');
    console.error('================================================================================');
    process.exit(1);
  }

  if (!isPostgres) {
    console.error('================================================================================');
    console.error('❌ [FATAL CONFIG ERROR] DATABASE_URL must start with postgresql:// or postgres://');
    console.error('Server refusing to start on SQLite in production.');
    console.error('================================================================================');
    process.exit(1);
  }
}

// PostgreSQL Pool instance
let pgPool: pg.Pool | null = null;

// SQLite Database instance (used only for local development when DATABASE_URL is not set)
let sqliteDb: Database.Database | null = null;

if (isPostgres) {
  pgPool = new pg.Pool({
    connectionString: sanitizedUrl,
    ssl: sanitizedUrl.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pgPool.on('error', (err) => {
    console.error('[Database] Unexpected error on idle PostgreSQL client:', err.message);
  });
} else {
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

function flattenParams(params: any[]): any[] {
  if (params.length === 1 && Array.isArray(params[0])) {
    return params[0];
  }
  return params;
}

function normalizeParams(params: any[]): any[] {
  const flat = flattenParams(params);
  return flat.map((p) => {
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

  if (isPostgres) {
    try {
      await pgPool!.query('SELECT 1');
      console.log('[Database] PostgreSQL connection verified successfully.');
    } catch (err: any) {
      console.error('[Database] PostgreSQL connection failed:', err.message);
      if (isProduction) {
        console.error('❌ [FATAL] Cannot connect to PostgreSQL in production. Aborting process.');
        process.exit(1);
      }
      throw err;
    }
  }

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
