#!/usr/bin/env node
/**
 * Migration CLI for VibeSpeak Server
 * 
 * Usage:
 *   npm run migrate              # Run pending migrations
 *   npm run migrate:up           # Run pending migrations
 *   npm run migrate:down [n]     # Rollback last n migrations (default: 1)
 *   npm run migrate:status       # Show migration status
 *   npm run migrate:create [name] # Create a new migration file
 */

import 'dotenv/config';
import { migrationCli } from './db/migrations.js';

const command = process.argv[2];
const arg = process.argv[3];

async function main(): Promise<void> {
  try {
    switch (command) {
      case 'up':
      case undefined:
        await migrationCli.up();
        break;
        
      case 'down':
        await migrationCli.down(arg ? parseInt(arg, 10) : 1);
        break;
        
      case 'status':
        await migrationCli.status();
        break;
        
      case 'create':
        if (!arg) {
          console.error('Usage: npm run migrate:create <migration-name>');
          process.exit(1);
        }
        await migrationCli.create(arg);
        break;
        
      default:
        console.log(`
VibeSpeak Migration CLI

Commands:
  up              Run pending migrations (default)
  down [n]        Rollback last n migrations (default: 1)
  status          Show migration status
  create <name>   Create a new migration file

Examples:
  npm run migrate
  npm run migrate:down 2
  npm run migrate:status
  npm run migrate:create add_user_settings
        `);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

main();