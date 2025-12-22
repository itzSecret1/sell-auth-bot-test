import { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { TicketManager } from '../utils/TicketManager.js';
import { GuildConfig } from '../utils/GuildConfig.js';
import { config } from '../utils/config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('close-ticket')
    .setDescription('Close the current ticket')
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Reason for closing the ticket (optional for owners/admins, required for staff)')
        .setRequired(false)
        .setMaxLength(500)
    ),

  async execute(interaction) {
    try {
      // Verificar que estamos en un canal de ticket
      let ticket = TicketManager.getTicketByChannel(interaction.channel.id, true); // verbose = true para debugging
      
      if (!ticket) {
        // Log para debugging
        console.log(`[CLOSE-TICKET] Ticket not found for channel: ${interaction.channel.id}`);
        console.log(`[CLOSE-TICKET] Channel name: ${interaction.channel.name}`);
        console.log(`[CLOSE-TICKET] Guild ID: ${interaction.guild.id}`);
        
        // Intentar buscar de nuevo después de un pequeño delay
        await new Promise(r => setTimeout(r, 500));
        ticket = TicketManager.getTicketByChannel(interaction.channel.id, true); // verbose = true para debugging
        
        if (!ticket) {
          await interaction.reply({
            content: '❌ This command can only be used in a ticket channel.\n\n**Note:** If you are in a ticket channel, please wait a moment and try again. The ticket may still be loading.',
            ephemeral: true
          });
          return;
        }
      }

      if (ticket.closed) {
        await interaction.reply({
          content: '❌ This ticket is already closed.',
          ephemeral: true
        });
        return;
      }

      if (ticket.closed) {
        await interaction.reply({
          content: '❌ This ticket is already closed.',
          ephemeral: true
        });
        return;
      }

      // Verificar permisos
      const guildConfig = GuildConfig.getConfig(interaction.guild.id);
      const staffRoleId = guildConfig?.staffRoleId || config.BOT_STAFF_ROLE_ID;
      const adminRoleId = guildConfig?.adminRoleId || config.BOT_ADMIN_ROLE_ID;
      
      const hasStaffRole = staffRoleId && interaction.member.roles.cache.has(staffRoleId);
      const hasAdminRole = adminRoleId && interaction.member.roles.cache.has(adminRoleId);
      const isTicketCreator = ticket.userId === interaction.user.id;
      
      if (!hasStaffRole && !hasAdminRole && !isTicketCreator) {
        await interaction.reply({
          content: '❌ Only staff, admins, or the ticket creator can close tickets.',
          ephemeral: true
        });
        return;
      }

      const closeReason = interaction.options.getString('reason');

      // Si es el creador del ticket (usuario normal), cerrar directamente sin reviews
      if (isTicketCreator && !hasStaffRole && !hasAdminRole) {
        if (!closeReason || closeReason.trim().length === 0) {
          // Mostrar modal para razón obligatoria
          const modal = new ModalBuilder()
            .setCustomId(`ticket_close_modal_${ticket.id}`)
            .setTitle('Close Ticket');

          const reasonInput = new TextInputBuilder()
            .setCustomId('close_reason')
            .setLabel('Reason for closing (required)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Explain why you are closing this ticket...')
            .setRequired(true)
            .setMaxLength(500);

          const actionRow = new ActionRowBuilder().addComponents(reasonInput);
          modal.addComponents(actionRow);

          await interaction.showModal(modal);
          return;
        }

        // Si ya tiene razón, cerrar directamente
        ticket.closeReason = closeReason;
        ticket.closedBy = interaction.user.id;
        ticket.closedByType = 'user';
        TicketManager.saveTickets();
        
        const channel = await interaction.guild.channels.fetch(ticket.channelId);
        if (channel) {
          const closingEmbed = new EmbedBuilder()
            .setColor(0xff9900)
            .setTitle('✅ Ticket Closing')
            .setDescription('This ticket will close in a few seconds...')
            .addFields({
              name: '📝 Reason',
              value: closeReason,
              inline: false
            })
            .addFields({
              name: '👤 Closed by',
              value: `${interaction.user} (Ticket Creator)`,
              inline: false
            })
            .setTimestamp();
          
          await channel.send({ embeds: [closingEmbed] });
        }
        
        await interaction.reply({
          content: '✅ Ticket closing initiated. The ticket will close in a few seconds.',
          ephemeral: true
        });
        
        // Cerrar después de 3-5 segundos
        setTimeout(async () => {
          await TicketManager.closeTicket(interaction.guild, ticket.id, interaction.user.id);
        }, 3000 + Math.random() * 2000);
        
        return;
      }
      
      // Si es owner/admin, puede cerrar sin razón pero la razón aparece en transcript si la pone
      if (hasAdminRole) {
        ticket.closeReason = closeReason || null;
        ticket.closedBy = interaction.user.id;
        ticket.closedByType = 'owner';
        TicketManager.saveTickets();
        
        const channel = await interaction.guild.channels.fetch(ticket.channelId);
        if (channel) {
          const closingEmbed = new EmbedBuilder()
            .setColor(0xff9900)
            .setTitle('✅ Ticket Closing')
            .setDescription('This ticket will close in a few seconds...')
            .addFields({
              name: '👤 Closed by',
              value: `${interaction.user} (Owner/Admin)`,
              inline: false
            });
          
          if (closeReason && closeReason.trim().length > 0) {
            closingEmbed.addFields({
              name: '📝 Reason',
              value: closeReason,
              inline: false
            });
          }
          
          closingEmbed.setTimestamp();
          await channel.send({ embeds: [closingEmbed] });
        }
        
        await interaction.reply({
          content: '✅ Ticket closing initiated. The ticket will close in a few seconds.',
          ephemeral: true
        });
        
        setTimeout(async () => {
          await TicketManager.closeTicket(interaction.guild, ticket.id, interaction.user.id);
        }, 3000 + Math.random() * 2000);
        
        return;
      }
      
      // Si es staff, necesita razón obligatoria y mostrar ratings
      if (hasStaffRole) {
        if (!closeReason || closeReason.trim().length === 0) {
          // Mostrar modal para razón obligatoria
          const modal = new ModalBuilder()
            .setCustomId(`ticket_close_modal_${ticket.id}`)
            .setTitle('Close Ticket');

          const reasonInput = new TextInputBuilder()
            .setCustomId('close_reason')
            .setLabel('Reason for closing (required)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Explain why this ticket is being closed...')
            .setRequired(true)
            .setMaxLength(500);

          const actionRow = new ActionRowBuilder().addComponents(reasonInput);
          modal.addComponents(actionRow);

          await interaction.showModal(modal);
          return;
        }

        // Si ya tiene razón, iniciar proceso de cierre con ratings
        await interaction.reply({
          content: '✅ Closing ticket. Please wait for the rating process to begin...',
          ephemeral: true
        });

        const result = await TicketManager.initiateClose(interaction.guild, ticket.id, interaction.member);
        
        if (result && result.needsReason) {
          // Esto no debería pasar porque ya tenemos la razón, pero por si acaso
          await interaction.followUp({
            content: '⚠️ An error occurred. Please try again.',
            ephemeral: true
          });
        } else {
          // Ya se inició el proceso de ratings
          console.log(`[CLOSE-TICKET] Ticket ${ticket.id} closing initiated by ${interaction.user.tag}`);
        }
        
        return;
      }

    } catch (error) {
      console.error('[CLOSE-TICKET] Error:', error);
      await interaction.reply({
        content: `❌ An error occurred while closing the ticket: ${error.message}`,
        ephemeral: true
      }).catch(() => {});
    }
  }
};

