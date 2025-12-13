import { GuildConfig } from './GuildConfig.js';

export async function checkUserIdWhitelist(command, interaction, config) {
  const userId = interaction.user.id;
  const member = interaction.member;
  const guildId = interaction.guild?.id;

  if (command.onlyWhitelisted) {
    // Obtener configuración del servidor
    const guildConfig = guildId ? GuildConfig.getConfig(guildId) : null;
    
    // Verificar rol de admin (del servidor o global)
    const adminRoleId = guildConfig?.adminRoleId || config.BOT_ADMIN_ROLE_ID;
    if (adminRoleId && member.roles.cache.has(adminRoleId)) {
      return true;
    }

    // Check if user has trial admin role (only sync-variants access)
    if (config.BOT_TRIAL_ADMIN_ROLE_ID && member.roles.cache.has(config.BOT_TRIAL_ADMIN_ROLE_ID)) {
      // Trial admin can only use sync-variants
      if (interaction.commandName === 'sync-variants') {
        return true;
      }
      return false;
    }

    // Verificar rol de trial staff (del servidor o global)
    const staffRoleId = guildConfig?.staffRoleId || config.BOT_STAFF_ROLE_ID;
    if (staffRoleId && member.roles.cache.has(staffRoleId)) {
      // Trial staff can only use commands explicitly marked with requiredRole: 'staff'
      // All other whitelisted commands default to admin-only
      if (command.requiredRole === 'staff') {
        return true;
      }
      return false;
    }

    // Fallback to old whitelist system (for backwards compatibility)
    const whitelist = config.BOT_USER_ID_WHITELIST || [];
    return Array.isArray(whitelist) && whitelist.includes(userId);
  }

  return true;
}
