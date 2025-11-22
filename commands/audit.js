import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';
import { ErrorLog } from '../utils/errorLogger.js';
import { AuditLogger } from '../utils/AuditLogger.js';
import { quickReply } from '../utils/quickResponse.js';

export default {
  data: new SlashCommandBuilder()
    .setName('audit')
    .setDescription('View server audit logs (Admin only)')
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Event type to filter (all, role, channel, member, config)')
        .setRequired(false)
        .addChoices(
          { name: 'All Events', value: 'all' },
          { name: 'Role Changes', value: 'role' },
          { name: 'Channel Changes', value: 'channel' },
          { name: 'Member Actions', value: 'member' },
          { name: 'Config Changes', value: 'config' }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName('limit')
        .setDescription('Number of logs to show (1-20)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(20)
    ),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction, api) {
    await quickReply(interaction, async () => {
      const startTime = Date.now();
      try {
        const eventType = interaction.options.getString('type') || 'all';
        const limit = interaction.options.getInteger('limit') || 10;
        const admin = interaction.user.username;

        console.log(`[AUDIT] Fetching logs for ${interaction.guild.name} (${eventType}, limit: ${limit})`);

        let logs = [];

        if (eventType === 'all') {
          logs = AuditLogger.getRecentLogs(interaction.guild.id, limit);
        } else {
          logs = AuditLogger.getLogsByType(interaction.guild.id, eventType, limit);
        }

        if (logs.length === 0) {
          return {
            content: `ℹ️ No audit logs found for type: ${eventType}`
          };
        }

        // Build embed
        const embed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle('📋 Server Audit Log')
          .setDescription(`Type: ${eventType === 'all' ? 'All Events' : eventType}`)
          .setFooter({ text: 'SellAuth Bot | Audit Log' })
          .setTimestamp();

        // Add logs
        for (let i = 0; i < Math.min(logs.length, 10); i++) {
          const log = logs[i];
          const time = new Date(log.timestamp).toLocaleTimeString();
          const fieldValue = `**Type:** ${log.eventType}\n**Time:** ${time}\n**Details:** ${JSON.stringify(log.details).substring(0, 100)}...`;

          embed.addFields({
            name: `Event ${i + 1}`,
            value: fieldValue,
            inline: false
          });
        }

        await AdvancedCommandLogger.logCommand(interaction, 'audit', {
          status: 'EXECUTED',
          result: `Showed ${logs.length} audit logs`,
          executionTime: Date.now() - startTime,
          metadata: {
            'Event Type': eventType,
            'Log Count': logs.length.toString(),
            'Admin': admin
          }
        });

        return { embeds: [embed] };
      } catch (error) {
        console.error('[AUDIT] Error:', error);

        await AdvancedCommandLogger.logCommand(interaction, 'audit', {
          status: 'ERROR',
          result: error.message,
          executionTime: Date.now() - startTime,
          errorCode: error.name || 'AUDIT_ERROR',
          stackTrace: error.stack
        });

        ErrorLog.log('audit', error, { guild: interaction.guild.name });

        return { content: `❌ Error: ${error.message}` };
      }
    });
  }
};
