/**
 * Backfill TimescaleDB with Historical Trades
 *
 * Fetches historical trade data from Polymarket API and loads into TimescaleDB.
 * Uses date-range chunking to overcome API's ~3100 offset pagination limit.
 *
 * Environment Variables:
 *   HISTORY_DAYS       - Number of days to fetch (default: 30)
 *   CHUNK_HOURS        - Size of each time chunk in hours (default: 24)
 *                        Use smaller values (6-12) for very active traders
 *   HISTORY_MAX_TRADES - Max trades per trader (default: unlimited)
 *   LOG_DUPLICATES     - Set to 'true' to log duplicates to DB for debugging
 *
 * Usage:
 *   npm run analytics:backfill
 *   HISTORY_DAYS=90 npm run analytics:backfill
 *   HISTORY_DAYS=365 CHUNK_HOURS=12 npm run analytics:backfill
 *   HISTORY_DAYS=365 npm run analytics:backfill -- --trader 0x1234...
 */

import * as dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import timescaleService, { TradeRecord } from '../services/timescaleService';
import { ENV } from '../config/env';

const TIMESCALE_URL = process.env.TIMESCALE_URL as string;

if (!TIMESCALE_URL) {
    console.error('Error: TIMESCALE_URL environment variable is not set');
    process.exit(1);
}

// Configuration from environment
const HISTORY_DAYS = (() => {
    const raw = process.env.HISTORY_DAYS;
    const value = raw ? Number(raw) : 30;
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 30;
})();

// No limit by default - fetch all trades
const MAX_TRADES_PER_TRADER = (() => {
    const raw = process.env.HISTORY_MAX_TRADES;
    if (!raw) return Infinity;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : Infinity;
})();

const BATCH_SIZE = 100;
const INSERT_BATCH_SIZE = 500;

// Date-range chunking to overcome API's ~3100 offset limit
// Default to 1 day chunks - safe for most traders
const CHUNK_HOURS = (() => {
    const raw = process.env.CHUNK_HOURS;
    const value = raw ? Number(raw) : 24; // Default 24 hours (1 day)
    return Number.isFinite(value) && value > 0 ? value : 24;
})();

type ActivityType = 'TRADE' | 'REDEEM' | 'SPLIT' | 'MERGE';

interface TradeApiResponse {
    timestamp: number;
    transactionHash: string;
    conditionId: string;
    slug?: string;
    title?: string;
    eventSlug?: string;
    asset: string;
    type: ActivityType;
    side: 'BUY' | 'SELL';
    price: number;
    usdcSize: number;
    size: number;
    outcome?: string;
    proxyWallet?: string;
    outcomeIndex?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Store duplicates for debugging
const LOG_DUPLICATES = process.env.LOG_DUPLICATES === 'true';

interface DuplicateInfo {
    trade: TradeApiResponse;
    key: string;
    offset: number;
}

// Parse command line arguments
function parseArgs(): { traders: string[] } {
    const args = process.argv.slice(2);
    let traders: string[] = [];

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--trader' && args[i + 1]) {
            traders.push(args[i + 1].toLowerCase());
            i++;
        }
    }

    // Default to USER_ADDRESSES if no specific traders specified
    if (traders.length === 0) {
        traders = ENV.USER_ADDRESSES;
    }

    return { traders };
}

// Activity types to fetch
const ACTIVITY_TYPES: ActivityType[] = ['TRADE', 'REDEEM'];

async function fetchBatch(
    address: string,
    activityType: ActivityType,
    offset: number,
    limit: number,
    startTs?: number,
    endTs?: number
): Promise<TradeApiResponse[]> {
    // Build URL with optional timestamp filtering
    let url = `https://data-api.polymarket.com/activity?user=${address}&type=${activityType}&limit=${limit}&offset=${offset}`;
    if (startTs) url += `&start=${startTs}`;
    if (endTs) url += `&end=${endTs}`;

    const response = await axios.get(url, {
        timeout: 15000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
    });

    const data = Array.isArray(response.data) ? response.data : [];
    // Ensure type is set on each record
    return data.map((item: TradeApiResponse) => ({ ...item, type: activityType }));
}

// API limit threshold - if we get this many trades, chunk likely hit the limit
const API_LIMIT_THRESHOLD = 3000;
// Minimum chunk size in seconds (15 min) - don't split smaller than this
const MIN_CHUNK_SECONDS = 15 * 60;

/**
 * Fetch trades for a single time chunk (date range)
 * Uses chunk-local deduplication to detect API cycling
 * Returns hitLimit flag to trigger adaptive splitting
 */
async function fetchChunk(
    address: string,
    activityType: ActivityType,
    startTs: number,
    endTs: number,
    globalSeenIds: Set<string>,
    duplicates: DuplicateInfo[]
): Promise<{ trades: TradeApiResponse[]; newDuplicates: number; hitLimit: boolean }> {
    let offset = 0;
    let chunkTrades: TradeApiResponse[] = [];
    let hasMore = true;
    let retries = 0;
    const maxRetries = 3;
    let duplicatesInChunk = 0;

    // Track IDs seen within THIS chunk only (for API cycling detection)
    const chunkSeenIds = new Set<string>();

    while (hasMore) {
        try {
            const batch = await fetchBatch(address, activityType, offset, BATCH_SIZE, startTs, endTs);

            if (batch.length === 0) {
                hasMore = false;
                break;
            }

            let cyclingDupes = 0;

            for (const trade of batch) {
                // Skip if outside our time range (API might not filter precisely)
                if (trade.timestamp < startTs || trade.timestamp > endTs) {
                    continue;
                }

                // Composite key for deduplication
                const key = `${trade.transactionHash}:${trade.asset}:${trade.size}:${trade.price}:${trade.timestamp}`;

                // Check if we've seen this in THIS chunk (API cycling)
                if (chunkSeenIds.has(key)) {
                    cyclingDupes++;
                    continue;
                }
                chunkSeenIds.add(key);

                // Check if we've seen this globally (cross-chunk duplicate)
                if (!globalSeenIds.has(key)) {
                    globalSeenIds.add(key);
                    chunkTrades.push(trade);
                } else {
                    duplicatesInChunk++;
                    if (LOG_DUPLICATES) {
                        duplicates.push({ trade, key, offset });
                    }
                }
            }

            // Only stop if we see API cycling (same data repeating within chunk)
            if (cyclingDupes > batch.length * 0.5) {
                hasMore = false;
                break;
            }

            if (batch.length < BATCH_SIZE) {
                hasMore = false;
            }

            offset += BATCH_SIZE;
            retries = 0;

            // Rate limiting
            await sleep(100);
        } catch (error) {
            retries++;
            if (retries >= maxRetries) {
                console.error(`\n  Error fetching chunk: ${error}`);
                break;
            }
            await sleep(1000 * retries);
        }
    }

    const hitLimit = chunkTrades.length >= API_LIMIT_THRESHOLD;
    return { trades: chunkTrades, newDuplicates: duplicatesInChunk, hitLimit };
}

/**
 * Adaptive chunk fetching - starts with large chunks, splits when hitting API limit
 */
async function fetchChunkAdaptive(
    address: string,
    activityType: ActivityType,
    startTs: number,
    endTs: number,
    globalSeenIds: Set<string>,
    duplicates: DuplicateInfo[],
    depth: number = 0
): Promise<{ trades: TradeApiResponse[]; newDuplicates: number; splitCount: number }> {
    const chunkDuration = endTs - startTs;
    const indent = '  '.repeat(depth);
    const startDate = new Date(startTs * 1000).toISOString().slice(0, 16);
    const endDate = new Date(endTs * 1000).toISOString().slice(0, 16);

    // Try fetching this chunk
    const result = await fetchChunk(address, activityType, startTs, endTs, globalSeenIds, duplicates);

    // If we didn't hit the limit, or chunk is already at minimum size, return as-is
    if (!result.hitLimit || chunkDuration <= MIN_CHUNK_SECONDS) {
        if (result.hitLimit && chunkDuration <= MIN_CHUNK_SECONDS) {
            console.log(`${indent}  ⚠️  Min chunk size reached, may be missing trades`);
        }
        return { trades: result.trades, newDuplicates: result.newDuplicates, splitCount: 0 };
    }

    // Hit the limit - need to split this chunk
    console.log(`${indent}  ↳ Chunk hit limit (${result.trades.length}), splitting...`);

    // Clear the trades we just fetched from globalSeenIds so sub-chunks can re-fetch properly
    for (const trade of result.trades) {
        const key = `${trade.transactionHash}:${trade.asset}:${trade.size}:${trade.price}:${trade.timestamp}`;
        globalSeenIds.delete(key);
    }

    // Split into 2 halves
    const midTs = Math.floor((startTs + endTs) / 2);

    const firstHalfStart = new Date(startTs * 1000).toISOString().slice(0, 16);
    const firstHalfEnd = new Date(midTs * 1000).toISOString().slice(0, 16);
    console.log(`${indent}  [1/2] ${firstHalfStart} to ${firstHalfEnd}`);
    const firstHalf = await fetchChunkAdaptive(address, activityType, startTs, midTs, globalSeenIds, duplicates, depth + 1);

    const secondHalfStart = new Date(midTs * 1000).toISOString().slice(0, 16);
    const secondHalfEnd = new Date(endTs * 1000).toISOString().slice(0, 16);
    console.log(`${indent}  [2/2] ${secondHalfStart} to ${secondHalfEnd}`);
    const secondHalf = await fetchChunkAdaptive(address, activityType, midTs, endTs, globalSeenIds, duplicates, depth + 1);

    return {
        trades: [...firstHalf.trades, ...secondHalf.trades],
        newDuplicates: firstHalf.newDuplicates + secondHalf.newDuplicates,
        splitCount: 1 + firstHalf.splitCount + secondHalf.splitCount,
    };
}

/**
 * Fetch trades using adaptive chunking
 * Starts with CHUNK_HOURS sized chunks, automatically splits when hitting API limit
 */
interface TypeStats {
    type: ActivityType;
    count: number;
    startTs: number;
    endTs: number;
}

async function fetchTradesForTrader(address: string): Promise<{
    trades: TradeApiResponse[];
    duplicates: DuplicateInfo[];
    typeStats: TypeStats[];
}> {
    const nowTs = Math.floor(Date.now() / 1000);
    const chunkSeconds = CHUNK_HOURS * 60 * 60;

    let allTrades: TradeApiResponse[] = [];
    const duplicates: DuplicateInfo[] = [];
    const typeStats: TypeStats[] = [];
    let totalDuplicates = 0;
    let totalSplits = 0;

    // Fetch each activity type separately
    for (const activityType of ACTIVITY_TYPES) {
        // REDEEM uses 1/8th the timeframe since redemptions are less frequent
        const historyDays = activityType === 'REDEEM' ? Math.ceil(HISTORY_DAYS / 8) : HISTORY_DAYS;
        const sinceTs = nowTs - historyDays * 24 * 60 * 60;
        const numChunks = Math.ceil((nowTs - sinceTs) / chunkSeconds);

        console.log(`  Fetching ${activityType}: ${historyDays} days in ${numChunks} chunks of ${CHUNK_HOURS}h (adaptive)`);

        const seenIds = new Set<string>(); // Reset for each type
        let typeTradeCount = 0;

        // Fetch each chunk (newest first, going back in time)
        for (let i = 0; i < numChunks && allTrades.length < MAX_TRADES_PER_TRADER; i++) {
            const chunkEnd = nowTs - i * chunkSeconds;
            const chunkStart = Math.max(sinceTs, chunkEnd - chunkSeconds);

            const startDate = new Date(chunkStart * 1000).toISOString().slice(0, 16);
            const endDate = new Date(chunkEnd * 1000).toISOString().slice(0, 16);

            console.log(`  [${activityType}] [${i + 1}/${numChunks}] ${startDate} to ${endDate}`);

            const { trades: chunkTrades, newDuplicates, splitCount } = await fetchChunkAdaptive(
                address,
                activityType,
                chunkStart,
                chunkEnd,
                seenIds,
                duplicates
            );

            totalDuplicates += newDuplicates;
            totalSplits += splitCount;
            allTrades = allTrades.concat(chunkTrades);
            typeTradeCount += chunkTrades.length;

            console.log(`  [${activityType}] [${i + 1}/${numChunks}] ${chunkTrades.length} activities${splitCount > 0 ? ` (split ${splitCount}x)` : ''}`);

            // Small delay between chunks
            await sleep(150);
        }

        console.log(`  ${activityType} total: ${typeTradeCount}`);

        // Record stats for this type
        typeStats.push({
            type: activityType,
            count: typeTradeCount,
            startTs: sinceTs,
            endTs: nowTs,
        });
    }

    if (totalDuplicates > 0) {
        console.log(`  Cross-chunk duplicates filtered: ${totalDuplicates}`);
    }

    if (totalSplits > 0) {
        console.log(`  Adaptive splits performed: ${totalSplits}`);
    }

    console.log(`  Total unique activities: ${allTrades.length}`);

    return {
        trades: allTrades.sort((a, b) => a.timestamp - b.timestamp),
        duplicates,
        typeStats,
    };
}

function convertToTradeRecord(trade: TradeApiResponse, traderAddress: string): TradeRecord {
    // For REDEEM, side might not be set - use 'REDEEM' as side for clarity
    const side = trade.type === 'REDEEM' ? 'REDEEM' : trade.side;

    return {
        time: new Date(trade.timestamp * 1000),
        transactionHash: trade.transactionHash.toLowerCase(), // Normalize to lowercase
        traderAddress: traderAddress.toLowerCase(),
        conditionId: trade.conditionId,
        asset: trade.asset, // Include asset for multi-fill dedup
        type: trade.type,
        marketTitle: trade.title,
        marketSlug: trade.slug,
        marketLink: trade.slug && trade.eventSlug
            ? `https://polymarket.com/event/${trade.eventSlug}/${trade.slug}`
            : undefined,
        outcome: trade.outcome,
        side: side,
        size: trade.size,
        usdcSize: trade.usdcSize,
        price: trade.price,
    };
}

async function insertTrades(trades: TradeRecord[]): Promise<number> {
    let totalInserted = 0;

    // Insert in batches
    for (let i = 0; i < trades.length; i += INSERT_BATCH_SIZE) {
        const batch = trades.slice(i, i + INSERT_BATCH_SIZE);
        const inserted = await timescaleService.insertTrades(batch);
        totalInserted += inserted;

        // Show progress
        const progress = Math.min(i + INSERT_BATCH_SIZE, trades.length);
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(`  Inserting... ${progress}/${trades.length} (${totalInserted} new)`);
    }

    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);

    return totalInserted;
}

async function main(): Promise<void> {
    const { traders } = parseArgs();

    if (traders.length === 0) {
        console.error('No traders specified. Set USER_ADDRESSES in .env or use --trader flag.');
        process.exit(1);
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('           TIMESCALEDB HISTORICAL BACKFILL');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log(`  Traders:      ${traders.length}`);
    console.log(`  Period:       ${HISTORY_DAYS} days`);
    console.log(`  Chunk size:   ${CHUNK_HOURS} hours`);
    console.log(`  Activities:   ${ACTIVITY_TYPES.join(', ')}`);
    console.log('');

    try {
        // Connect to TimescaleDB
        await timescaleService.connect(TIMESCALE_URL);

        const existingCount = await timescaleService.getTradeCount();
        console.log(`  Existing trades in DB: ${existingCount}`);
        console.log('');
        console.log('───────────────────────────────────────────────────────────');

        let totalFetched = 0;
        let totalInserted = 0;
        let totalDuplicatesLogged = 0;

        if (LOG_DUPLICATES) {
            console.log('  LOG_DUPLICATES=true, duplicates will be stored in duplicate_trades table');
        }

        for (const trader of traders) {
            console.log(`\n📊 ${trader.slice(0, 6)}...${trader.slice(-4)}`);

            // Fetch from API
            const { trades: apiTrades, duplicates, typeStats } = await fetchTradesForTrader(trader);
            console.log(`  Fetched ${apiTrades.length} activities from API`);

            if (apiTrades.length === 0) {
                console.log('  No trades found in period');
                continue;
            }

            // Trades are already deduplicated during fetch
            totalFetched += apiTrades.length;

            // Convert to TradeRecord format
            const tradeRecords = apiTrades.map((t) => convertToTradeRecord(t, trader));

            // Insert into TimescaleDB
            const inserted = await insertTrades(tradeRecords);
            const dbDuplicates = apiTrades.length - inserted;
            console.log(`  Inserted ${inserted} new trades${dbDuplicates > 0 ? ` (${dbDuplicates} already in DB)` : ''}`);

            totalInserted += inserted;

            // Log duplicates to database if enabled
            if (LOG_DUPLICATES && duplicates.length > 0) {
                console.log(`  Logging ${duplicates.length} duplicates to duplicate_trades table...`);
                for (const dup of duplicates) {
                    try {
                        await timescaleService.insertDuplicateTrade(
                            {
                                time: new Date(dup.trade.timestamp * 1000),
                                transactionHash: dup.trade.transactionHash,
                                traderAddress: trader,
                                conditionId: dup.trade.conditionId,
                                asset: dup.trade.asset,
                                side: dup.trade.side,
                                size: dup.trade.size,
                                usdcSize: dup.trade.usdcSize,
                                price: dup.trade.price,
                            },
                            dup.key,
                            'backfill',
                            dup.offset
                        );
                        totalDuplicatesLogged++;
                    } catch {
                        // Ignore errors logging duplicates
                    }
                }
            }

            // Show date range
            const oldest = new Date(apiTrades[0].timestamp * 1000);
            const newest = new Date(apiTrades[apiTrades.length - 1].timestamp * 1000);
            console.log(`  Date range: ${oldest.toISOString().split('T')[0]} to ${newest.toISOString().split('T')[0]}`);

            // Record backfill metadata for each activity type
            for (const stats of typeStats) {
                // Count how many of this type were inserted
                const typeTradesInserted = tradeRecords.filter(t => t.type === stats.type).length;

                await timescaleService.recordBackfillMetadata(
                    trader,
                    stats.type,
                    new Date(stats.startTs * 1000),
                    new Date(stats.endTs * 1000),
                    stats.count,
                    typeTradesInserted
                );
            }
            console.log(`  Metadata recorded for ${typeStats.length} activity types`);
        }

        console.log('');
        console.log('───────────────────────────────────────────────────────────');
        console.log('');
        console.log('✅ BACKFILL COMPLETE');
        console.log('');
        console.log(`  Total unique:   ${totalFetched} trades from API`);
        console.log(`  Total inserted: ${totalInserted} new trades`);
        if (totalFetched - totalInserted > 0) {
            console.log(`  Already in DB:  ${totalFetched - totalInserted} skipped`);
        }
        if (totalDuplicatesLogged > 0) {
            console.log(`  Dupes logged:   ${totalDuplicatesLogged} to duplicate_trades`);
        }

        const finalCount = await timescaleService.getTradeCount();
        console.log(`  Total in DB:    ${finalCount} trades`);
        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    } finally {
        await timescaleService.disconnect();
    }
}

main();
