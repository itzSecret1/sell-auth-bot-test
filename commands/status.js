import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';
import { quickReply } from '../utils/quickResponse.js';
import os from 'os';

export default {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('View bot system status and performance'),

  async execute(interaction, api) {
    await quickReply(interaction, async () => {
      const startTime = Date.now();
      try {
        const uptime = Math.floor(interaction.client.uptime / 1000);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = uptime % 60;

        const memUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);

        const cpuUsage = process.cpuUsage();
        const userCPU = Math.round(cpuUsage.user / 1000);
        const sysCPU = Math.round(cpuUsage.system / 1000);

        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('🤖 Bot System Status')
          .addFields(
            { name: '⏱️ Uptime', value: `${hours}h ${minutes}m ${seconds}s`, inline: true },
            { name: '📊 Guilds', value: interaction.client.guilds.cache.size.toString(), inline: true },
            { name: '👥 Members', value: interaction.client.guilds.cache.reduce((a, g) => a + g.memberCount, 0).toString(), inline: true },
            { name: '💾 Heap Memory', value: `${heapUsedMB}MB / ${heapTotalMB}MB`, inline: true },
            { name: '⚡ CPU Usage', value: `User: ${userCPU}ms | System: ${sysCPU}ms`, inline: true },
            { name: '📡 Latency', value: `${interaction.client.ws.ping}ms`, inline: true },
            { name: '🏢 Current Guild', value: interaction.guild.name, inline: false },
            { name: '✅ Status', value: 'Online and operational', inline: false }
          )
          .setFooter({ text: 'SellAuth Bot | System Status' })
          .setTimestamp();

        await AdvancedCommandLogger.logCommand(interaction, 'status', {
          status: 'EXECUTED',
          result: 'Status displayed',
          executionTime: Date.now() - startTime,
          metadata: {
            'Uptime': `${hours}h ${minutes}m ${seconds}s`,
            'Guilds': interaction.client.guilds.cache.size.toString(),
            'Heap Memory': `${heapUsedMB}MB`,
            'Latency': `${interaction.client.ws.ping}ms`
          }
        });

        return { embeds: [embed] };
      } catch (error) {
        console.error('[STATUS] Error:', error);
        await AdvancedCommandLogger.logCommand(interaction, 'status', {
          status: 'ERROR',
          result: error.message,
          executionTime: Date.now() - startTime,
          errorCode: error.name || 'STATUS_ERROR'
        });
        return { content: `❌ Error: ${error.message}` };
      }
    });
  }
};
