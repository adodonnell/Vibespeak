/**
 * Database Migration System for VibeSpeak Server
 * 
 * A simple migration system that tracks applied migrations in the database
 * and provides commands to run, rollback, and check migration status.
 */

import { query, isDbAvailable } from './database.js';
import { logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Migration record interface
interface MigrationRecord {
  id: number;
  name: string;
  applied_at: Date;
}

// Migration file interface
interface Migration {
  name: string;
  up: string;
  down: string;
}

/**
 * Ensure the migrations table exists
 */
async function ensureMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
}

/**
 * Get list of already applied migrations
 */
async function getAppliedMigrations(): Promise<string[]> {
  const result = await query(
    'SELECT name FROM schema_migrations ORDER BY id'
  );
  return result.rows.map((row: { name: string }) => row.name);
}

/**
 * Load migration files from disk
 */
async function loadMigrationFiles(): Promise<Migration[]> {
  const migrationsDir = path.join(__dirname, 'migrations');
  
  try {
    await fs.access(migrationsDir);
  } catch {
    logger.warn('Migrations directory not found, creating it...');
    await fs.mkdir(migrationsDir, { recursive: true });
    return [];
  }
  
  const files = await fs.readdir(migrationsDir);
  const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();
  
  const migrations: Migration[] = [];
  
  for (const file of sqlFiles) {
    const filePath = path.join(migrationsDir, file);
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Parse the migration file - split by UP and DOWN markers
    const upMatch = content.match(/--\s*UP\s*\n([\s\S]*?)(?=--\s*DOWN|$)/i);
    const downMatch = content.match(/--\s*DOWN\s*\n([\s\S]*?)$/i);
    
    migrations.push({
      name: file,
      up: upMatch?.[1]?.trim() || '',
      down: downMatch?.[1]?.trim() || '',
    });
  }
  
  return migrations;
}

/**
 * Run pending migrations
 */
export async function runMigrations(): Promise<{ applied: string[]; errors: Error[] }> {
  if (!isDbAvailable()) {
    throw new Error('Database not available');
  }
  
  await ensureMigrationsTable();
  
  const applied = await getAppliedMigrations();
  const migrations = await loadMigrationFiles();
  
  const pending = migrations.filter(m => !applied.includes(m.name));
  const appliedNow: string[] = [];
  const errors: Error[] = [];
  
  if (pending.length === 0) {
    logger.info('No pending migrations');
    return { applied: [], errors: [] };
  }
  
  logger.info(`Found ${pending.length} pending migration(s)`);
  
  for (const migration of pending) {
    try {
      logger.info(`Applying migration: ${migration.name}`);
      
      // Run the migration in a transaction
      await query('BEGIN');
      
      if (migration.up) {
        await query(migration.up);
      }
      
      await query(
        'INSERT INTO schema_migrations (name) VALUES ($1)',
        [migration.name]
      );
      
      await query('COMMIT');
      
      appliedNow.push(migration.name);
      logger.info(`Successfully applied: ${migration.name}`);
    } catch (err) {
      await query('ROLLBACK');
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(`Failed to apply migration ${migration.name}:`, error);
      errors.push(error);
      
      // Stop on first error to maintain consistency
      break;
    }
  }
  
  return { applied: appliedNow, errors };
}

/**
 * Rollback the last N migrations
 */
export async function rollbackMigrations(count: number = 1): Promise<{ rolledBack: string[]; errors: Error[] }> {
  if (!isDbAvailable()) {
    throw new Error('Database not available');
  }
  
  await ensureMigrationsTable();
  
  const applied = await getAppliedMigrations();
  const migrations = await loadMigrationFiles();
  
  // Get the last N applied migrations
  const toRollback = applied.slice(-count).reverse();
  const rolledBack: string[] = [];
  const errors: Error[] = [];
  
  if (toRollback.length === 0) {
    logger.info('No migrations to rollback');
    return { rolledBack: [], errors: [] };
  }
  
  for (const migrationName of toRollback) {
    const migration = migrations.find(m => m.name === migrationName);
    
    if (!migration) {
      logger.warn(`Migration file not found for ${migrationName}, skipping`);
      continue;
    }
    
    try {
      logger.info(`Rolling back migration: ${migrationName}`);
      
      await query('BEGIN');
      
      if (migration.down) {
        await query(migration.down);
      }
      
      await query(
        'DELETE FROM schema_migrations WHERE name = $1',
        [migrationName]
      );
      
      await query('COMMIT');
      
      rolledBack.push(migrationName);
      logger.info(`Successfully rolled back: ${migrationName}`);
    } catch (err) {
      await query('ROLLBACK');
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(`Failed to rollback migration ${migrationName}:`, error);
      errors.push(error);
      break;
    }
  }
  
  return { rolledBack, errors };
}

/**
 * Get migration status
 */
export async function getMigrationStatus(): Promise<{
  applied: string[];
  pending: string[];
}> {
  if (!isDbAvailable()) {
    return { applied: [], pending: [] };
  }
  
  await ensureMigrationsTable();
  
  const applied = await getAppliedMigrations();
  const migrations = await loadMigrationFiles();
  
  const pending = migrations
    .filter(m => !applied.includes(m.name))
    .map(m => m.name);
  
  return { applied, pending };
}

/**
 * Create a new migration file
 */
export async function createMigration(name: string): Promise<string> {
  const migrationsDir = path.join(__dirname, 'migrations');
  await fs.mkdir(migrationsDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const filename = `${timestamp}_${name.replace(/\s+/g, '_').toLowerCase()}.sql`;
  const filePath = path.join(migrationsDir, filename);
  
  const template = `-- Migration: ${name}
-- Created at: ${new Date().toISOString()}

-- UP
-- Write your migration SQL here
-- Example:
-- CREATE TABLE example (
--   id SERIAL PRIMARY KEY,
--   name VARCHAR(255) NOT NULL,
--   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );

-- DOWN
-- Write your rollback SQL here
-- Example:
-- DROP TABLE IF EXISTS example;
`;
  
  await fs.writeFile(filePath, template, 'utf-8');
  logger.info(`Created migration file: ${filename}`);
  
  return filename;
}

// Export for CLI usage
export const migrationCli = {
  up: async () => {
    const result = await runMigrations();
    console.log(`Applied ${result.applied.length} migration(s)`);
    if (result.errors.length > 0) {
      console.error('Errors:', result.errors);
      process.exit(1);
    }
  },
  down: async (count: number = 1) => {
    const result = await rollbackMigrations(count);
    console.log(`Rolled back ${result.rolledBack.length} migration(s)`);
    if (result.errors.length > 0) {
      console.error('Errors:', result.errors);
      process.exit(1);
    }
  },
  status: async () => {
    const status = await getMigrationStatus();
    console.log('Applied migrations:', status.applied);
    console.log('Pending migrations:', status.pending);
  },
  create: async (name: string) => {
    const filename = await createMigration(name);
    console.log(`Created: ${filename}`);
  },
};