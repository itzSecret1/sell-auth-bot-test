import { Collection } from 'discord.js';
import { GuildConfig } from './GuildConfig.js';
import { config } from './config.js';

const REPLACE_SPAM_THRESHOLD = 2; // Más de 2 replaces
const REPLACE_SPAM_TIME_WINDOW = 5000; // 5 segundos
const MAX_QUANTITY_THRESHOLD = 20; // Más de 20 items es sospechoso

// Almacenar historial de replaces por usuario
const replaceHistory = new Collection();

export class ReplaceSpamDetector {
  /**
   * Verificar si un usuario está haciendo spam de replaces
   * @param {string} userId - ID del usuario
   * @param {number} quantity - Cantidad de items en este replace (opcional)
   * @returns {Object} { isSpam: boolean, count: number, timeWindow: number, reason: string }
   */
  static checkReplaceSpam(userId, quantity = 0) {
    const now = Date.now();

    // Obtener historial del usuario
    if (!replaceHistory.has(userId)) {
      replaceHistory.set(userId, []);
    }

    const history = replaceHistory.get(userId);

    // Filtrar replaces fuera de la ventana de tiempo (5 segundos)
    const recentReplaces = history.filter(timestamp => now - timestamp < REPLACE_SPAM_TIME_WINDOW);

    // Agregar este replace al historial
    recentReplaces.push(now);
    replaceHistory.set(userId, recentReplaces);

    // Verificar si la cantidad es sospechosa (> 20)
    if (quantity > MAX_QUANTITY_THRESHOLD) {
      return {
        isSpam: true,
        count: recentReplaces.length,
        timeWindow: REPLACE_SPAM_TIME_WINDOW,
        reason: `Cantidad sospechosa: ${quantity} items (máximo permitido: ${MAX_QUANTITY_THRESHOLD})`,
        quantity: quantity
      };
    }

    // Si tiene más de 2 replaces en 5 segundos, es spam
    if (recentReplaces.length > REPLACE_SPAM_THRESHOLD) {
      return {
        isSpam: true,
        count: recentReplaces.length,
        timeWindow: REPLACE_SPAM_TIME_WINDOW,
        reason: `${recentReplaces.length} replaces ejecutados en menos de ${REPLACE_SPAM_TIME_WINDOW / 1000} segundos`
      };
    }

    return { isSpam: false };
  }

  /**
   * Limpiar historial antiguo (para evitar memory leaks)
   */
  static cleanup() {
    const now = Date.now();
    const maxAge = REPLACE_SPAM_TIME_WINDOW * 2; // Mantener 2x la ventana de tiempo

    for (const [userId, history] of replaceHistory.entries()) {
      const filtered = history.filter(timestamp => now - timestamp < maxAge);
      if (filtered.length === 0) {
        replaceHistory.delete(userId);
      } else {
        replaceHistory.set(userId, filtered);
      }
    }
  }

  /**
   * Obtener el ID del canal de spam para un servidor específico
   */
  static getSpamChannelId(guildId) {
    if (guildId) {
      const guildConfig = GuildConfig.getConfig(guildId);
      if (guildConfig?.spamChannelId) {
        return guildConfig.spamChannelId;
      }
    }
    // Fallback a variable de entorno o valor por defecto
    return config.BOT_SPAM_CHANNEL_ID || null;
  }

  /**
   * Limpiar historial de un usuario específico
   */
  static clearUserHistory(userId) {
    replaceHistory.delete(userId);
  }
}

// Limpiar historial cada 5 minutos
setInterval(() => {
  ReplaceSpamDetector.cleanup();
}, 5 * 60 * 1000);

