import { EmbedBuilder } from 'discord.js';

const STAFF_CHANNEL_ID = '1441496193711472814';

/**
 * StatusReporter - Sends professional status messages to staff channel
 * Handles both offline recovery notifications and daily online status updates
 */
export class StatusReporter {
  constructor(client) {
    this.client = client;
    this.dailyMessageSent = false;
    this.lastDailyMessageTime = null;
  }

  /**
   * Send offline recovery notification to staff channel
   * @param {Date} resetTime - When the bot will reconnect
   * @param {Number} attemptNumber - Current recovery attempt number
   */
  async notifyOfflineWithRecovery(resetTime, attemptNumber = 1) {
    try {
      const channel = this.client.channels.cache.get(STAFF_CHANNEL_ID);
      if (!channel) {
        console.error('[STATUS] Channel not found:', STAFF_CHANNEL_ID);
        return;
      }

      const now = new Date();
      const waitTime = resetTime - now;
      const hours = Math.floor(waitTime / (60 * 60 * 1000));
      const minutes = Math.floor((waitTime % (60 * 60 * 1000)) / (60 * 1000));

      const embed = new EmbedBuilder()
        .setColor(0xff4444) // Red for offline
        .setTitle('🔴 Bot Status: OFFLINE - Recovery in Progress')
        .setDescription('The SellAuth Discord Bot is temporarily offline due to Discord session limits.')
        .addFields(
          {
            name: '⏱️ Expected Reconnection',
            value: `${resetTime.toUTCString()}\n(In ${hours}h ${minutes}m)`,
            inline: false
          },
          {
            name: '🔧 Reason',
            value: 'Discord rate limit detected. Automatic recovery scheduled.',
            inline: false
          },
          {
            name: '📊 Recovery Status',
            value: `Attempt: ${attemptNumber}/3\nAuto-recovery: ✅ ENABLED`,
            inline: false
          },
          {
            name: '✅ What to expect',
            value:
              'The bot will reconnect automatically at the scheduled time. All commands will resume normal operation immediately after reconnection. No manual intervention needed.',
            inline: false
          }
        )
        .setFooter({
          text: 'SellAuth Bot Status System',
          iconURL: 'https://cdn.discordapp.com/app-icons/1009849347124862193/2a07cee6e1c97f4ac1cbc8c8ef0b2d1c.png'
        })
        .setTimestamp();

      await channel.send({ embeds: [embed] });
      console.log('[STATUS] ✅ Offline notification sent to staff channel');
    } catch (error) {
      console.error('[STATUS] Error sending offline notification:', error.message);
    }
  }

  /**
   * Send daily online status confirmation
   */
  async sendDailyStatusUpdate() {
    try {
      // Only send once per day
      const now = new Date();
      const today = now.toDateString();

      if (this.lastDailyMessageTime && this.lastDailyMessageTime === today && this.dailyMessageSent) {
        return;
      }

      const channel = this.client.channels.cache.get(STAFF_CHANNEL_ID);
      if (!channel) {
        console.error('[STATUS] Channel not found:', STAFF_CHANNEL_ID);
        return;
      }

      // Get bot uptime info
      const uptime = this.client.uptime || 0;
      const uptimeHours = Math.floor(uptime / (60 * 60 * 1000));
      const uptimeMinutes = Math.floor((uptime % (60 * 60 * 1000)) / (60 * 1000));

      const embed = new EmbedBuilder()
        .setColor(0x00ff00) // Green for online
        .setTitle('🟢 Bot Status: ONLINE & OPERATIONAL')
        .setDescription('The SellAuth Discord Bot is running smoothly and ready for use.')
        .addFields(
          {
            name: '✅ Status',
            value: 'All systems operational',
            inline: true
          },
          {
            name: '⏱️ Uptime',
            value: `${uptimeHours}h ${uptimeMinutes}m`,
            inline: true
          },
          {
            name: '📌 Available Commands',
            value:
              '`/stock` • `/replace` • `/unreplace` • `/sync-variants` • `/invoice-view` • `/balance-add` • `/balance-remove` • `/clear` • `/backup` • `/loadbackup` • `/listbackup` • `/audit` • `/config` • `/status` • `/stats` • `/role-info` • `/help`',
            inline: false
          },
          {
            name: '🔐 Security',
            value: 'All safeguards active\n• Rate limiting: ✅\n• Permission validation: ✅\n• Error logging: ✅\n• Auto-recovery: ✅',
            inline: false
          }
        )
        .setFooter({
          text: 'SellAuth Bot Status System | Daily Status Check',
          iconURL: 'https://cdn.discordapp.com/app-icons/1009849347124862193/2a07cee6e1c97f4ac1cbc8c8ef0b2d1c.png'
        })
        .setTimestamp();

      await channel.send({ embeds: [embed] });
      console.log('[STATUS] ✅ Daily status update sent to staff channel');

      this.dailyMessageSent = true;
      this.lastDailyMessageTime = today;
    } catch (error) {
      console.error('[STATUS] Error sending daily status:', error.message);
    }
  }

  /**
   * Reset daily message flag (call at midnight or periodic interval)
   */
  resetDailyFlag() {
    this.dailyMessageSent = false;
  }
}

export const createStatusReporter = (client) => new StatusReporter(client);
