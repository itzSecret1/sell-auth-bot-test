import { config } from './config.js';
import { EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = path.join(__dirname, '../commandLog.json');

export class AdvancedCommandLogger {
  /**
   * Log command execution with detailed professional information
   * @param {Object} interaction - Discord interaction object
   * @param {string} commandName - Name of the command
   * @param {Object} details - Additional details about execution
   * @param {string} details.status - EXECUTED, ERROR, or PENDING
   * @param {string} details.result - Result message
   * @param {number} details.executionTime - Time in ms
   * @param {Object} details.metadata - Command-specific metadata
   * @param {string} details.errorCode - Error code if applicable
   * @param {string} details.stackTrace - Full error stack trace
   */
  static async logCommand(interaction, commandName, details = {}) {
    try {
      // Check if user has staff role
      const staffRoleId = config.BOT_STAFF_ROLE_ID;
      if (!staffRoleId || !interaction.member?.roles?.cache?.has(staffRoleId)) {
        return;
      }

      const {
        status = 'EXECUTED',
        result = 'Command executed',
        executionTime = 0,
        metadata = {},
        errorCode = null,
        stackTrace = null
      } = details;

      // Gather comprehensive data
      const now = new Date();
      const spainTime = now.toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Europe/Madrid'
      });
      
      // Extract command parameters
      const commandParams = [];
      if (interaction.options) {
        for (const option of interaction.options.data) {
          if (option.value !== null && option.value !== undefined) {
            commandParams.push(`${option.name}: ${option.value}`);
          }
        }
      }
      
      const logEntry = {
        timestamp: now.toISOString(),
        timestampLocal: spainTime,
        command: commandName,
        commandParams: commandParams.length > 0 ? commandParams.join(' | ') : 'No parameters',
        user: {
          name: interaction.user.username,
          id: interaction.user.id,
          tag: interaction.user.tag,
          isBot: interaction.user.bot
        },
        guild: {
          name: interaction.guild?.name || 'Unknown',
          id: interaction.guild?.id || 'Unknown'
        },
        channel: {
          name: interaction.channel?.name || 'DM',
          id: interaction.channel?.id || 'Unknown',
          type: interaction.channel?.type || 'Unknown'
        },
        status,
        result,
        executionTime,
        metadata,
        errorCode,
        stackTrace: stackTrace ? stackTrace.substring(0, 500) : null
      };

      // Log to file
      this.writeToFile(logEntry);

      // Create Discord embed
      const embed = this.createEmbed(logEntry);

      // Send to log channel
      if (config.LOG_CHANNEL_ID) {
        await this.sendToLogChannel(interaction, embed, logEntry);
      }

      // Log to console with colors
      this.logToConsole(logEntry);

      return logEntry;
    } catch (error) {
      console.error('[ADVANCED-LOG] Error in logCommand:', error.message);
    }
  }

  static writeToFile(logEntry) {
    try {
      let logs = [];
      if (fs.existsSync(LOG_FILE)) {
        const content = fs.readFileSync(LOG_FILE, 'utf8');
        logs = JSON.parse(content || '[]');
      }

      // Keep only last 1000 logs
      logs.push(logEntry);
      if (logs.length > 1000) {
        logs = logs.slice(-1000);
      }

      fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
    } catch (error) {
      console.error('[ADVANCED-LOG] Error writing to file:', error.message);
    }
  }

  static createEmbed(logEntry) {
    const {
      timestamp,
      timestampLocal,
      command,
      commandParams,
      user,
      guild,
      channel,
      status,
      result,
      executionTime,
      metadata,
      errorCode
    } = logEntry;

    const statusColors = {
      EXECUTED: 0x00aa00,
      ERROR: 0xaa0000,
      PENDING: 0x0099ff,
      WARNING: 0xffaa00
    };

    const statusEmojis = {
      EXECUTED: '✅',
      ERROR: '❌',
      PENDING: '⏳',
      WARNING: '⚠️'
    };

    const embed = new EmbedBuilder()
      .setColor(statusColors[status] || 0x0099ff)
      .setTitle(`${statusEmojis[status] || '📋'} /${command.toUpperCase()}`)
      .setDescription(result)
      .addFields(
        {
          name: '👤 Usuario',
          value: `<@${user.id}> (${user.id})`,
          inline: true
        },
        {
          name: '🏢 Servidor',
          value: `${guild.name} (${guild.id})`,
          inline: true
        },
        {
          name: '📍 Canal',
          value: `<#${channel.id}> (${channel.id})`,
          inline: true
        },
        {
          name: '🕒 Hora (España)',
          value: timestampLocal,
          inline: true
        },
        {
          name: '⚡ Tiempo de ejecución',
          value: `${executionTime}ms`,
          inline: true
        },
        {
          name: '📊 Estado',
          value: status,
          inline: true
        },
        {
          name: '⚙️ Comando Exacto',
          value: `\`/${command}\``,
          inline: false
        },
        {
          name: '📥 Parámetros Recibidos',
          value: `\`\`\`${commandParams}\`\`\``,
          inline: false
        }
      );

    // Add metadata if present
    if (Object.keys(metadata).length > 0) {
      const metadataStr = Object.entries(metadata)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')
        .substring(0, 1024);
      embed.addFields({
        name: '📋 Detalles Adicionales',
        value: metadataStr,
        inline: false
      });
    }

    // Add error information if present
    if (errorCode) {
      embed.addFields({
        name: '🐛 Error Code',
        value: errorCode,
        inline: true
      });
    }

    embed
      .setFooter({
        text: `SellAuth Bot | Registro de Comandos | v1.0`
      })
      .setTimestamp();

    return embed;
  }

  static async sendToLogChannel(interaction, embed, logEntry) {
    try {
      const logChannel = await interaction.guild?.channels?.fetch(config.LOG_CHANNEL_ID);
      if (logChannel && logChannel.isTextBased()) {
        await logChannel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error('[ADVANCED-LOG] Error sending to log channel:', error.message);
    }
  }

  static logToConsole(logEntry) {
    const {
      command,
      user,
      status,
      result,
      executionTime,
      errorCode
    } = logEntry;

    const statusIcon = {
      EXECUTED: '✅',
      ERROR: '❌',
      PENDING: '⏳',
      WARNING: '⚠️'
    }[status] || '📋';

    console.log(
      `[CMD] ${statusIcon} ${command} | User: ${user.name} (${user.id}) | Time: ${executionTime}ms | Status: ${status} ${errorCode ? `| Error: ${errorCode}` : ''}`
    );

    if (result && result !== 'Command executed') {
      console.log(`      └─ Result: ${result}`);
    }
  }

  /**
   * Get command statistics
   */
  static getStatistics() {
    try {
      if (!fs.existsSync(LOG_FILE)) {
        return null;
      }

      const logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8') || '[]');
      
      const stats = {
        totalCommands: logs.length,
        commandsToday: 0,
        errorCount: 0,
        successCount: 0,
        averageExecutionTime: 0,
        byCommand: {},
        byUser: {},
        byStatus: {}
      };

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      let totalTime = 0;

      logs.forEach(log => {
        const logDate = new Date(log.timestamp);
        if (logDate >= today) {
          stats.commandsToday++;
        }

        if (log.status === 'ERROR') stats.errorCount++;
        if (log.status === 'EXECUTED') stats.successCount++;

        totalTime += log.executionTime;

        stats.byCommand[log.command] = (stats.byCommand[log.command] || 0) + 1;
        stats.byUser[log.user.name] = (stats.byUser[log.user.name] || 0) + 1;
        stats.byStatus[log.status] = (stats.byStatus[log.status] || 0) + 1;
      });

      stats.averageExecutionTime = Math.round(totalTime / logs.length);

      return stats;
    } catch (error) {
      console.error('[ADVANCED-LOG] Error getting statistics:', error.message);
      return null;
    }
  }
}
