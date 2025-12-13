import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';
import { ErrorLog } from '../utils/errorLogger.js';
import { BackupManager } from '../utils/BackupManager.js';
import { quickReply } from '../utils/quickResponse.js';

export default {
  data: new SlashCommandBuilder()
    .setName('listbackup')
    .setDescription('List all available backups'),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction, api) {
    const admin = interaction.user.username;

    // Use quick reply to ensure response within 3 seconds
    await quickReply(interaction, async () => {
      const startTime = Date.now();
      try {
        console.log(`[LISTBACKUP] Listing backups...`);

        // Get list of backups
        const backups = BackupManager.listBackups();

        if (backups.length === 0) {
          return {
            content: `ℹ️ No backups found\n✅ Create one with: /backup name:mi-backup`
          };
        }

        // Build embed
        const embed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle('📋 Backups Disponibles')
          .setDescription(`Total: ${backups.length} backup(s)`)
          .setFooter({ text: 'SellAuth Bot | Server Management' })
          .setTimestamp();

        // Add backup fields (max 25 per embed)
        for (let i = 0; i < Math.min(backups.length, 25); i++) {
          const backup = backups[i];
          embed.addFields({
            name: `💾 ${backup.backupName}`,
            value: `📅 ${backup.timestamp}\n🏢 ${backup.guildName}`,
            inline: false
          });
        }

        if (backups.length > 25) {
          embed.addFields({
            name: '⚠️ Y más...',
            value: `Total: ${backups.length} backups`
          });
        }

        // Log
        await AdvancedCommandLogger.logCommand(interaction, 'listbackup', {
          status: 'EXECUTED',
          result: `Listed ${backups.length} backups`,
          executionTime: Date.now() - startTime,
          metadata: {
            'Backups Count': backups.length.toString(),
            'Admin': admin
          }
        });

        console.log(`[LISTBACKUP] ✅ Listed ${backups.length} backups`);
        return { embeds: [embed] };
      } catch (error) {
        console.error('[LISTBACKUP] Error:', error);

        let errorMsg = error.message || 'Unknown error';

        await AdvancedCommandLogger.logCommand(interaction, 'listbackup', {
          status: 'ERROR',
          result: errorMsg,
          executionTime: Date.now() - startTime,
          metadata: {
            'Error': error.message
          },
          errorCode: error.name || 'LIST_ERROR',
          stackTrace: error.stack
        });

        ErrorLog.log('listbackup', error, { admin });

        return { content: `❌ Error al listar backups: \`${errorMsg}\`` };
      }
    });
  }
};