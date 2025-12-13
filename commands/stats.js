import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';
import { quickReply } from '../utils/quickResponse.js';

export default {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('📊 Ver estadísticas de comandos y actividad del bot'),

  onlyWhitelisted: true,
  requiredRole: 'staff',

  async execute(interaction, api) {
    // Use quick reply to ensure response within 3 seconds
    await quickReply(interaction, async () => {
      const startTime = Date.now();
      try {
        // Get statistics
        const stats = AdvancedCommandLogger.getStatistics();
        
        if (!stats) {
          return {
            content: '❌ No hay datos de estadísticas disponibles aún. Ejecuta algunos comandos primero.'
          };
        }

        // Create main embed
        const embed = new EmbedBuilder()
          .setColor(0x00aa00)
          .setTitle('📊 ESTADÍSTICAS DE ACTIVIDAD DEL BOT')
          .setDescription('Análisis completo de comandos ejecutados')
          .setThumbnail('https://cdn-icons-png.flaticon.com/512/2920/2920222.png')
          .addFields(
            {
              name: '📈 Estadísticas Generales',
              value: 
                `**Total de comandos:** ${stats.totalCommands}\n` +
                `**Hoy:** ${stats.commandsToday}\n` +
                `**Exitosos:** ${stats.successCount} ✅\n` +
                `**Errores:** ${stats.errorCount} ❌\n` +
                `**Tasa de éxito:** ${stats.totalCommands > 0 ? ((stats.successCount / stats.totalCommands) * 100).toFixed(1) : 0}%`,
              inline: false
            },
            {
              name: '⚡ Rendimiento',
              value:
                `**Tiempo promedio:** ${stats.averageExecutionTime}ms\n` +
                `**Más rápido:** <100ms (/help)\n` +
                `**Más lento:** ~18s (/sync-variants)`,
              inline: false
            },
            {
              name: '📊 Top 5 Comandos Usados',
              value: stats.topCommands ? stats.topCommands.slice(0, 5).map(c => `• \`${c.name}\` - ${c.count}x`).join('\n') : 'Sin datos',
              inline: false
            }
          )
          .setFooter({ text: 'SellAuth Bot | Statistics' })
          .setTimestamp();

        await AdvancedCommandLogger.logCommand(interaction, 'stats', {
          status: 'EXECUTED',
          result: `Mostradas estadísticas - ${stats.totalCommands} comandos totales`,
          executionTime: Date.now() - startTime,
          metadata: {
            'Total Comandos': stats.totalCommands.toString(),
            'Hoy': stats.commandsToday.toString(),
            'Exitosos': stats.successCount.toString(),
            'Errores': stats.errorCount.toString(),
            'Tiempo Promedio': `${stats.averageExecutionTime}ms`
          }
        });

        return { embeds: [embed] };
      } catch (error) {
        console.error('[STATS] Error:', error);

        await AdvancedCommandLogger.logCommand(interaction, 'stats', {
          status: 'ERROR',
          result: error.message,
          executionTime: Date.now() - startTime,
          errorCode: error.name,
          stackTrace: error.stack
        });

        return { content: `❌ Error al generar estadísticas: ${error.message}` };
      }
    });
  }
};
