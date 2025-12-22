import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { TicketManager } from '../utils/TicketManager.js';
import { GuildConfig } from '../utils/GuildConfig.js';
import { config } from '../utils/config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('add-user-to-ticket')
    .setDescription('Add a user to the current ticket so they can view and participate')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('User to add to the ticket')
        .setRequired(true)
    ),

  onlyWhitelisted: true,
  requiredRole: 'staff',

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Verify we're in a ticket channel
      const ticket = TicketManager.getTicketByChannel(interaction.channel.id);
      
      if (!ticket) {
        await interaction.editReply({
          content: '❌ This command can only be used in a ticket channel.'
        });
        return;
      }

      if (ticket.closed) {
        await interaction.editReply({
          content: '❌ This ticket is already closed.'
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

      // Check if user is already in the ticket
      const channel = interaction.channel;
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      
      if (!member) {
        await interaction.editReply({
          content: '❌ User is not a member of this server.'
        });
        return;
      }

      // Add user to channel permissions (incluyendo permisos para videos y archivos)
      try {
        await channel.permissionOverwrites.create(targetUser.id, {
          ViewChannel: true,
          SendMessages: true,
          AttachFiles: true, // Permite enviar videos y archivos
          ReadMessageHistory: true,
          EmbedLinks: true // Permite embeds (útil para previews de videos)
        });

        // Send notification to ticket
        const addEmbed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✅ User Added to Ticket')
          .setDescription(`${targetUser} has been added to this ticket and can now view and participate.`)
          .addFields({
            name: '👤 Added by',
            value: `${interaction.user} (${interaction.user.tag})`,
            inline: false
          })
          .setTimestamp();

        await channel.send({ embeds: [addEmbed] });

        await interaction.editReply({
          content: `✅ Successfully added ${targetUser} to this ticket.`
        });

        console.log(`[ADD-USER] User ${targetUser.tag} (${targetUser.id}) added to ticket ${ticket.id} by ${interaction.user.tag}`);
      } catch (error) {
        console.error('[ADD-USER] Error adding user:', error);
        await interaction.editReply({
          content: `❌ Error adding user to ticket: ${error.message}`
        });
      }
    } catch (error) {
      console.error('[ADD-USER] Error:', error);
      await interaction.editReply({
        content: `❌ An error occurred: ${error.message}`
      }).catch(() => {});
    }
  }
};

