export class NotWhitelistedException {
  constructor(command, guildConfig, config, interaction) {
    // Generar mensaje descriptivo basado en el contexto
    let errorMessage = '🚫 **You do not have permission to use this command.**\n\n';
    
    // Determinar qué rol se necesita
    const requiredRole = command?.requiredRole || 'admin';
    const commandName = interaction?.commandName || 'this command';
    
    // Verificar si hay configuración de servidor
    const hasGuildConfig = guildConfig && (guildConfig.adminRoleId || guildConfig.staffRoleId);
    const hasGlobalConfig = config && (config.BOT_ADMIN_ROLE_ID || config.BOT_STAFF_ROLE_ID);
    
    if (!hasGuildConfig && !hasGlobalConfig) {
      // No hay configuración - necesita setup
      errorMessage += `⚙️ **Server Not Configured**\n`;
      errorMessage += `This server needs to be set up before you can use \`/${commandName}\`.\n\n`;
      errorMessage += `**Solution:**\n`;
      errorMessage += `• Ask the **server owner** to run \`/setup\` to configure roles\n`;
      errorMessage += `• Or ask an administrator to add you to the bot whitelist\n\n`;
      errorMessage += `**Required Role:** \`${requiredRole === 'staff' ? 'Staff' : 'Admin'}\`\n`;
    } else {
      // Hay configuración pero el usuario no tiene el rol correcto
      errorMessage += `**Required Permission:** \`${requiredRole === 'staff' ? 'Staff Role' : 'Admin Role'}\`\n\n`;
      
      if (requiredRole === 'staff') {
        const staffRoleId = guildConfig?.staffRoleId || config?.BOT_STAFF_ROLE_ID;
        if (staffRoleId) {
          errorMessage += `You need the <@&${staffRoleId}> role to use this command.\n\n`;
        } else {
          errorMessage += `A staff role needs to be configured. Ask an admin to run \`/setup\`.\n\n`;
        }
      } else {
        const adminRoleId = guildConfig?.adminRoleId || config?.BOT_ADMIN_ROLE_ID;
        if (adminRoleId) {
          errorMessage += `You need the <@&${adminRoleId}> role to use this command.\n\n`;
        } else {
          errorMessage += `An admin role needs to be configured. Ask the server owner to run \`/setup\`.\n\n`;
        }
      }
      
      errorMessage += `**Who can use this command:**\n`;
      errorMessage += `• Server owner (always has access)\n`;
      if (requiredRole === 'staff') {
        errorMessage += `• Users with the configured Staff role\n`;
        errorMessage += `• Users with the configured Admin role\n`;
      } else {
        errorMessage += `• Users with the configured Admin role\n`;
      }
      errorMessage += `• Users in the bot whitelist\n`;
    }
    
    this.message = errorMessage;
  }

  toString() {
    return this.message;
  }
}
