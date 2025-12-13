import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';
import { ErrorLog } from '../utils/errorLogger.js';
import { BackupManager } from '../utils/BackupManager.js';
import { quickReply } from '../utils/quickResponse.js';

export default {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Create a backup of the server (roles, channels, permissions)')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Name for this backup (e.g., "before-raid", "checkpoint-1")')
        .setRequired(true)
        .setMaxLength(50)
    ),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction, api) {
    const backupName = interaction.options.getString('name')?.trim();
    const admin = interaction.user.username;

    // Use quick reply to ensure response within 3 seconds
    await quickReply(interaction, async () => {
      const startTime = Date.now();
      try {
        // Validate backup name
        if (!backupName || backupName.length === 0) {
          return {
            content: `❌ Backup name required\n✅ Use: /backup name:mi-backup`
          };
        }

        // Check if name has invalid characters
        if (!/^[a-zA-Z0-9_-]+$/.test(backupName)) {
          return {
            content: `❌ Invalid backup name\n✅ Only use letters, numbers, - and _`
          };
        }

        console.log(`[BACKUP] Creating backup "${backupName}" by ${admin}...`);

        // Create backup
        const result = await BackupManager.createBackup(interaction.guild, backupName);

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];

        // Success response
        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✅ Backup Creado')
          .addFields(
            { name: '💾 Nombre', value: backupName, inline: true },
            { name: '📅 Fecha', value: dateStr, inline: true },
            { name: '🏢 Servidor', value: interaction.guild.name, inline: true },
            { name: '👥 Roles', value: result.data.roles.length.toString(), inline: true },
            { name: '📂 Canales', value: result.data.channels.length.toString(), inline: true },
            { name: '👤 Admin', value: admin, inline: true }
          )
          .setDescription(`Usa \`/loadbackup\` para restaurar este backup`)
          .setFooter({ text: 'SellAuth Bot | Server Management' })
          .setTimestamp();

        // Log success
        await AdvancedCommandLogger.logCommand(interaction, 'backup', {
          status: 'EXECUTED',
          result: 'Backup created successfully',
          executionTime: Date.now() - startTime,
          metadata: {
            'Backup Name': backupName,
            'Guild': interaction.guild.name,
            'Roles': result.data.roles.length.toString(),
            'Channels': result.data.channels.length.toString(),
            'Date': dateStr,
            'Admin': admin
          }
        });

        console.log(`[BACKUP] ✅ Backup "${backupName}" created successfully`);
        return { embeds: [embed] };
      } catch (error) {
        console.error('[BACKUP] Error:', error);

        let errorMsg = error.message || 'Unknown error';

        await AdvancedCommandLogger.logCommand(interaction, 'backup', {
          status: 'ERROR',
          result: errorMsg,
          executionTime: Date.now() - startTime,
          metadata: {
            'Backup Name': backupName,
            'Guild': interaction.guild.name,
            'Error': error.message
          },
          errorCode: error.name || 'BACKUP_ERROR',
          stackTrace: error.stack
        });

        ErrorLog.log('backup', error, {
          backupName,
          guild: interaction.guild.name,
          admin
        });

        return { content: `❌ Error al crear backup: \`${errorMsg}\`` };
      }
    });
  }
};