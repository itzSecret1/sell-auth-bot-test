import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { GuildConfig } from '../utils/GuildConfig.js';
import { VerifiedUsers } from '../utils/VerifiedUsers.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pullback-list')
    .setDescription('List all verified users that can be restored (Admin only)')
    .addIntegerOption((option) =>
      option
        .setName('page')
        .setDescription('Page number (default: 1)')
        .setRequired(false)
        .setMinValue(1)
    ),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const page = interaction.options.getInteger('page') || 1;
      const pageSize = 10;
      const guild = interaction.guild;

      // Obtener todos los usuarios verificados
      const allVerifiedUsers = VerifiedUsers.getAllVerifiedUsers();
      
      // Filtrar por servidor
      const serverUsers = Object.values(allVerifiedUsers).filter(user => 
        user.guildId === guild.id || user.verifiedGuilds?.includes(guild.id)
      );

      if (serverUsers.length === 0) {
        await interaction.editReply({
          content: '❌ No verified users found for this server.'
        });
        return;
      }

      // Ordenar por fecha de verificación (más recientes primero)
      serverUsers.sort((a, b) => {
        const dateA = new Date(a.verifiedAt || 0);
        const dateB = new Date(b.verifiedAt || 0);
        return dateB - dateA;
      });

      // Paginación
      const totalPages = Math.ceil(serverUsers.length / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const pageUsers = serverUsers.slice(startIndex, endIndex);

      // Verificar qué usuarios están en el servidor
      const usersWithStatus = await Promise.all(
        pageUsers.map(async (userData) => {
          try {
            const member = await guild.members.fetch(userData.userId).catch(() => null);
            return {
              ...userData,
              inServer: !!member,
              hasRole: member ? member.roles.cache.has(guild.roles.cache.find(r => r.name.toLowerCase().includes('member'))?.id || '') : false
            };
          } catch {
            return {
              ...userData,
              inServer: false,
              hasRole: false
            };
          }
        })
      );

      // Crear embed con lista
      const listEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📋 Verified Users List (${serverUsers.length} total)`)
        .setDescription(
          usersWithStatus.map((user, index) => {
            const status = user.inServer ? '✅ In Server' : '❌ Not in Server';
            const date = user.verifiedAt ? new Date(user.verifiedAt).toLocaleDateString('es-ES') : 'Unknown';
            return `${startIndex + index + 1}. **${user.tag || user.username}** (${user.userId})\n   ${status} • Verified: ${date}`;
          }).join('\n\n')
        )
        .setFooter({ 
          text: `Page ${page} of ${totalPages} • Use /pullback to restore users`,
          iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [listEmbed]
      });

    } catch (error) {
      console.error('[PULLBACK-LIST] Error:', error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`
      }).catch(() => {});
    }
  }
};

