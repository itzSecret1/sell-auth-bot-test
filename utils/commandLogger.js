import { config } from './config.js';
import { EmbedBuilder } from 'discord.js';

export class CommandLogger {
  static async logCommand(interaction, commandName, status = 'EXECUTED') {
    try {
      // Only log if user has Staff role
      const staffRoleId = config.BOT_STAFF_ROLE_ID;
      if (!staffRoleId) {
        console.log('[CMD-LOG] Staff role not configured');
        return;
      }

      // Check if user has staff role
      const hasStaffRole = interaction.member?.roles?.cache?.has(staffRoleId);
      if (!hasStaffRole) {
        return; // Don't log non-staff commands
      }

      // Get guild and channel
      const guild = interaction.guild;
      const channel = interaction.channel;
      const user = interaction.user;
      const member = interaction.member;

      // Format timestamp
      const now = new Date();
      const timestamp = now.toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'UTC'
      });

      // Get command options as string
      const options = interaction.options?.data || [];
      let optionsStr = '';
      if (options.length > 0) {
        optionsStr = options.map(opt => `${opt.name}: ${opt.value}`).join(' | ');
      }

      // Log to console
      console.log(`[CMD-LOG] ${commandName} by ${user.username} (${user.id}) - Status: ${status}`);

      // Create embed
      const embed = new EmbedBuilder()
        .setColor(status === 'EXECUTED' ? 0x00aa00 : status === 'ERROR' ? 0xaa0000 : 0x0099ff)
        .setTitle(`📋 Comando: /${commandName}`)
        .addFields(
          {
            name: '👤 Usuario',
            value: `${user.username} (${user.id})`,
            inline: true
          },
          {
            name: '⏰ Hora',
            value: timestamp,
            inline: true
          },
          {
            name: '✅ Estado',
            value: status,
            inline: true
          }
        );

      if (optionsStr) {
        embed.addFields({
          name: '⚙️ Parámetros',
          value: optionsStr,
          inline: false
        });
      }

      embed.setFooter({ text: `SellAuth Bot | Command Log` })
        .setTimestamp();

      // Send to LOG_CHANNEL_ID if configured, otherwise reply to user
      let logSent = false;
      
      if (config.LOG_CHANNEL_ID) {
        try {
          const logChannel = await guild?.channels?.fetch(config.LOG_CHANNEL_ID);
          if (logChannel && logChannel.isTextBased()) {
            await logChannel.send({ embeds: [embed] });
            console.log('[CMD-LOG] ✅ Sent to LOG_CHANNEL_ID:', config.LOG_CHANNEL_ID);
            logSent = true;
          }
        } catch (e) {
          console.log('[CMD-LOG] ❌ Could not send to log channel:', e.message);
        }
      }

      // If no LOG_CHANNEL_ID or failed to send, send ephemeral reply to user
      if (!logSent) {
        try {
          // Only send reply if not already replied/deferred
          if (interaction && !interaction.replied && !interaction.deferred) {
            await interaction.reply({ embeds: [embed], flags: 64 }); // 64 = ephemeral
            console.log('[CMD-LOG] ✅ Sent ephemeral reply to user');
          }
        } catch (replyError) {
          console.log('[CMD-LOG] Could not send reply:', replyError.message);
        }
      }

      return true;
    } catch (error) {
      console.error('[CMD-LOG] Error logging command:', error.message);
      return false;
    }
  }

  static async logError(interaction, commandName, errorMessage) {
    try {
      const staffRoleId = config.BOT_STAFF_ROLE_ID;
      if (!staffRoleId) return;

      const hasStaffRole = interaction.member?.roles?.cache?.has(staffRoleId);
      if (!hasStaffRole) return;

      await this.logCommand(interaction, commandName, `ERROR: ${errorMessage.substring(0, 50)}`);
    } catch (error) {
      console.error('[CMD-LOG] Error in logError:', error);
    }
  }
}
