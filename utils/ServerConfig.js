/**
 * ServerConfig - Persistent server configuration management
 * Stores important role IDs, channel IDs, protected entities
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONFIG_DIR = path.join(__dirname, '..', 'data', 'configs');

// Ensure config directory exists
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

export class ServerConfig {
  /**
   * Get config file path for guild
   */
  static getConfigPath(guildId) {
    return path.join(CONFIG_DIR, `config_${guildId}.json`);
  }

  /**
   * Load configuration for a guild
   */
  static loadConfig(guildId) {
    try {
      const filePath = this.getConfigPath(guildId);

      if (!fs.existsSync(filePath)) {
        // Create default config
        return this.createDefaultConfig(guildId);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error('[CONFIG] Error loading config:', error);
      return this.createDefaultConfig(guildId);
    }
  }

  /**
   * Create default configuration
   */
  static createDefaultConfig(guildId) {
    return {
      guildId,
      createdAt: new Date().toISOString(),
      protectedRoles: [],
      protectedChannels: [],
      auditLogChannel: null,
      backupChannel: null,
      moderationLogChannel: null,
      trustedUsers: [],
      allowedCommands: 'all', // 'all' or specific list
      backupSchedule: 'daily', // 'daily', 'weekly', 'never'
      enableAuditLogging: true,
      enableAutoBackup: true,
      settings: {}
    };
  }

  /**
   * Save configuration
   */
  static saveConfig(guildId, config) {
    try {
      const filePath = this.getConfigPath(guildId);
      fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
      console.log(`[CONFIG] Saved config for guild: ${guildId}`);
      return true;
    } catch (error) {
      console.error('[CONFIG] Error saving config:', error);
      return false;
    }
  }

  /**
   * Add protected role
   */
  static addProtectedRole(guildId, roleId, reason) {
    const config = this.loadConfig(guildId);

    const protected_entry = {
      roleId,
      reason,
      addedAt: new Date().toISOString()
    };

    if (!config.protectedRoles.find(r => r.roleId === roleId)) {
      config.protectedRoles.push(protected_entry);
      this.saveConfig(guildId, config);
    }

    return true;
  }

  /**
   * Remove protected role
   */
  static removeProtectedRole(guildId, roleId) {
    const config = this.loadConfig(guildId);
    config.protectedRoles = config.protectedRoles.filter(r => r.roleId !== roleId);
    this.saveConfig(guildId, config);
    return true;
  }

  /**
   * Get protected roles
   */
  static getProtectedRoles(guildId) {
    const config = this.loadConfig(guildId);
    return config.protectedRoles;
  }

  /**
   * Check if role is protected
   */
  static isRoleProtected(guildId, roleId) {
    const config = this.loadConfig(guildId);
    return config.protectedRoles.some(r => r.roleId === roleId);
  }

  /**
   * Set audit log channel
   */
  static setAuditLogChannel(guildId, channelId) {
    const config = this.loadConfig(guildId);
    config.auditLogChannel = channelId;
    this.saveConfig(guildId, config);
    return true;
  }

  /**
   * Get audit log channel
   */
  static getAuditLogChannel(guildId) {
    const config = this.loadConfig(guildId);
    return config.auditLogChannel;
  }

  /**
   * Set auto-backup enabled
   */
  static setAutoBackup(guildId, enabled) {
    const config = this.loadConfig(guildId);
    config.enableAutoBackup = enabled;
    this.saveConfig(guildId, config);
    return true;
  }

  /**
   * Is auto-backup enabled
   */
  static isAutoBackupEnabled(guildId) {
    const config = this.loadConfig(guildId);
    return config.enableAutoBackup;
  }
}

export default ServerConfig;
