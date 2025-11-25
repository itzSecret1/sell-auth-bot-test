import { EmbedBuilder } from 'discord.js';
import { SmartAnalytics } from './SmartAnalytics.js';

const ALERT_CHANNEL = process.env.BOT_LOG_CHANNEL || '1441496193711472814';

/**
 * PredictiveAlerts - AI-powered alert system
 */
export class PredictiveAlerts {
  constructor(client) {
    this.client = client;
    this.analytics = new SmartAnalytics();
    this.alertsSent = new Set();
  }

  /**
   * Check for alerts and send if needed
   */
  async checkAndSendAlerts() {
    try {
      const alerts = this.generateAlerts();

      for (const alert of alerts) {
        // Prevent duplicate alerts within same hour
        const alertKey = `${alert.type}_${Math.floor(Date.now() / 3600000)}`;
        if (this.alertsSent.has(alertKey)) continue;

        await this.sendAlert(alert);
        this.alertsSent.add(alertKey);
      }
    } catch (error) {
      console.error('[ALERTS] Error checking alerts:', error.message);
    }
  }

  /**
   * Generate alerts based on metrics
   */
  generateAlerts() {
    const alerts = [];
    const analysis = this.analytics.getAnalysis();
    const predictions = this.analytics.getPredictions();

    // Alert 1: High failure rate
    if (analysis.today.failed > 5 && analysis.today.successful > 0) {
      const failureRate = (analysis.today.failed / (analysis.today.successful + analysis.today.failed)) * 100;
      if (failureRate > 20) {
        alerts.push({
          type: 'HIGH_FAILURE',
          severity: 'high',
          title: '⚠️ High Failure Rate Detected',
          description: `${failureRate.toFixed(1)}% of transactions failed today`,
          recommendation: 'Run `/sync-variants` to update product data'
        });
      }
    }

    // Alert 2: Unusual traffic
    const dayChange = analysis.trends.dayOverDay;
    if (dayChange > 50) {
      alerts.push({
        type: 'HIGH_TRAFFIC',
        severity: 'info',
        title: '📈 Unusual Traffic Spike',
        description: `${dayChange}% increase in volume compared to yesterday`,
        recommendation: 'Monitor stock levels - consider restocking'
      });
    }

    // Alert 3: Low success rate
    const successRate = this.analytics.getSuccessRate();
    if (successRate < 85) {
      alerts.push({
        type: 'LOW_SUCCESS',
        severity: 'warning',
        title: '🔴 Low Success Rate',
        description: `System success rate is ${successRate}%`,
        recommendation: 'Check API connection and product variants'
      });
    }

    // Alert 4: Predicted peak time
    alerts.push({
      type: 'PEAK_PREDICTION',
      severity: 'info',
      title: '🔮 Peak Traffic Predicted',
      description: `Expected peak at ${predictions.peakHour}`,
      recommendation: `Estimated volume: ${predictions.expectedVolume} items`
    });

    return alerts;
  }

  /**
   * Send alert to channel
   */
  async sendAlert(alert) {
    try {
      const channel = this.client.channels.cache.get(ALERT_CHANNEL);
      if (!channel) return;

      const colorMap = {
        high: 0xff4444,
        warning: 0xffaa44,
        info: 0x4488ff
      };

      const embed = new EmbedBuilder()
        .setColor(colorMap[alert.severity] || 0x5865f2)
        .setTitle(alert.title)
        .setDescription(alert.description)
        .addFields({
          name: '💡 Recommendation',
          value: alert.recommendation,
          inline: false
        })
        .setFooter({
          text: `Alert Type: ${alert.type}`,
          iconURL: 'https://cdn.discordapp.com/app-icons/1009849347124862193/2a07cee6e1c97f4ac1cbc8c8ef0b2d1c.png'
        })
        .setTimestamp();

      await channel.send({ embeds: [embed] });
      console.log(`[ALERTS] ✅ ${alert.type} alert sent`);
    } catch (error) {
      console.error('[ALERTS] Error sending alert:', error.message);
    }
  }

  /**
   * Schedule periodic alert checks (every 6 hours)
   */
  scheduleAlertChecks() {
    // Check every 6 hours
    setInterval(() => this.checkAndSendAlerts(), 6 * 60 * 60 * 1000);
    console.log('[ALERTS] ✅ Predictive alerts scheduled (every 6 hours)');
  }
}

export const createPredictiveAlerts = (client) => new PredictiveAlerts(client);
