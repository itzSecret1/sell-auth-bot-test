/**
 * Advanced Rate Limiter - Protects against spam and abuse
 * Tracks command execution patterns per user
 * Implements automatic timeout for violators
 */

const userActions = new Map(); // { userId: [{ timestamp, action }, ...] }
const userTimeouts = new Map(); // { userId: { until, reason } }

const CONFIG = {
  REPLACE_THRESHOLD: 5,        // Max replaces
  SHORT_WINDOW: 1000,          // 1 second
  MEDIUM_WINDOW: 3000,         // 3 seconds
  TIMEOUT_DURATION: 3 * 24 * 60 * 60 * 1000  // 3 days in milliseconds
};

/**
 * Check if user is currently in timeout
 */
export function isUserTimedOut(userId) {
  const timeout = userTimeouts.get(userId);
  if (!timeout) return false;

  const now = Date.now();
  if (now >= timeout.until) {
    // Timeout expired
    userTimeouts.delete(userId);
    return false;
  }

  return true;
}

/**
 * Get remaining timeout duration for user
 */
export function getTimeoutRemaining(userId) {
  const timeout = userTimeouts.get(userId);
  if (!timeout) return 0;

  const remaining = timeout.until - Date.now();
  return remaining > 0 ? remaining : 0;
}

/**
 * Get timeout reason
 */
export function getTimeoutReason(userId) {
  const timeout = userTimeouts.get(userId);
  return timeout?.reason || 'Unknown';
}

/**
 * Track action for user (Thread-safe Map operations)
 */
function trackAction(userId, action = 'replace') {
  // Ensure user has action array
  const existingActions = userActions.get(userId) || [];
  const now = Date.now();
  
  // Clean old actions (older than 5 seconds) - THREAD-SAFE: Create new array
  const cutoff = now - 5000;
  const recentActions = existingActions.filter(a => a.timestamp > cutoff);
  
  // Add new action
  recentActions.push({ timestamp: now, action });
  
  // Store back (atomic operation for this user)
  userActions.set(userId, recentActions);

  return recentActions;
}

/**
 * Check if user violated rate limit
 * Returns: { violated: boolean, reason: string }
 */
export function checkRateLimit(userId, action = 'replace') {
  // Track the action first
  const recentActions = trackAction(userId, action);

  // Filter by action type
  const actionOfType = recentActions.filter(a => a.action === action);
  const now = Date.now();

  // Check short window (1 second) - 5 replaces
  const shortWindowActions = actionOfType.filter(a => a.timestamp > now - CONFIG.SHORT_WINDOW);
  if (shortWindowActions.length >= CONFIG.REPLACE_THRESHOLD) {
    return {
      violated: true,
      reason: `Too many ${action}s in 1 second (${shortWindowActions.length} detected)`
    };
  }

  // Check medium window (3 seconds) - 5+ replaces
  const mediumWindowActions = actionOfType.filter(a => a.timestamp > now - CONFIG.MEDIUM_WINDOW);
  if (mediumWindowActions.length >= CONFIG.REPLACE_THRESHOLD) {
    return {
      violated: true,
      reason: `Too many ${action}s in 3 seconds (${mediumWindowActions.length} detected)`
    };
  }

  return { violated: false, reason: null };
}

/**
 * Apply timeout to user
 */
export function applyTimeout(userId, member, guild, reason = 'Spam detection') {
  const now = Date.now();
  const timeoutUntil = now + CONFIG.TIMEOUT_DURATION;

  userTimeouts.set(userId, {
    until: timeoutUntil,
    reason,
    appliedAt: now
  });

  // Log the timeout
  console.log(`[RATE-LIMITER] 🚫 User ${userId} timed out for 3 days. Reason: ${reason}`);

  // Optional: Send embed to mod/log channel
  return {
    success: true,
    durationMs: CONFIG.TIMEOUT_DURATION,
    durationDays: 3,
    reason,
    until: new Date(timeoutUntil).toISOString()
  };
}

/**
 * Remove user from timeout (manual override)
 */
export function removeTimeout(userId) {
  const hadTimeout = userTimeouts.has(userId);
  userTimeouts.delete(userId);
  return hadTimeout;
}

/**
 * Get user stats for debugging
 */
export function getUserStats(userId) {
  const timeout = userTimeouts.get(userId);
  const actions = userActions.get(userId) || [];

  return {
    userId,
    timedOut: isUserTimedOut(userId),
    timeout: timeout ? {
      until: new Date(timeout.until).toISOString(),
      remaining: getTimeoutRemaining(userId),
      reason: timeout.reason
    } : null,
    recentActions: actions.slice(-10).map(a => ({
      action: a.action,
      timestamp: new Date(a.timestamp).toISOString()
    }))
  };
}

export default {
  CONFIG,
  isUserTimedOut,
  getTimeoutRemaining,
  getTimeoutReason,
  checkRateLimit,
  applyTimeout,
  removeTimeout,
  getUserStats
};
