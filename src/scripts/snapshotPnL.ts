#!/usr/bin/env npx ts-node
/**
 * P&L Snapshot CLI
 *
 * Usage:
 *   npx ts-node src/scripts/snapshotPnL.ts backfill              # Backfill all traders
 *   npx ts-node src/scripts/snapshotPnL.ts backfill <address>    # Backfill specific trader
 *   npx ts-node src/scripts/snapshotPnL.ts snapshot              # Snapshot all traders
 *   npx ts-node src/scripts/snapshotPnL.ts snapshot <address>    # Snapshot specific trader
 *   npx ts-node src/scripts/snapshotPnL.ts add <address> <alias> # Add new trader
 *   npx ts-node src/scripts/snapshotPnL.ts list                  # List all traders
 */

import { config } from 'dotenv';
import pnlSnapshotService from '../services/pnlSnapshotService';

// Load environment
config();

const TIMESCALE_URL = process.env.TIMESCALE_URL;

if (!TIMESCALE_URL) {
  console.error('ERROR: TIMESCALE_URL environment variable is required');
  process.exit(1);
}

async function main() {
  const [command, arg1, arg2] = process.argv.slice(2);

  if (!command) {
    printUsage();
    process.exit(1);
  }

  // Connect to database
  await pnlSnapshotService.connect(TIMESCALE_URL!);

  try {
    switch (command.toLowerCase()) {
      case 'backfill':
        await runBackfill(arg1);
        break;

      case 'snapshot':
        await runSnapshot(arg1);
        break;

      case 'add':
        await addTrader(arg1, arg2);
        break;

      case 'list':
        await listTraders();
        break;

      case 'test':
        await testPolymarketApi(arg1);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } finally {
    await pnlSnapshotService.disconnect();
  }
}

function printUsage() {
  console.log(`
P&L Snapshot CLI

Usage:
  npx ts-node src/scripts/snapshotPnL.ts <command> [args]

Commands:
  backfill [address]     Backfill historical P&L from Polymarket
                         If address provided, backfill that trader only
                         Otherwise, backfill all active traders

  snapshot [address]     Take current P&L snapshot
                         If address provided, snapshot that trader only
                         Otherwise, snapshot all active traders

  add <address> <alias>  Add a new trader to track

  list                   List all tracked traders

  test <address>         Test Polymarket API for an address
`);
}

async function runBackfill(address?: string) {
  if (address) {
    console.log(`\nBackfilling trader: ${address}`);
    const result = await pnlSnapshotService.backfillTrader(address);
    console.log(`\nResult: ${result.fetched} fetched, ${result.inserted} inserted`);
  } else {
    console.log('\nBackfilling all active traders...\n');
    const results = await pnlSnapshotService.backfillAllTraders();

    console.log('\n--- Summary ---');
    let totalFetched = 0;
    let totalInserted = 0;

    for (const [addr, result] of results) {
      console.log(`  ${addr.slice(0, 10)}...: ${result.fetched} fetched, ${result.inserted} inserted`);
      totalFetched += result.fetched;
      totalInserted += result.inserted;
    }

    console.log(`\nTotal: ${totalFetched} fetched, ${totalInserted} inserted`);
  }
}

async function runSnapshot(address?: string) {
  if (address) {
    console.log(`\nTaking snapshot for: ${address}`);
    const snapshot = await pnlSnapshotService.snapshotTrader(address);
    console.log(`\nSnapshot taken:`);
    console.log(`  Time: ${snapshot.time.toISOString()}`);
    console.log(`  Realized P&L: $${snapshot.realizedPnl.toFixed(2)}`);
    console.log(`  Unrealized P&L: $${snapshot.unrealizedPnl.toFixed(2)}`);
    console.log(`  Total P&L: $${snapshot.totalPnl.toFixed(2)}`);
    console.log(`  Positions: ${snapshot.positionCount}`);
  } else {
    console.log('\nTaking snapshots for all active traders...\n');
    const snapshots = await pnlSnapshotService.snapshotAllTraders();

    console.log('\n--- Snapshots ---');
    for (const snapshot of snapshots) {
      console.log(`  ${snapshot.traderAddress.slice(0, 10)}...: $${snapshot.totalPnl.toFixed(2)} (${snapshot.positionCount} positions)`);
    }

    console.log(`\nTotal: ${snapshots.length} snapshots taken`);
  }
}

async function addTrader(address?: string, alias?: string) {
  if (!address || !alias) {
    console.error('ERROR: Both address and alias are required');
    console.log('Usage: npx ts-node src/scripts/snapshotPnL.ts add <address> <alias>');
    process.exit(1);
  }

  console.log(`\nAdding trader: ${alias} (${address})`);

  // Verify address exists on Polymarket
  console.log('Verifying address on Polymarket...');
  try {
    const pnl = await pnlSnapshotService.fetchCurrentPnL(address);
    console.log(`  Current P&L: $${pnl.totalPnl.toFixed(2)} (${pnl.positionCount} positions)`);
  } catch (error) {
    console.error(`  WARNING: Could not fetch data from Polymarket. Address may be invalid.`);
  }

  // Add to database
  const trader = await pnlSnapshotService.addTrader(address, alias);
  console.log(`\nTrader added:`);
  console.log(`  Address: ${trader.address}`);
  console.log(`  Alias: ${trader.alias}`);
  console.log(`  Active: ${trader.isActive}`);

  // Ask if user wants to backfill
  console.log('\nTo backfill historical data, run:');
  console.log(`  npx ts-node src/scripts/snapshotPnL.ts backfill ${address}`);
}

async function listTraders() {
  const traders = await pnlSnapshotService.getTrackedTraders(false);

  if (traders.length === 0) {
    console.log('\nNo traders tracked yet.');
    console.log('Add a trader with: npx ts-node src/scripts/snapshotPnL.ts add <address> <alias>');
    return;
  }

  console.log(`\n--- Tracked Traders (${traders.length}) ---\n`);

  for (const trader of traders) {
    const status = trader.isActive ? '✓' : '✗';
    const latest = await pnlSnapshotService.getLatestSnapshot(trader.address);

    console.log(`${status} ${trader.alias}`);
    console.log(`  Address: ${trader.address}`);
    if (latest) {
      console.log(`  Latest P&L: $${latest.totalPnl.toFixed(2)} (${latest.time.toISOString()})`);
    } else {
      console.log(`  Latest P&L: No data - run backfill`);
    }
    console.log();
  }
}

async function testPolymarketApi(address?: string) {
  if (!address) {
    console.error('ERROR: Address is required');
    console.log('Usage: npx ts-node src/scripts/snapshotPnL.ts test <address>');
    process.exit(1);
  }

  console.log(`\nTesting Polymarket API for: ${address}\n`);

  // Test positions API
  console.log('1. Testing positions API (data-api.polymarket.com/positions)...');
  try {
    const pnl = await pnlSnapshotService.fetchCurrentPnL(address);
    console.log(`   ✓ Success`);
    console.log(`   Realized P&L: $${pnl.realizedPnl.toFixed(2)}`);
    console.log(`   Unrealized P&L: $${pnl.unrealizedPnl.toFixed(2)}`);
    console.log(`   Total P&L: $${pnl.totalPnl.toFixed(2)}`);
    console.log(`   Positions: ${pnl.positionCount}`);
  } catch (error) {
    console.log(`   ✗ Failed: ${error}`);
  }

  // Test historical P&L API
  console.log('\n2. Testing historical P&L API (user-pnl-api.polymarket.com)...');
  try {
    const history = await pnlSnapshotService.fetchHistoricalPnL(address, 'all', '1d');
    console.log(`   ✓ Success`);
    console.log(`   Data points: ${history.length}`);
    if (history.length > 0) {
      const first = history[0];
      const last = history[history.length - 1];
      console.log(`   First: ${first.time.toISOString()} - $${first.pnl.toFixed(2)}`);
      console.log(`   Last: ${last.time.toISOString()} - $${last.pnl.toFixed(2)}`);
    }
  } catch (error) {
    console.log(`   ✗ Failed: ${error}`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
