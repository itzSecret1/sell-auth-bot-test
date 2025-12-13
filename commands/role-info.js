import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';
import { ErrorLog } from '../utils/errorLogger.js';
import { quickReply } from '../utils/quickResponse.js';

export default {
  data: new SlashCommandBuilder()
    .setName('role-info')
    .setDescription('Get detailed information about a role')
    .addRoleOption((option) =>
      option
        .setName('role')
        .setDescription('Role to get information about')
        .setRequired(true)
    ),

  onlyWhitelisted: true,
  requiredRole: 'staff',

  async execute(interaction, api) {
    await quickReply(interaction, async () => {
      const startTime = Date.now();
      try {
        const role = interaction.options.getRole('role');
        const memberCount = interaction.guild.members.cache.filter(m => m.roles.cache.has(role.id)).size;

        // Get permissions
        const permissions = role.permissions.toArray();
        const permString = permissions.length > 0 ? permissions.join(', ').substring(0, 1024) : 'No permissions';

        const embed = new EmbedBuilder()
          .setColor(role.color || 0x0099ff)
          .setTitle(`📋 Role Information`)
          .addFields(
            { name: 'Role Name', value: role.name, inline: true },
            { name: 'Role ID', value: role.id, inline: true },
            { name: 'Members', value: memberCount.toString(), inline: true },
            { name: 'Position', value: role.position.toString(), inline: true },
            { name: 'Color', value: role.color ? `#${role.color.toString(16).toUpperCase().padStart(6, '0')}` : 'Default', inline: true },
            { name: 'Mentionable', value: role.mentionable ? '✅ Yes' : '❌ No', inline: true },
            { name: 'Hoisted', value: role.hoist ? '✅ Yes' : '❌ No', inline: true },
            { name: 'Managed', value: role.managed ? '✅ Yes (Bot)' : '❌ No', inline: true },
            { name: 'Created', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`, inline: true }
          );

        if (permissions.length > 0) {
          embed.addFields({ name: 'Key Permissions', value: permString, inline: false });
        }

        await AdvancedCommandLogger.logCommand(interaction, 'role-info', {
          status: 'EXECUTED',
          result: `Showed info for role: ${role.name}`,
          executionTime: Date.now() - startTime,
          metadata: {
            'Role': role.name,
            'Members': memberCount.toString(),
            'Permissions': permissions.length.toString()
          }
        });

        return { embeds: [embed] };
      } catch (error) {
        console.error('[ROLE-INFO] Error:', error);

        await AdvancedCommandLogger.logCommand(interaction, 'role-info', {
          status: 'ERROR',
          result: error.message,
          executionTime: Date.now() - startTime,
          errorCode: error.name || 'ROLEINFO_ERROR',
          stackTrace: error.stack
        });

        ErrorLog.log('role-info', error, { guild: interaction.guild.name });

        return { content: `❌ Error: ${error.message}` };
      }
    });
  }
};
