/**
 * AuditLogger - Advanced server audit logging
 * Tracks role changes, channel modifications, permission updates, member actions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const AUDIT_DIR = path.join(__dirname, '..', 'data', 'audits');

// Ensure audit directory exists
if (!fs.existsSync(AUDIT_DIR)) {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
}

export class AuditLogger {
  /**
   * Log an audit event
   */
  static async logEvent(guildId, eventType, details) {
    try {
      const timestamp = new Date().toISOString();
      const auditEntry = {
        timestamp,
        guildId,
        eventType,
        details,
        unix: Date.now()
      };

      // Store in memory for fast access
      if (!AuditLogger.auditCache) {
        AuditLogger.auditCache = {};
      }

      if (!AuditLogger.auditCache[guildId]) {
        AuditLogger.auditCache[guildId] = [];
      }

      AuditLogger.auditCache[guildId].push(auditEntry);

      // Keep only last 100 per guild
      if (AuditLogger.auditCache[guildId].length > 100) {
        AuditLogger.auditCache[guildId].shift();
      }

      // Also save to file
      const fileName = `audit_${guildId}.json`;
      const filePath = path.join(AUDIT_DIR, fileName);

      let auditData = [];
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        auditData = JSON.parse(content);
      }

      auditData.push(auditEntry);

      // Keep last 500 entries per guild
      if (auditData.length > 500) {
        auditData = auditData.slice(-500);
      }

      fs.writeFileSync(filePath, JSON.stringify(auditData, null, 2));

      console.log(`[AUDIT] ${eventType} - Guild: ${guildId}`);
    } catch (error) {
      console.error('[AUDIT] Error logging event:', error);
    }
  }

  /**
   * Get recent audit logs for a guild
   */
  static getRecentLogs(guildId, limit = 10) {
    try {
      const fileName = `audit_${guildId}.json`;
      const filePath = path.join(AUDIT_DIR, fileName);

      if (!fs.existsSync(filePath)) {
        return [];
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const auditData = JSON.parse(content);

      return auditData.slice(-limit).reverse();
    } catch (error) {
      console.error('[AUDIT] Error reading logs:', error);
      return [];
    }
  }

  /**
   * Get logs by event type
   */
  static getLogsByType(guildId, eventType, limit = 20) {
    try {
      const fileName = `audit_${guildId}.json`;
      const filePath = path.join(AUDIT_DIR, fileName);

      if (!fs.existsSync(filePath)) {
        return [];
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const auditData = JSON.parse(content);

      return auditData
        .filter(log => log.eventType === eventType)
        .slice(-limit)
        .reverse();
    } catch (error) {
      console.error('[AUDIT] Error filtering logs:', error);
      return [];
    }
  }
}

export default AuditLogger;
