import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { SmartAnalytics } from '../utils/SmartAnalytics.js';

const analytics = new SmartAnalytics();

export default {
  data: new SlashCommandBuilder()
    .setName('analytics')
    .setDescription('🤖 View AI-powered sales analytics and insights'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const analysis = analytics.getAnalysis();
      const predictions = analytics.getPredictions();
      const successRate = analytics.getSuccessRate();

      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('📊 AI Analytics Dashboard')
        .setDescription('Advanced sales analysis and insights')
        .addFields(
          {
            name: '📈 Today\'s Performance',
            value: `Transactions: **${analysis.today.transactions}**\nSuccessful: **${analysis.today.successful}**\nFailed: **${analysis.today.failed}**\nVolume: **${analysis.today.volume}** items`,
            inline: true
          },
          {
            name: '📊 Weekly Metrics',
            value: `Transactions: **${analysis.week.transactions}**\nSuccessful: **${analysis.week.successful}**\nVolume: **${analysis.week.volume}** items\nAvg/Day: **${Math.round(analysis.week.volume / 7)}** items`,
            inline: true
          },
          {
            name: '📉 Trends',
            value: `Day-over-Day: **${analysis.trends.dayOverDay > 0 ? '+' : ''}${analysis.trends.dayOverDay}%**\nWeek-over-Week: **${analysis.trends.weekOverWeek > 0 ? '+' : ''}${analysis.trends.weekOverWeek}%**\nTrend: **${analysis.trends.trending}**`,
            inline: true
          },
          {
            name: '✅ Success Rate',
            value: `Overall: **${successRate}%**\nSystem Health: **${successRate > 95 ? '🟢 Excellent' : successRate > 85 ? '🟡 Good' : '🔴 Needs Attention'}**`,
            inline: true
          },
          {
            name: '🏆 Top 5 Products',
            value: analysis.topProducts
              .slice(0, 5)
              .map((p, i) => `${i + 1}. Product ${p.id}: **${p.quantity}** items`)
              .join('\n') || 'No data',
            inline: true
          },
          {
            name: '🔮 Predictions',
            value: `Peak Time: **${predictions.peakHour}**\nExpected Volume: **${predictions.expectedVolume}** items\nRisk: **${predictions.risk}**`,
            inline: true
          },
          {
            name: '💡 Recommendation',
            value: predictions.recommendation,
            inline: false
          }
        )
        .setFooter({
          text: '🤖 Powered by SellAuth AI Analytics',
          iconURL: interaction.user.displayAvatarURL()
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[ANALYTICS] Error:', error.message);
      await interaction.editReply({
        content: `❌ Analytics error: ${error.message}`,
        ephemeral: true
      });
    }
  }
};
