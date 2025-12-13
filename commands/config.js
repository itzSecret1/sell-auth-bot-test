import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';
import { ErrorLog } from '../utils/errorLogger.js';
import { ServerConfig } from '../utils/ServerConfig.js';
import { quickReply } from '../utils/quickResponse.js';

export default {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('View or update server configuration (Admin only)')
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription('View current server configuration')
    )
    .addSubcommand((sub) =>
      sub
        .setName('protect-role')
        .setDescription('Protect a role from deletion/modification')
        .addRoleOption((opt) =>
          opt
            .setName('role')
            .setDescription('Role to protect')
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('reason')
            .setDescription('Reason for protection')
            .setRequired(false)
            .setMaxLength(100)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('unprotect-role')
        .setDescription('Unprotect a role')
        .addRoleOption((opt) =>
          opt
            .setName('role')
            .setDescription('Role to unprotect')
            .setRequired(true)
        )
    ),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction, api) {
    await quickReply(interaction, async () => {
      const startTime = Date.now();
      try {
        const subcommand = interaction.options.getSubcommand();
        const admin = interaction.user.username;
        const guildId = interaction.guild.id;

        if (subcommand === 'view') {
          const config = ServerConfig.loadConfig(guildId);

          const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('⚙️ Server Configuration')
            .addFields(
              { name: 'Guild', value: interaction.guild.name, inline: true },
              { name: 'Guild ID', value: guildId, inline: true },
              { name: 'Protected Roles', value: config.protectedRoles.length.toString(), inline: true },
              { name: 'Auto Backup', value: config.enableAutoBackup ? '✅ Enabled' : '❌ Disabled', inline: true },
              { name: 'Audit Logging', value: config.enableAuditLogging ? '✅ Enabled' : '❌ Disabled', inline: true },
              { name: 'Backup Schedule', value: config.backupSchedule, inline: true }
            )
            .setFooter({ text: 'SellAuth Bot | Server Configuration' })
            .setTimestamp();

          if (config.protectedRoles.length > 0) {
            const roles = config.protectedRoles
              .map(r => `• <@&${r.roleId}> - ${r.reason || 'No reason'}`)
              .join('\n');
            embed.addFields({ name: 'Protected Roles', value: roles.substring(0, 1024), inline: false });
          }

          return { embeds: [embed] };
        }

        if (subcommand === 'protect-role') {
          const role = interaction.options.getRole('role');
          const reason = interaction.options.getString('reason') || 'Important role';

          ServerConfig.addProtectedRole(guildId, role.id, reason);

          const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('✅ Role Protected')
            .addFields(
              { name: 'Role', value: role.toString(), inline: true },
              { name: 'Reason', value: reason, inline: true }
            )
            .setFooter({ text: 'SellAuth Bot | Role Protection' })
            .setTimestamp();

          await AdvancedCommandLogger.logCommand(interaction, 'config', {
            status: 'EXECUTED',
            result: `Role ${role.name} protected`,
            executionTime: Date.now() - startTime,
            metadata: { 'Role': role.name, 'Reason': reason, 'Admin': admin }
          });

          return { embeds: [embed] };
        }

        if (subcommand === 'unprotect-role') {
          const role = interaction.options.getRole('role');

          ServerConfig.removeProtectedRole(guildId, role.id);

          const embed = new EmbedBuilder()
            .setColor(0xffaa00)
            .setTitle('✅ Role Unprotected')
            .addFields(
              { name: 'Role', value: role.toString(), inline: true }
            )
            .setFooter({ text: 'SellAuth Bot | Role Protection' })
            .setTimestamp();

          await AdvancedCommandLogger.logCommand(interaction, 'config', {
            status: 'EXECUTED',
            result: `Role ${role.name} unprotected`,
            executionTime: Date.now() - startTime,
            metadata: { 'Role': role.name, 'Admin': admin }
          });

          return { embeds: [embed] };
        }
      } catch (error) {
        console.error('[CONFIG] Error:', error);

        await AdvancedCommandLogger.logCommand(interaction, 'config', {
          status: 'ERROR',
          result: error.message,
          executionTime: Date.now() - startTime,
          errorCode: error.name || 'CONFIG_ERROR',
          stackTrace: error.stack
        });

        ErrorLog.log('config', error, { guild: interaction.guild.name });

        return { content: `❌ Error: ${error.message}` };
      }
    });
  }
};
