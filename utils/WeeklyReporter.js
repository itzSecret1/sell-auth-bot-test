import { EmbedBuilder } from 'discord.js';
import { readFileSync } from 'fs';

const REPORTS_CHANNEL_ID = '1442913019788001513';

/**
 * WeeklyReporter - Sends professional weekly activity reports
 */
export class WeeklyReporter {
  constructor(client, api) {
    this.client = client;
    this.api = api;
  }

  /**
   * Send weekly report
   */
  async sendWeeklyReport() {
    try {
      const channel = this.client.channels.cache.get(REPORTS_CHANNEL_ID);
      if (!channel) {
        console.error('[WEEKLY] Report channel not found');
        return;
      }

      // Try to read history
      let replaceData = { total: 0, success: 0, failed: 0 };
      try {
        const history = JSON.parse(readFileSync('./replaceHistory.json', 'utf-8'));
        replaceData = {
          total: history.length || 0,
          success: history.filter((h) => h.status === 'success').length || 0,
          failed: history.filter((h) => h.status === 'failed').length || 0
        };
      } catch (e) {
        // File doesn't exist yet
      }

      const now = new Date();
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('📊 Weekly Activity Report')
        .setDescription(`Report for the week of ${lastWeek.toDateString()} - ${now.toDateString()}`)
        .addFields(
          {
            name: '📈 Transactions',
            value: `Total: **${replaceData.total}**\nSuccessful: **${replaceData.success}**\nFailed: **${replaceData.failed}**`,
            inline: true
          },
          {
            name: '✅ Success Rate',
            value: `**${replaceData.total > 0 ? Math.round((replaceData.success / replaceData.total) * 100) : 0}%**`,
            inline: true
          },
          {
            name: '🤖 Bot Status',
            value: `Online: ✅\nCommands: **${Math.round(this.client.uptime / 1000 / 60)}** minutes uptime`,
            inline: false
          },
          {
            name: '💡 Tips',
            value: '• Check low stock items\n• Review failed transactions\n• Update pricing if needed',
            inline: false
          }
        )
        .setFooter({
          text: 'SellAuth Bot Weekly Report',
          iconURL: 'https://cdn.discordapp.com/app-icons/1009849347124862193/2a07cee6e1c97f4ac1cbc8c8ef0b2d1c.png'
        })
        .setTimestamp();

      await channel.send({ embeds: [embed] });
      console.log('[WEEKLY] ✅ Weekly report sent');
    } catch (error) {
      console.error('[WEEKLY] Error sending report:', error.message);
    }
  }

  /**
   * Schedule weekly reports (every Monday at 09:00 UTC)
   */
  scheduleWeeklyReports() {
    const now = new Date();
    const nextMonday = new Date(now);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + ((1 + 7 - nextMonday.getUTCDay()) % 7 || 7));
    nextMonday.setUTCHours(9, 0, 0, 0);

    const timeUntilNext = nextMonday - now;

    console.log(
      `[WEEKLY] ✅ Weekly reports scheduled for Mondays at 09:00 UTC (in ${Math.ceil(timeUntilNext / 1000 / 60)} minutes)`
    );

    // Schedule for first time
    setTimeout(
      () => {
        this.sendWeeklyReport();
        // Then schedule for every 7 days
        setInterval(() => this.sendWeeklyReport(), 7 * 24 * 60 * 60 * 1000);
      },
      timeUntilNext
    );
  }
}

export const createWeeklyReporter = (client, api) => new WeeklyReporter(client, api);
