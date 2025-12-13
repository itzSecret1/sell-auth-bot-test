import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONNECTION_STATE_FILE = join(__dirname, '..', 'connectionState.json');

/**
 * ConnectionManager - Prevents connection spam and session limit issues
 * Ensures safe, rate-limited connection attempts
 */
export class ConnectionManager {
  constructor() {
    this.state = this.loadState();
    this.ATTEMPT_WINDOW = 60 * 1000; // 1 minute window
    this.MAX_ATTEMPTS_PER_WINDOW = 2; // Max 2 attempts per minute
    this.MIN_WAIT_BETWEEN_ATTEMPTS = 30 * 1000; // 30 seconds minimum between attempts
  }

  loadState() {
    if (existsSync(CONNECTION_STATE_FILE)) {
      try {
        return JSON.parse(readFileSync(CONNECTION_STATE_FILE, 'utf-8'));
      } catch (e) {
        return this.createDefaultState();
      }
    }
    return this.createDefaultState();
  }

  createDefaultState() {
    return {
      lastAttempt: null,
      attemptHistory: [], // Array of timestamps
      consecutiveFailures: 0,
      lastSuccessfulConnection: null,
      isConnected: false,
      blockedUntil: null
    };
  }

  saveState() {
    try {
      writeFileSync(CONNECTION_STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error('[CONNECTION] Error saving state:', e.message);
    }
  }

  /**
   * Check if we can attempt to connect
   * Prevents rapid reconnection attempts that trigger Discord session limits
   */
  canAttemptConnection() {
    const now = Date.now();

    // Check if currently blocked
    if (this.state.blockedUntil && now < this.state.blockedUntil) {
      const blockRemaining = Math.ceil((this.state.blockedUntil - now) / 1000);
      console.log(`[CONNECTION] ⏸️  Still in cooldown: ${blockRemaining}s remaining`);
      return false;
    }

    // Check minimum wait between attempts
    if (this.state.lastAttempt) {
      const timeSinceLastAttempt = now - this.state.lastAttempt;
      if (timeSinceLastAttempt < this.MIN_WAIT_BETWEEN_ATTEMPTS) {
        const waitRemaining = Math.ceil((this.MIN_WAIT_BETWEEN_ATTEMPTS - timeSinceLastAttempt) / 1000);
        console.log(`[CONNECTION] ⏳ Wait ${waitRemaining}s between attempts`);
        return false;
      }
    }

    // Check attempts in window
    const windowStart = now - this.ATTEMPT_WINDOW;
    const recentAttempts = this.state.attemptHistory.filter((time) => time > windowStart);

    if (recentAttempts.length >= this.MAX_ATTEMPTS_PER_WINDOW) {
      console.log(
        `[CONNECTION] ⚠️  Too many attempts (${recentAttempts.length}/${this.MAX_ATTEMPTS_PER_WINDOW}) in last minute`
      );
      // Block for 2 minutes if we're hitting the limit
      this.state.blockedUntil = now + 2 * 60 * 1000;
      this.saveState();
      return false;
    }

    return true;
  }

  /**
   * Record a connection attempt
   */
  recordAttempt() {
    const now = Date.now();
    this.state.lastAttempt = now;
    this.state.attemptHistory.push(now);

    // Keep only last hour of attempts
    const oneHourAgo = now - 60 * 60 * 1000;
    this.state.attemptHistory = this.state.attemptHistory.filter((time) => time > oneHourAgo);

    this.saveState();
    console.log(`[CONNECTION] 📝 Recorded attempt #${this.state.attemptHistory.length}`);
  }

  /**
   * Mark successful connection
   */
  markSuccess() {
    this.state.isConnected = true;
    this.state.lastSuccessfulConnection = new Date().toISOString();
    this.state.consecutiveFailures = 0;
    this.state.attemptHistory = []; // Clear history on success
    this.state.blockedUntil = null;
    this.saveState();
    console.log('[CONNECTION] ✅ Successfully connected - attempt history cleared');
  }

  /**
   * Mark failed connection
   */
  markFailure(isSessionLimit = false) {
    this.state.isConnected = false;
    this.state.consecutiveFailures += 1;

    if (isSessionLimit) {
      // On session limit, implement aggressive backoff
      const backoffMs = Math.min(10 * 60 * 1000, 30 * 60 * 1000); // Max 30 minutes
      this.state.blockedUntil = Date.now() + backoffMs;
      console.log(`[CONNECTION] 🔒 Session limit detected - blocking for ${Math.ceil(backoffMs / 60 / 1000)} minutes`);
    }

    this.saveState();
  }

  /**
   * Get safe wait time before next attempt
   */
  getSafeWaitTime(baseWaitMs = 0) {
    const now = Date.now();

    // If blocked, return block time
    if (this.state.blockedUntil && now < this.state.blockedUntil) {
      return this.state.blockedUntil - now;
    }

    // If recent attempts, add exponential backoff
    const windowStart = now - this.ATTEMPT_WINDOW;
    const recentAttempts = this.state.attemptHistory.filter((time) => time > windowStart);
    const backoffMultiplier = Math.max(1, recentAttempts.length);

    return Math.max(baseWaitMs, this.MIN_WAIT_BETWEEN_ATTEMPTS * backoffMultiplier);
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isConnected: this.state.isConnected,
      lastAttempt: this.state.lastAttempt ? new Date(this.state.lastAttempt).toISOString() : null,
      lastSuccess: this.state.lastSuccessfulConnection,
      consecutiveFailures: this.state.consecutiveFailures,
      recentAttempts: this.state.attemptHistory.length,
      blockedUntil: this.state.blockedUntil ? new Date(this.state.blockedUntil).toISOString() : null
    };
  }

  /**
   * Reset all state (for manual recovery)
   */
  reset() {
    this.state = this.createDefaultState();
    this.saveState();
    console.log('[CONNECTION] 🔄 Connection state reset');
  }
}

export const connectionManager = new ConnectionManager();
