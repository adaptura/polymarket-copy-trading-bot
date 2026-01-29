import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function runMigration(migrationFile: string) {
    const connectionUrl = process.env.TIMESCALE_URL || process.env.DATABASE_URL;

    if (!connectionUrl) {
        console.error('Error: TIMESCALE_URL or DATABASE_URL not set in environment');
        process.exit(1);
    }

    const migrationPath = path.resolve(__dirname, '../db/migrations', migrationFile);

    if (!fs.existsSync(migrationPath)) {
        console.error(`Error: Migration file not found: ${migrationPath}`);
        process.exit(1);
    }

    const sql = fs.readFileSync(migrationPath, 'utf-8');

    console.log(`Running migration: ${migrationFile}`);
    console.log(`Database: ${connectionUrl.replace(/:[^:@]+@/, ':****@')}`);

    const pool = new Pool({ connectionString: connectionUrl });

    try {
        await pool.query(sql);
        console.log('✓ Migration completed successfully');
    } catch (error) {
        console.error('✗ Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Get migration file from command line args
const migrationFile = process.argv[2];

if (!migrationFile) {
    console.log('Usage: ts-node src/scripts/runMigration.ts <migration-file>');
    console.log(
        'Example: ts-node src/scripts/runMigration.ts 008_add_market_prices_and_aliases.sql'
    );
    console.log('\nAvailable migrations:');

    const migrationsDir = path.resolve(__dirname, '../db/migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    files.forEach((f) => console.log(`  - ${f}`));
    process.exit(0);
}

runMigration(migrationFile);
