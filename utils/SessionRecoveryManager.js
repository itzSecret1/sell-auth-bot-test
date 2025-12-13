import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SESSION_STATE_FILE = join(__dirname, '..', 'sessionState.json');

/**
 * SessionRecoveryManager - Automatically handles Discord session limits
 * Detects when Discord blocks the bot and waits for automatic recovery
 */
export class SessionRecoveryManager {
  constructor(statusReporter = null) {
    this.state = this.loadState();
    this.isRecovering = false;
    this.statusReporter = statusReporter;
  }

  /**
   * Load persistent recovery state from disk
   */
  loadState() {
    if (existsSync(SESSION_STATE_FILE)) {
      try {
        return JSON.parse(readFileSync(SESSION_STATE_FILE, 'utf-8'));
      } catch (e) {
        return this.createDefaultState();
      }
    }
    return this.createDefaultState();
  }

  /**
   * Create default state structure
   */
  createDefaultState() {
    return {
      lastBlockTime: null,
      resetTime: null,
      attemptCount: 0,
      maxAttempts: 3,
      blockReasons: [],
      lastSuccessfulLogin: null,
      autoRecoveryEnabled: true
    };
  }

  /**
   * Save state to disk
   */
  saveState() {
    try {
      writeFileSync(SESSION_STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error('[SESSION] Error saving state:', e.message);
    }
  }

  /**
   * Extract reset time from Discord error message
   * @returns {Date|null} The time when Discord will allow reconnection
   */
  extractResetTime(errorMessage) {
    // Try ISO format first: "resets at 2025-11-24T18:33:44.104Z"
    const isoMatch = errorMessage.match(/resets at (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^;,\n]*)/);
    if (isoMatch) {
      const date = new Date(isoMatch[1].trim());
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    // Try Unix timestamp format: "resets at 1732000000"
    const unixMatch = errorMessage.match(/resets at (\d{10,})/);
    if (unixMatch) {
      const timestamp = parseInt(unixMatch[1]);
      if (timestamp > 1000000000) { // Sanity check: must be after year 2001
        return new Date(timestamp * 1000);
      }
    }

    return null;
  }

  /**
   * Handle session limit error and schedule recovery
   * @param {Error} error - The Discord connection error
   * @param {Function} retryCallback - Function to call when retrying
   * @returns {Promise<void>}
   */
  async handleSessionLimit(error, retryCallback) {
    if (this.isRecovering) {
      console.log('[SESSION] Recovery already in progress, skipping...');
      return;
    }

    this.isRecovering = true;
    const now = new Date();

    console.error(`\n${'='.repeat(70)}`);
    console.error('❌ [SESSION LIMIT] Discord has blocked bot connections');
    console.error(`${'='.repeat(70)}`);

    // Extract reset time
    const resetTime = this.extractResetTime(error.message);
    this.state.lastBlockTime = now.toISOString();
    this.state.resetTime = resetTime ? resetTime.toISOString() : null;
    this.state.attemptCount += 1;
    this.state.blockReasons.push({
      timestamp: now.toISOString(),
      reason: error.message,
      attemptNumber: this.state.attemptCount
    });

    if (this.state.blockReasons.length > 10) {
      this.state.blockReasons = this.state.blockReasons.slice(-10);
    }

    this.saveState();

    // Calculate wait time
    let waitTime;
    if (resetTime && resetTime > now) {
      waitTime = resetTime - now;
      const hours = Math.floor(waitTime / (60 * 60 * 1000));
      const minutes = Math.floor((waitTime % (60 * 60 * 1000)) / (60 * 1000));
      console.error(`⏱️  Discord will reset at: ${resetTime.toUTCString()}`);
      console.error(`   Wait time: ${hours}h ${minutes}m\n`);
    } else {
      // Fallback exponential backoff
      waitTime = [10, 20, 30][Math.min(this.state.attemptCount - 1, 2)] * 60 * 1000;
      const minutes = waitTime / 60 / 1000;
      console.error(`⏱️  Using exponential backoff: ${minutes} minutes\n`);
    }

    console.error(`📊 Recovery Status:`);
    console.error(`   • Attempt: ${this.state.attemptCount}/${this.state.maxAttempts}`);
    console.error(`   • Auto-recovery: ${this.state.autoRecoveryEnabled ? '✅ ENABLED' : '❌ DISABLED'}`);
    console.error(`   • Next attempt: ${new Date(now.getTime() + waitTime).toUTCString()}`);
    console.error(`${'='.repeat(70)}\n`);

    // Schedule automatic retry
    if (this.state.attemptCount <= this.state.maxAttempts && this.state.autoRecoveryEnabled) {
      console.log(`[SESSION] ⏳ Waiting for Discord reset... (automatic recovery enabled)`);
      
      // Notify staff channel about offline status
      if (this.statusReporter && resetTime) {
        this.statusReporter.notifyOfflineWithRecovery(resetTime, this.state.attemptCount);
      }
      
      // Set up recovery check every minute after reset time
      const recoveryTimeout = setTimeout(() => {
        console.log(`\n[SESSION] 🔄 Attempting automatic recovery (Attempt ${this.state.attemptCount})...`);
        this.isRecovering = false;
        retryCallback();
      }, waitTime);

      // Graceful cleanup
      recoveryTimeout.unref?.();
    } else {
      console.error(`[SESSION] ❌ Maximum recovery attempts reached (${this.state.attemptCount})`);
      console.error(`[SESSION] Manual intervention required:`);
      console.error(`   1. Wait until: ${resetTime?.toUTCString() || 'unknown'}`);
      console.error(`   2. Restart the bot: npm start`);
      console.error(`   3. If issue persists, regenerate bot token in Discord Developer Portal\n`);
      this.isRecovering = false;
    }
  }

  /**
   * Mark successful login to reset recovery state
   */
  markSuccessfulLogin() {
    this.state.lastSuccessfulLogin = new Date().toISOString();
    this.state.attemptCount = 0; // Reset attempt counter on success
    this.saveState();
    console.log('[SESSION] ✅ Bot successfully connected to Discord');
  }

  /**
   * Get current recovery status
   */
  getStatus() {
    return {
      isRecovering: this.isRecovering,
      lastBlock: this.state.lastBlockTime,
      nextReset: this.state.resetTime,
      attemptCount: this.state.attemptCount,
      maxAttempts: this.state.maxAttempts,
      lastSuccess: this.state.lastSuccessfulLogin,
      autoRecoveryEnabled: this.state.autoRecoveryEnabled
    };
  }

  /**
   * Disable auto-recovery (for manual intervention)
   */
  disableAutoRecovery() {
    this.state.autoRecoveryEnabled = false;
    this.saveState();
    console.log('[SESSION] Auto-recovery disabled');
  }

  /**
   * Reset recovery state manually
   */
  resetState() {
    this.state = this.createDefaultState();
    this.isRecovering = false;
    this.saveState();
    console.log('[SESSION] Recovery state reset');
  }
}

export const sessionManager = new SessionRecoveryManager();
