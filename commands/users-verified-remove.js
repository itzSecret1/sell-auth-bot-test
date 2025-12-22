import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { VerifiedUsers } from '../utils/VerifiedUsers.js';
import { config } from '../utils/config.js';
import { GuildConfig } from '../utils/GuildConfig.js';

export default {
  data: new SlashCommandBuilder()
    .setName('users-verified-remove')
    .setDescription('Remove a user from verified users list (only owners)')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to remove from verified list')
        .setRequired(true)
    ),

  onlyWhitelisted: true,
  requiredRole: 'admin', // Solo admins/owners

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Verificar que es owner/admin
      const guildConfig = GuildConfig.getConfig(interaction.guild.id);
      const adminRoleId = guildConfig?.adminRoleId || config.BOT_ADMIN_ROLE_ID;
      const isOwner = adminRoleId && interaction.member.roles.cache.has(adminRoleId);
      
      // También verificar IDs autorizados directamente
      const authorizedUsers = ['1190738779015757914', '1407024330633642005'];
      const isAuthorized = authorizedUsers.includes(interaction.user.id);

      if (!isOwner && !isAuthorized) {
        await interaction.editReply({
          content: '❌ **Unauthorized**\n\nOnly server owners/admins can use this command.'
        });
        return;
      }

      const targetUser = interaction.options.getUser('user');
      
      if (!targetUser) {
        await interaction.editReply({
          content: '❌ User not found.'
        });
        return;
      }

      // Verificar si el usuario está en la lista
      const verifiedUser = VerifiedUsers.getVerifiedUser(targetUser.id);
      
      if (!verifiedUser) {
        await interaction.editReply({
          content: `❌ **User Not Verified**\n\n${targetUser.tag} (${targetUser.id}) is not in the verified users list.`
        });
        return;
      }

      // Remover usuario de la lista usando el método de la clase
      VerifiedUsers.removeVerifiedUser(targetUser.id);
      
      // Obtener estadísticas actualizadas
      const stats = VerifiedUsers.getStats();

      const embed = new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle('✅ User Removed from Verified List')
        .setDescription(`${targetUser} has been removed from the verified users list.`)
        .addFields(
          {
            name: '👤 User Removed',
            value: `${targetUser.tag} (${targetUser.id})`,
            inline: true
          },
          {
            name: '📅 Was Verified',
            value: new Date(verifiedUser.verifiedAt).toLocaleString('en-US'),
            inline: true
          },
          {
            name: '📊 Remaining Verified',
            value: `${stats.total - 1} users`,
            inline: true
          },
          {
            name: '👷 Removed by',
            value: `${interaction.user.tag} (${interaction.user.id})`,
            inline: false
          }
        )
        .setFooter({ text: 'Verification System' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      console.log(`[VERIFIED-REMOVE] User ${targetUser.tag} removed from verified list by ${interaction.user.tag}`);

    } catch (error) {
      console.error('[VERIFIED-REMOVE] Error:', error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`
      }).catch(() => {});
    }
  }
};

