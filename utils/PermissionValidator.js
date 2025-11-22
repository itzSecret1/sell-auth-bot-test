/**
 * PermissionValidator - Check and validate Discord permissions
 * Ensures bot has required permissions before executing actions
 */

import { PermissionFlagsBits } from 'discord.js';

export class PermissionValidator {
  /**
   * Check if bot has required permissions in guild
   */
  static async checkBotPermissions(guild, requiredPermissions = []) {
    try {
      if (!guild || !guild.members.me) {
        return { valid: false, missing: requiredPermissions };
      }

      const botPermissions = guild.members.me.permissions;

      const missing = requiredPermissions.filter(perm => !botPermissions.has(perm));

      return {
        valid: missing.length === 0,
        missing,
        hasPermissions: requiredPermissions.filter(perm => botPermissions.has(perm))
      };
    } catch (error) {
      console.error('[PERMISSION] Error checking bot permissions:', error);
      return { valid: false, missing: requiredPermissions, error: error.message };
    }
  }

  /**
   * Check if user has required role
   */
  static async checkUserRole(member, requiredRole) {
    try {
      if (!member) return false;

      // Owner bypass
      if (member.guild.ownerId === member.id) return true;

      // Check if user has role
      const role = member.roles.cache.find(r => r.name.toLowerCase() === requiredRole.toLowerCase());
      return !!role;
    } catch (error) {
      console.error('[PERMISSION] Error checking user role:', error);
      return false;
    }
  }

  /**
   * Get required permissions for specific commands
   */
  static getCommandPermissions(commandName) {
    const permissionMap = {
      'clear': [PermissionFlagsBits.ManageMessages],
      'backup': [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels],
      'loadbackup': [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels],
      'balance-add': [PermissionFlagsBits.ManageGuild],
      'balance-remove': [PermissionFlagsBits.ManageGuild],
      'config': [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles],
      'audit': [PermissionFlagsBits.ViewAuditLog]
    };

    return permissionMap[commandName] || [];
  }

  /**
   * Validate bot can perform action
   */
  static async validateAction(guild, action, targetEntity = null) {
    try {
      const permissions = {
        deleteMessages: [PermissionFlagsBits.ManageMessages],
        manageRoles: [PermissionFlagsBits.ManageRoles],
        manageChannels: [PermissionFlagsBits.ManageChannels],
        kickMembers: [PermissionFlagsBits.KickMembers],
        banMembers: [PermissionFlagsBits.BanMembers],
        moderateMembers: [PermissionFlagsBits.ModerateMembers]
      };

      const required = permissions[action] || [];
      const check = await this.checkBotPermissions(guild, required);

      return check.valid;
    } catch (error) {
      console.error('[PERMISSION] Validation error:', error);
      return false;
    }
  }
}

export default PermissionValidator;
