import { GuildConfig } from './GuildConfig.js';
import { NotWhitelistedException } from './NotWhitelistedException.js';

export async function checkUserIdWhitelist(command, interaction, config) {
  const userId = interaction.user.id;
  const member = interaction.member;
  const guildId = interaction.guild?.id;

  if (command.onlyWhitelisted) {
    // Obtener configuración del servidor
    const guildConfig = guildId ? GuildConfig.getConfig(guildId) : null;
    
    // Verificar si el usuario es dueño del servidor (siempre tiene acceso)
    if (interaction.guild && interaction.guild.ownerId === userId) {
      return true;
    }
    
    // Verificar rol de admin (del servidor o global)
    const adminRoleId = guildConfig?.adminRoleId || config.BOT_ADMIN_ROLE_ID;
    if (adminRoleId && member.roles.cache.has(adminRoleId)) {
      return true;
    }

    // Check if user has viewer role (only invoice-view access and can view tickets)
    const viewerRoleId = guildConfig?.viewerRoleId || config.BOT_VIEWER_ROLE_ID;
    if (viewerRoleId && member.roles.cache.has(viewerRoleId)) {
      // Viewer can only use invoice-view command
      if (interaction.commandName === 'invoice-view') {
        return true;
      }
      // Viewers can also view tickets (read-only), but cannot use other commands
      return false;
    }

    // Check if user has trial admin role (only sync-variants access)
    const trialAdminRoleId = guildConfig?.trialAdminRoleId || config.BOT_TRIAL_ADMIN_ROLE_ID;
    if (trialAdminRoleId && member.roles.cache.has(trialAdminRoleId)) {
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
    if (Array.isArray(whitelist) && whitelist.includes(userId)) {
      return true;
    }
    
    // Si no tiene permisos, lanzar excepción con mensaje descriptivo
    throw new NotWhitelistedException(command, guildConfig, config, interaction);
  }

  return true;
}
