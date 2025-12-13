import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';

export default {
  data: new SlashCommandBuilder().setName('help').setDescription('Show all available commands and their usage'),

  async execute(interaction) {
    const startTime = Date.now();
    try {
      await interaction.deferReply({ ephemeral: true });

      const embeds = [
          new EmbedBuilder()
            .setColor(0x00aa00)
            .setTitle('📚 Bot Help')
            .setDescription('SellAuth Bot Commands')
            .setThumbnail('https://cdn-icons-png.flaticon.com/512/2921/2921222.png'),

          new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('Stock & Items')
            .addFields(
              { name: '/stock', value: 'View products', inline: true },
              { name: '/replace', value: 'Extract items', inline: true },
              { name: '/unreplace', value: 'Restore items', inline: true }
            ),

          new EmbedBuilder()
            .setColor(0xff9900)
            .setTitle('Admin & Sync')
            .addFields(
              { name: '/sync-variants', value: 'Update cache', inline: true },
              { name: '/invoice-view', value: 'View details', inline: true },
              { name: '/balance-add', value: 'Add balance', inline: true },
              { name: '/balance-remove', value: 'Remove balance', inline: true }
            ),

          new EmbedBuilder()
            .setColor(0xcc00ff)
            .setTitle('Server & Backups')
            .addFields(
              { name: '/clear', value: 'Delete msgs', inline: true },
              { name: '/backup', value: 'Backup server', inline: true },
              { name: '/loadbackup', value: 'Restore', inline: true },
              { name: '/listbackup', value: 'List backups', inline: true }
            ),

          new EmbedBuilder()
            .setColor(0xffaa00)
            .setTitle('Analytics & Tools')
            .addFields(
              { name: '/stats', value: 'Statistics', inline: true },
              { name: '/dashboard', value: 'Dashboard', inline: true },
              { name: '/analytics', value: 'AI Analysis', inline: true },
              { name: '/translate', value: '15+ Lang', inline: true },
              { name: '/audit', value: 'Logs', inline: true },
              { name: '/status', value: 'Bot Status', inline: true }
            ),

          new EmbedBuilder()
            .setColor(0x00cccc)
            .setTitle('Moderation')
            .addFields(
              { name: '/ban', value: 'Ban user', inline: true },
              { name: '/unban', value: 'Unban user', inline: true },
              { name: '/config', value: 'Settings', inline: true },
              { name: '/role-info', value: 'Roles', inline: true }
            )
            .setFooter({ text: 'SellAuth Bot v1.0 | 22 Commands' })
            .setTimestamp()
        ];

      await interaction.editReply({ embeds });
      
      await AdvancedCommandLogger.logCommand(interaction, 'help', {
        status: 'EXECUTED',
        result: `Help displayed with ${embeds.length} embeds`,
        executionTime: Date.now() - startTime,
        metadata: {
          'Embeds': embeds.length.toString()
        }
      });
    } catch (error) {
      console.error('[HELP] Error:', error);
      await AdvancedCommandLogger.logCommand(interaction, 'help', {
        status: 'ERROR',
        result: error.message,
        executionTime: Date.now() - startTime,
        errorCode: error.name,
        stackTrace: error.stack
      }).catch(() => {});

      await interaction.editReply({ 
        content: `❌ Error: ${error.message}` 
      }).catch(() => {});
    }
  }
};
