import { readFileSync, existsSync } from 'fs';

/**
 * SmartAnalytics - Advanced sales analysis and trend detection
 */
export class SmartAnalytics {
  constructor() {
    this.historyFile = './replaceHistory.json';
  }

  /**
   * Get comprehensive sales analysis
   */
  getAnalysis() {
    try {
      if (!existsSync(this.historyFile)) {
        return this.getEmptyAnalysis();
      }

      const history = JSON.parse(readFileSync(this.historyFile, 'utf-8'));
      const now = new Date();

      // Calculate time periods
      const today = this.getDateStart(now);
      const yesterday = this.getDateStart(new Date(now.getTime() - 24 * 60 * 60 * 1000));
      const weekStart = this.getDateStart(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
      const monthStart = this.getDateStart(new Date(now.getFullYear(), now.getMonth(), 1));

      // Filter transactions by period
      const todayTx = history.filter((h) => new Date(h.timestamp) >= today);
      const yesterdayTx = history.filter(
        (h) => new Date(h.timestamp) >= yesterday && new Date(h.timestamp) < today
      );
      const weekTx = history.filter((h) => new Date(h.timestamp) >= weekStart);
      const monthTx = history.filter((h) => new Date(h.timestamp) >= monthStart);

      return {
        today: {
          transactions: todayTx.length,
          successful: todayTx.filter((h) => h.status === 'success').length,
          failed: todayTx.filter((h) => h.status === 'failed').length,
          volume: todayTx.reduce((sum, h) => sum + (h.quantity || 1), 0)
        },
        yesterday: {
          transactions: yesterdayTx.length,
          volume: yesterdayTx.reduce((sum, h) => sum + (h.quantity || 1), 0)
        },
        week: {
          transactions: weekTx.length,
          successful: weekTx.filter((h) => h.status === 'success').length,
          volume: weekTx.reduce((sum, h) => sum + (h.quantity || 1), 0)
        },
        month: {
          transactions: monthTx.length,
          successful: monthTx.filter((h) => h.status === 'success').length,
          volume: monthTx.reduce((sum, h) => sum + (h.quantity || 1), 0)
        },
        topProducts: this.getTopProducts(history, 5),
        trends: this.analyzeTrends(todayTx, yesterdayTx, weekTx)
      };
    } catch (error) {
      console.error('[ANALYTICS] Error:', error.message);
      return this.getEmptyAnalysis();
    }
  }

  /**
   * Get top products
   */
  getTopProducts(history, limit = 5) {
    const productMap = {};

    history.forEach((tx) => {
      const key = tx.productId || 'unknown';
      if (!productMap[key]) {
        productMap[key] = { id: key, count: 0, quantity: 0 };
      }
      productMap[key].count += 1;
      productMap[key].quantity += tx.quantity || 1;
    });

    return Object.values(productMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, limit);
  }

  /**
   * Analyze trends
   */
  analyzeTrends(todayTx, yesterdayTx, weekTx) {
    const todayVolume = todayTx.reduce((sum, h) => sum + (h.quantity || 1), 0);
    const yesterdayVolume = yesterdayTx.reduce((sum, h) => sum + (h.quantity || 1), 0);
    const weekAvg = weekTx.length > 0 ? weekTx.reduce((sum, h) => sum + (h.quantity || 1), 0) / 7 : 0;

    const dayChange = yesterdayVolume > 0 ? Math.round(((todayVolume - yesterdayVolume) / yesterdayVolume) * 100) : 0;
    const weekChange = weekAvg > 0 ? Math.round(((todayVolume - weekAvg) / weekAvg) * 100) : 0;

    return {
      dayOverDay: dayChange,
      weekOverWeek: weekChange,
      trending: dayChange > 10 ? 'UP' : dayChange < -10 ? 'DOWN' : 'STABLE'
    };
  }

  /**
   * Get success rate
   */
  getSuccessRate() {
    try {
      if (!existsSync(this.historyFile)) return 100;

      const history = JSON.parse(readFileSync(this.historyFile, 'utf-8'));
      if (history.length === 0) return 100;

      const successful = history.filter((h) => h.status === 'success').length;
      return Math.round((successful / history.length) * 100);
    } catch (e) {
      return 100;
    }
  }

  /**
   * Get predictive insights
   */
  getPredictions() {
    const analysis = this.getAnalysis();

    const predictions = {
      peakHour: this.predictPeakHour(),
      expectedVolume: Math.round(analysis.today.volume * 1.35), // 35% increase expected
      recommendation: this.getRecommendation(analysis),
      risk: this.assessRisk(analysis)
    };

    return predictions;
  }

  /**
   * Predict peak hour
   */
  predictPeakHour() {
    // Simple prediction: typical peak is 14:00 UTC for most commerce
    const now = new Date();
    const hours = Math.abs(14 - now.getUTCHours());
    return `${14}:00 UTC (in ~${hours} hours)`;
  }

  /**
   * Get AI recommendation
   */
  getRecommendation(analysis) {
    if (analysis.today.failed === 0 && analysis.today.successful > 10) {
      return '✅ Optimal performance - maintain current settings';
    } else if (analysis.today.failed > analysis.today.successful * 0.1) {
      return '⚠️ High failure rate - consider sync-variants';
    } else if (analysis.today.volume > 100) {
      return '📈 High volume - stock levels optimal, maintain inventory';
    } else {
      return '📊 Normal operations - all systems running smoothly';
    }
  }

  /**
   * Assess operational risk
   */
  assessRisk(analysis) {
    let riskScore = 0;

    // Check failure rate
    if (analysis.today.successful + analysis.today.failed > 0) {
      const failureRate = (analysis.today.failed / (analysis.today.successful + analysis.today.failed)) * 100;
      if (failureRate > 15) riskScore += 3;
      else if (failureRate > 5) riskScore += 1;
    }

    // Check volume
    if (analysis.today.volume > 500) riskScore += 1;

    // Overall assessment
    if (riskScore >= 3) return '🔴 HIGH - Monitor closely';
    if (riskScore >= 1) return '🟡 MEDIUM - Keep an eye on it';
    return '🟢 LOW - All clear';
  }

  /**
   * Helper: Get date start
   */
  getDateStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  /**
   * Get empty analysis template
   */
  getEmptyAnalysis() {
    return {
      today: { transactions: 0, successful: 0, failed: 0, volume: 0 },
      yesterday: { transactions: 0, volume: 0 },
      week: { transactions: 0, successful: 0, volume: 0 },
      month: { transactions: 0, successful: 0, volume: 0 },
      topProducts: [],
      trends: { dayOverDay: 0, weekOverWeek: 0, trending: 'STABLE' }
    };
  }
}

export const createSmartAnalytics = () => new SmartAnalytics();
