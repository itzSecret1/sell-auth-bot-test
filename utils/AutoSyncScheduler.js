import { startAutoSync } from './autoSync.js';
import { EmbedBuilder } from 'discord.js';

const SYNC_LOG_CHANNEL = process.env.BOT_LOG_CHANNEL || '1442913019788001513';

/**
 * AutoSyncScheduler - Enhanced auto-sync with hourly execution and logging
 */
export class AutoSyncScheduler {
  constructor(client, api) {
    this.client = client;
    this.api = api;
    this.syncInterval = 60 * 60 * 1000; // 1 hour
  }

  /**
   * Start hourly auto-sync
   */
  startHourlySync() {
    // Run immediately
    this.executeSyncCycle();

    // Then every hour
    setInterval(() => {
      this.executeSyncCycle();
    }, this.syncInterval);

    console.log('[AUTOSYNC] ✅ Hourly auto-sync started (every 60 minutes)');
  }

  /**
   * Execute sync cycle
   */
  async executeSyncCycle() {
    const startTime = Date.now();
    console.log('[AUTOSYNC] 🔄 Starting sync cycle...');

    try {
      // Call existing auto-sync
      await startAutoSync(this.api);

      const duration = Date.now() - startTime;
      console.log(`[AUTOSYNC] ✅ Sync completed in ${duration}ms`);
    } catch (error) {
      console.error('[AUTOSYNC] ❌ Sync error:', error.message);
    }
  }
}

export const createAutoSyncScheduler = (client, api) => new AutoSyncScheduler(client, api);
