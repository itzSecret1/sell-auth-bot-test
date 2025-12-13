import { SlashCommandBuilder, EmbedBuilder, ChannelType } from 'discord.js';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';
import { ErrorLog } from '../utils/errorLogger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Delete messages from the channel (Admin only)')
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction, api) {
    const startTime = Date.now();
    const amount = interaction.options.getInteger('amount');
    const channel = interaction.channel;
    const admin = interaction.user.username;

    try {
      // Verify channel type (must be text channel)
      if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.reply({
          content: `❌ Este comando solo funciona en canales de texto`,
          ephemeral: true
        });

        await AdvancedCommandLogger.logCommand(interaction, 'clear', {
          status: 'EXECUTED',
          result: 'Invalid channel type',
          executionTime: Date.now() - startTime,
          metadata: {
            'Channel Type': channel?.type || 'Unknown',
            'Result': 'Invalid'
          }
        });
        return;
      }

      // Check bot permissions
      if (!channel.permissionsFor(interaction.guild.members.me).has('ManageMessages')) {
        await interaction.reply({
          content: `❌ No tengo permisos para eliminar mensajes\n✅ Asegúrate de que el bot tenga permiso "Manage Messages"`,
          ephemeral: true
        });

        await AdvancedCommandLogger.logCommand(interaction, 'clear', {
          status: 'EXECUTED',
          result: 'Missing bot permissions',
          executionTime: Date.now() - startTime,
          metadata: {
            'Channel': channel.name,
            'Amount': amount.toString(),
            'Result': 'No Permissions'
          }
        });
        return;
      }

      // Defer reply (can take up to 10 seconds)
      await interaction.deferReply({ ephemeral: true });

      console.log(`[CLEAR] Starting to delete ${amount} messages from ${channel.name} by ${admin}`);

      let deletedCount = 0;
      let attempts = 0;
      const maxAttempts = Math.ceil(amount / 100) + 2; // Allow multiple batches + buffer

      // Delete messages in batches (Discord API limit: 100 at a time)
      while (deletedCount < amount && attempts < maxAttempts) {
        try {
          const toDelete = Math.min(100, amount - deletedCount);
          
          // Fetch messages
          const messages = await channel.messages.fetch({ limit: toDelete });
          
          if (messages.size === 0) {
            console.log(`[CLEAR] No more messages available. Stopped at ${deletedCount} deleted.`);
            break;
          }

          // Delete fetched messages
          const deleted = await channel.bulkDelete(messages, true);
          deletedCount += deleted.size;

          console.log(`[CLEAR] Batch ${attempts + 1}: Deleted ${deleted.size} messages (Total: ${deletedCount})`);
          attempts++;

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (batchError) {
          console.error(`[CLEAR] Error in batch ${attempts + 1}:`, batchError.message);
          
          // If error is rate limit or other transient issue, try once more
          if (batchError.code === 'UNKNOWN' || batchError.status === 429) {
            console.log(`[CLEAR] Waiting before retry...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          
          // If other error, break
          break;
        }
      }

      // Success response
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Mensajes Eliminados')
        .addFields(
          { name: '📊 Canal', value: channel.name, inline: true },
          { name: '🗑️ Eliminados', value: `${deletedCount}/${amount}`, inline: true },
          { name: '👤 Admin', value: admin, inline: true }
        )
        .setFooter({ text: 'SellAuth Bot | Channel Management' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Log success
      await AdvancedCommandLogger.logCommand(interaction, 'clear', {
        status: 'EXECUTED',
        result: `Successfully deleted ${deletedCount} messages`,
        executionTime: Date.now() - startTime,
        metadata: {
          'Channel': channel.name,
          'Channel ID': channel.id,
          'Requested': amount.toString(),
          'Deleted': deletedCount.toString(),
          'Admin': admin
        }
      });

      console.log(`[CLEAR] ✅ Successfully deleted ${deletedCount}/${amount} messages from ${channel.name}`);
    } catch (error) {
      console.error('[CLEAR] Error:', error);

      let errorMsg = error.message || 'Unknown error';
      if (error.code === 'MISSING_PERMISSIONS') {
        errorMsg = 'Missing permissions to delete messages';
      } else if (error.status === 429) {
        errorMsg = 'Rate limited - intenta de nuevo en unos segundos';
      }

      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: `❌ Error al eliminar mensajes: \`${errorMsg}\``,
            ephemeral: true
          });
        } else {
          await interaction.editReply({
            content: `❌ Error al eliminar mensajes: \`${errorMsg}\``
          });
        }
      } catch (replyError) {
        console.error('[CLEAR] Failed to send error reply:', replyError.message);
      }

      await AdvancedCommandLogger.logCommand(interaction, 'clear', {
        status: 'ERROR',
        result: errorMsg,
        executionTime: Date.now() - startTime,
        metadata: {
          'Channel': interaction.channel?.name || 'Unknown',
          'Amount': interaction.options.getInteger('amount').toString(),
          'Error': error.message
        },
        errorCode: error.code || 'CLEAR_ERROR',
        stackTrace: error.stack
      });

      ErrorLog.log('clear', error, {
        channel: interaction.channel?.name,
        admin: interaction.user.username
      });
    }
  }
};