export async function checkUserIdWhitelist(command, interaction, config) {
  const userId = interaction.user.id;
  const member = interaction.member;

  if (command.onlyWhitelisted) {
    // Check if user has admin role (full access to all commands)
    if (config.BOT_ADMIN_ROLE_ID && member.roles.cache.has(config.BOT_ADMIN_ROLE_ID)) {
      return true;
    }

    // Check if user has staff role (limited access)
    if (config.BOT_STAFF_ROLE_ID && member.roles.cache.has(config.BOT_STAFF_ROLE_ID)) {
      // Staff can only use commands explicitly marked with requiredRole: 'staff'
      // All other whitelisted commands default to admin-only
      if (command.requiredRole === 'staff') {
        return true;
      }
      return false;
    }

    // Fallback to old whitelist system (for backwards compatibility)
    return config.BOT_USER_ID_WHITELIST.includes(userId);
  }

  return true;
}
