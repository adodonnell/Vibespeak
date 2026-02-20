import pg from 'pg';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

let pool: pg.Pool | null = null;
let isDatabaseAvailable = false;

export function initDatabase(config?: Partial<DatabaseConfig>): pg.Pool {
  if (pool) {
    return pool;
  }

  const dbConfig: DatabaseConfig = {
    host: config?.host || process.env.POSTGRES_HOST || 'localhost',
    port: config?.port || parseInt(process.env.POSTGRES_PORT || '5432'),
    user: config?.user || process.env.POSTGRES_USER || 'vibespeak',
    password: config?.password || process.env.POSTGRES_PASSWORD || 'vibespeak123',
    database: config?.database || process.env.POSTGRES_DB || 'vibespeak',
  };

  pool = new Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('connect', () => {
    logger.info('Connected to PostgreSQL database');
    isDatabaseAvailable = true;
  });

  pool.on('error', (err) => {
    logger.error('PostgreSQL pool error:', err);
    isDatabaseAvailable = false;
  });

  // Test connection
  pool.query('SELECT 1')
    .then(() => {
      isDatabaseAvailable = true;
      logger.info('Database connection test successful');
    })
    .catch(() => {
      isDatabaseAvailable = false;
      logger.warn('Database not available - running in offline mode');
    });

  return pool;
}

export function isDbAvailable(): boolean {
  return isDatabaseAvailable && pool !== null;
}

export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return pool;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection closed');
  }
}

// Helper function to run a query
export async function query<T = pg.QueryResult>(
  text: string,
  params?: unknown[]
): Promise<T> {
  const result = await getPool().query(text, params);
  return result as T;
}

// Helper function to get a single row
export async function queryOne<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await getPool().query(text, params);
  return (result.rows[0] as T) || null;
}
