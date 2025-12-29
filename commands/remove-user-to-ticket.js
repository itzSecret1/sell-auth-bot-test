import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { TicketManager } from '../utils/TicketManager.js';
import { GuildConfig } from '../utils/GuildConfig.js';
import { config } from '../utils/config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('remove-user-to-ticket')
    .setDescription('Remove a user from the current ticket channel')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to remove from the ticket')
        .setRequired(true)
    ),

  onlyWhitelisted: true,
  requiredRole: 'staff', // Only staff or admins can remove users

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const targetUser = interaction.options.getUser('user');
      const channel = interaction.channel;

      // Verificar si es un canal de ticket
      const ticket = TicketManager.getTicketByChannel(channel.id);
      if (!ticket) {
        await interaction.editReply({ content: '❌ This command can only be used in a ticket channel.' });
        return;
      }

      if (ticket.closed) {
        await interaction.editReply({
          content: '❌ This ticket is already closed.'
        });
        return;
      }

      // Verificar que el ticket haya sido reclamado por staff
      const guildConfig = GuildConfig.getConfig(interaction.guild.id);
      const staffRoleId = guildConfig?.staffRoleId || config.BOT_STAFF_ROLE_ID;
      const adminRoleId = guildConfig?.adminRoleId || config.BOT_ADMIN_ROLE_ID;
      const hasStaffRole = staffRoleId && interaction.member.roles.cache.has(staffRoleId);
      const hasAdminRole = adminRoleId && interaction.member.roles.cache.has(adminRoleId);
      
      // Solo verificar reclamación si es staff (no admin)
      if (hasStaffRole && !hasAdminRole) {
        if (!ticket.claimedBy) {
          await interaction.editReply({
            content: '❌ This ticket must be claimed by staff before it can be managed. Please use the claim button first.'
          });
          return;
        }
        
        // Verificar que el ticket fue reclamado por el staff actual
        if (ticket.claimedBy !== interaction.user.id) {
          await interaction.editReply({
            content: `❌ This ticket has been claimed by another staff member. Only the staff member who claimed it can manage it.`
          });
          return;
        }
      }

      // No permitir remover al creador del ticket
      if (ticket.userId === targetUser.id) {
        await interaction.editReply({
          content: '❌ You cannot remove the ticket creator from their own ticket.'
        });
        return;
      }

      // Verificar permisos del bot
      const botMember = interaction.guild.members.me;
      if (!channel.permissionsFor(botMember).has(PermissionFlagsBits.ManageChannels)) {
        await interaction.editReply({
          content: '❌ I do not have permission to manage channel permissions. Please grant me "Manage Channels" permission.'
        });
        return;
      }

      // Remover permisos del usuario en el canal
      await channel.permissionOverwrites.edit(targetUser.id, {
        ViewChannel: false,
        SendMessages: false
      });

      const embed = new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle('✅ User Removed from Ticket')
        .setDescription(`${targetUser} has been successfully removed from this ticket.`)
        .addFields(
          { name: '👤 User Removed', value: `${targetUser} (${targetUser.tag})\nID: ${targetUser.id}`, inline: true },
          { name: '🎫 Ticket ID', value: ticket.id, inline: true },
          { name: '👷 Removed by', value: `${interaction.user} (${interaction.user.tag})\nID: ${interaction.user.id}`, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      await channel.send({ content: `${targetUser} has been removed from the ticket.` });

      console.log(`[REMOVE-USER-TO-TICKET] User ${targetUser.tag} removed from ticket ${ticket.id} by ${interaction.user.tag}`);

    } catch (error) {
      console.error('[REMOVE-USER-TO-TICKET] Error:', error);
      await interaction.editReply({
        content: `❌ An error occurred while removing the user from the ticket: ${error.message}`
      }).catch(() => {});
    }
  }
};

