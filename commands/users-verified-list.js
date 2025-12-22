import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { VerifiedUsers } from '../utils/VerifiedUsers.js';

export default {
  data: new SlashCommandBuilder()
    .setName('users-verified-list')
    .setDescription('List all users who have verified/authorized the bot')
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
      const perPage = 10;
      
      const stats = VerifiedUsers.getStats();
      const allUsers = stats.users.sort((a, b) => 
        new Date(b.verifiedAt) - new Date(a.verifiedAt)
      );
      
      const totalPages = Math.ceil(allUsers.length / perPage);
      const startIndex = (page - 1) * perPage;
      const endIndex = startIndex + perPage;
      const pageUsers = allUsers.slice(startIndex, endIndex);

      if (allUsers.length === 0) {
        const emptyEmbed = new EmbedBuilder()
          .setColor(0xff9900)
          .setTitle('📋 Verified Users List')
          .setDescription('No verified users found.')
          .addFields({
            name: '📊 Statistics',
            value: `**Total:** 0 users\n**Last Updated:** ${stats.lastUpdated ? new Date(stats.lastUpdated).toLocaleString('en-US') : 'Never'}`,
            inline: false
          })
          .setFooter({ text: 'Verification System' })
          .setTimestamp();

        await interaction.editReply({ embeds: [emptyEmbed] });
        return;
      }

      // Construir lista de usuarios
      let userList = '';
      pageUsers.forEach((user, index) => {
        const userNum = startIndex + index + 1;
        const verifiedDate = new Date(user.verifiedAt).toLocaleString('en-US', { 
          dateStyle: 'short', 
          timeStyle: 'short' 
        });
        userList += `**${userNum}.** ${user.tag} (${user.userId})\n`;
        userList += `   └ Verified: ${verifiedDate}\n`;
        if (user.guildId) {
          userList += `   └ Guild ID: ${user.guildId}\n`;
        }
        userList += '\n';
      });

      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('📋 Verified Users List')
        .setDescription(`Showing page **${page}** of **${totalPages}**`)
        .addFields({
          name: '👥 Users',
          value: userList || 'No users on this page',
          inline: false
        })
        .addFields({
          name: '📊 Statistics',
          value: `**Total:** ${allUsers.length} users\n**Page:** ${page}/${totalPages}\n**Last Updated:** ${stats.lastUpdated ? new Date(stats.lastUpdated).toLocaleString('en-US') : 'Never'}`,
          inline: false
        })
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();

      // Botones de navegación
      const buttons = new ActionRowBuilder();
      
      if (page > 1) {
        buttons.addComponents(
          new ButtonBuilder()
            .setCustomId(`verified_list_prev_${page - 1}`)
            .setLabel('◀ Previous')
            .setStyle(ButtonStyle.Secondary)
        );
      }
      
      if (page < totalPages) {
        buttons.addComponents(
          new ButtonBuilder()
            .setCustomId(`verified_list_next_${page + 1}`)
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Secondary)
        );
      }

      const components = buttons.components.length > 0 ? [buttons] : [];

      await interaction.editReply({ 
        embeds: [embed],
        components: components
      });

      console.log(`[VERIFIED-LIST] User ${interaction.user.tag} viewed verified users list (page ${page})`);
    } catch (error) {
      console.error('[VERIFIED-LIST] Error:', error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`
      }).catch(() => {});
    }
  }
};

