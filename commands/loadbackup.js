import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';
import { ErrorLog } from '../utils/errorLogger.js';
import { BackupManager } from '../utils/BackupManager.js';
import { quickReply } from '../utils/quickResponse.js';

export default {
  data: new SlashCommandBuilder()
    .setName('loadbackup')
    .setDescription('Restore a server backup (anti-raid protection)')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Name of the backup to restore')
        .setRequired(true)
        .setMaxLength(50)
    )
    .addStringOption((option) =>
      option
        .setName('date')
        .setDescription('Date of the backup (YYYY-MM-DD format, e.g., 2025-11-22)')
        .setRequired(true)
    ),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction, api) {
    const backupName = interaction.options.getString('name')?.trim();
    const backupDate = interaction.options.getString('date')?.trim();
    const admin = interaction.user.username;

    // Use quick reply to ensure response within 3 seconds
    await quickReply(interaction, async () => {
      const startTime = Date.now();
      try {
        // Validate inputs
        if (!backupName || backupName.length === 0) {
          return {
            content: `❌ Backup name required\n✅ Use: /loadbackup name:mi-backup date:2025-11-22`
          };
        }

        if (!backupDate || backupDate.length === 0) {
          return {
            content: `❌ Date required\n✅ Format: YYYY-MM-DD (e.g., 2025-11-22)`
          };
        }

        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(backupDate)) {
          return {
            content: `❌ Invalid date format\n✅ Use: YYYY-MM-DD (e.g., 2025-11-22)`
          };
        }

        console.log(`[RESTORE] Starting restore of "${backupName}" (${backupDate}) by ${admin}...`);

        // Load backup
        const backupData = BackupManager.loadBackup(backupName, backupDate);

        // Start restore (runs in background after response)
        console.log(`[RESTORE] Loading backup data...`);

        // Restore backup
        const restored = await BackupManager.restoreBackup(interaction.guild, backupData);

        // Response
        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✅ Servidor Restaurado')
          .addFields(
            { name: '💾 Backup', value: `${backupName} (${backupDate})`, inline: true },
            { name: '🏢 Servidor', value: interaction.guild.name, inline: true },
            { name: '👥 Roles Restaurados', value: restored.roles.toString(), inline: true },
            { name: '📂 Canales Restaurados', value: restored.channels.toString(), inline: true },
            { name: '🔐 Permisos Restaurados', value: restored.permissions.toString(), inline: true },
            { name: '👤 Admin', value: admin, inline: true }
          );

        // Add errors if any
        if (restored.errors.length > 0) {
          const errorText = restored.errors.slice(0, 5).join('\n');
          embed.addFields(
            { name: '⚠️ Errores', value: `\`\`\`${errorText}\`\`\`` }
          );
        }

        embed
          .setFooter({ text: 'SellAuth Bot | Server Management' })
          .setTimestamp();

        // Log success
        await AdvancedCommandLogger.logCommand(interaction, 'loadbackup', {
          status: 'EXECUTED',
          result: 'Backup restored successfully',
          executionTime: Date.now() - startTime,
          metadata: {
            'Backup Name': backupName,
            'Backup Date': backupDate,
            'Guild': interaction.guild.name,
            'Roles Restored': restored.roles.toString(),
            'Channels Restored': restored.channels.toString(),
            'Permissions Restored': restored.permissions.toString(),
            'Errors': restored.errors.length.toString(),
            'Admin': admin
          }
        });

        console.log(`[RESTORE] ✅ Restore completed for "${backupName}"`);
        return { embeds: [embed] };
      } catch (error) {
        console.error('[RESTORE] Error:', error);

        let errorMsg = error.message || 'Unknown error';

        await AdvancedCommandLogger.logCommand(interaction, 'loadbackup', {
          status: 'ERROR',
          result: errorMsg,
          executionTime: Date.now() - startTime,
          metadata: {
            'Backup Name': backupName,
            'Backup Date': backupDate,
            'Guild': interaction.guild.name,
            'Error': error.message
          },
          errorCode: error.name || 'RESTORE_ERROR',
          stackTrace: error.stack
        });

        ErrorLog.log('loadbackup', error, {
          backupName,
          backupDate,
          guild: interaction.guild.name,
          admin
        });

        return { content: `❌ Error al restaurar backup: \`${errorMsg}\`` };
      }
    });
  }
};