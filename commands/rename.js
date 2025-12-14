import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { TicketManager } from '../utils/TicketManager.js';
import { GuildConfig } from '../utils/GuildConfig.js';
import { config } from '../utils/config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rename')
    .setDescription('Rename a ticket')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('New name for the ticket')
        .setRequired(true)
        .setMaxLength(100)
    ),

  onlyWhitelisted: true,
  requiredRole: 'staff',

  async execute(interaction, api) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const newName = interaction.options.getString('name');
      const channel = interaction.channel;

      // Verificar que estamos en un canal de ticket
      const ticket = TicketManager.getTicketByChannel(channel.id);
      if (!ticket) {
        // Intentar buscar de nuevo después de un pequeño delay
        await new Promise(r => setTimeout(r, 500));
        const ticketRetry = TicketManager.getTicketByChannel(channel.id);
        
        if (!ticketRetry) {
          await interaction.editReply({
            content: '❌ This command can only be used in a ticket channel.\n\n**Note:** Ticket channels are created when users open tickets (e.g., `#replaces-tkt-0001`). If you are in a ticket channel, please wait a moment and try again.'
          });
          return;
        }
        
        // Si encontramos el ticket en el segundo intento, continuar con ticketRetry
        const actualTicket = ticketRetry;
        
        // Renombrar el canal
        try {
          await channel.setName(newName.toLowerCase().replace(/\s+/g, '-'));
          
          const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('✅ Ticket Renamed')
            .setDescription(`The ticket has been renamed to: **${newName}**`)
            .setFooter({ text: `Renamed by ${interaction.user.username}` })
            .setTimestamp();

          await interaction.editReply({
            embeds: [embed]
          });

          console.log(`[RENAME] Ticket ${actualTicket.id} renombrado a "${newName}" por ${interaction.user.tag}`);
          return;
        } catch (error) {
          console.error('[RENAME] Error:', error);
          await interaction.editReply({
            content: `❌ Error renaming the ticket: ${error.message}`
          });
          return;
        }
      }

      // Renombrar el canal
      try {
        await channel.setName(newName.toLowerCase().replace(/\s+/g, '-'));
        
        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✅ Ticket Renamed')
          .setDescription(`The ticket has been renamed to: **${newName}**`)
          .setFooter({ text: `Renamed by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({
          embeds: [embed]
        });

        console.log(`[RENAME] Ticket ${ticket.id} renombrado a "${newName}" por ${interaction.user.tag}`);
      } catch (error) {
        console.error('[RENAME] Error:', error);
        await interaction.editReply({
          content: `❌ Error renaming the ticket: ${error.message}`
        });
      }

    } catch (error) {
      console.error('[RENAME] Error:', error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`
      }).catch(() => {});
    }
  }
};

