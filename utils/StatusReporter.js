import { EmbedBuilder } from 'discord.js';
import { GuildConfig } from './GuildConfig.js';

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
   * Get status channel ID from guild config or fallback
   */
  getStatusChannelId(guildId = null) {
    // Try to get from guild config first
    if (guildId) {
      const config = GuildConfig.getConfig(guildId);
      if (config?.botStatusChannelId) {
        return config.botStatusChannelId;
      }
    }
    
    // Fallback to environment variable or default
    return process.env.BOT_STATUS_CHANNEL_ID || process.env.BOT_LOG_CHANNEL || null;
  }

  /**
   * Send offline recovery notification to staff channel
   * @param {Date} resetTime - When the bot will reconnect
   * @param {Number} attemptNumber - Current recovery attempt number
   */
  async notifyOfflineWithRecovery(resetTime, attemptNumber = 1, guildId = null) {
    try {
      const channelId = this.getStatusChannelId(guildId);
      if (!channelId) {
        // Silently skip if no channel configured
        return;
      }

      const channel = this.client.channels.cache.get(channelId);
      if (!channel) {
        // Try to fetch the channel
        try {
          const fetchedChannel = await this.client.channels.fetch(channelId);
          if (fetchedChannel) {
            await this.sendOfflineEmbed(fetchedChannel, resetTime, attemptNumber);
            return;
          }
        } catch (fetchError) {
          // Channel doesn't exist or bot doesn't have access
          return;
        }
        return;
      }

      await this.sendOfflineEmbed(channel, resetTime, attemptNumber);
    } catch (error) {
      // Silently handle errors - status updates are not critical
    }
  }

  /**
   * Send offline embed to channel
   */
  async sendOfflineEmbed(channel, resetTime, attemptNumber) {

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
  }

  /**
   * Send daily online status confirmation
   */
  async sendDailyStatusUpdate(guildId = null) {
    try {
      // Only send once per day
      const now = new Date();
      const today = now.toDateString();

      if (this.lastDailyMessageTime && this.lastDailyMessageTime === today && this.dailyMessageSent) {
        return;
      }

      const channelId = this.getStatusChannelId(guildId);
      if (!channelId) {
        // Silently skip if no channel configured
        return;
      }

      let channel = this.client.channels.cache.get(channelId);
      if (!channel) {
        // Try to fetch the channel
        try {
          channel = await this.client.channels.fetch(channelId);
          if (!channel) {
            // Channel doesn't exist - silently skip
            return;
          }
        } catch (fetchError) {
          // Channel doesn't exist or bot doesn't have access - silently skip
          return;
        }
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

      try {
        await channel.send({ embeds: [embed] });
        console.log('[STATUS] ✅ Daily status update sent to staff channel');

        this.dailyMessageSent = true;
        this.lastDailyMessageTime = today;
      } catch (sendError) {
        // Silently handle send errors - channel might not exist or bot doesn't have permission
        if (sendError.code === 50001 || sendError.code === 10003 || sendError.message?.includes('Channel not found') || sendError.message?.includes('Missing Access')) {
          // Channel doesn't exist or bot doesn't have access - silently skip
          return;
        }
        throw sendError; // Re-throw if it's a different error
      }
    } catch (error) {
      // Silently handle errors - don't log if channel doesn't exist
      if (error.code === 50001 || error.code === 10003 || error.message?.includes('Channel not found') || error.message?.includes('Missing Access')) {
        // Channel doesn't exist or bot doesn't have access - silently skip
        return;
      }
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
