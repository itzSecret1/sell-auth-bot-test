import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { config } from '../utils/config.js';
import { GuildConfig } from '../utils/GuildConfig.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Create the ticket panel'),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Obtener nombre del servidor y logo
      const guildName = interaction.guild.name;
      const guildIcon = interaction.guild.iconURL({ dynamic: true, size: 256 });
      const guildConfig = GuildConfig.getConfig(interaction.guild.id);
      
      // Formato exacto como en las imágenes - TODO EXACTO
      const now = new Date();
      const fechaHora = now.toLocaleDateString('es-ES', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      const embed = new EmbedBuilder()
        .setColor(0x9B59B6) // Color púrpura oscuro exacto como en las imágenes
        .setTitle(`🎫 ${guildName} Tickets`)
        .setDescription('If you need help, click on the option corresponding to the type of ticket you want to open. Response time may vary to many factors, so please be patient.')
        .setThumbnail(guildIcon || null) // Logo del servidor a la derecha
        .setFooter({ 
          text: `${guildName} • Ticket System • hoy a las ${now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`,
          iconURL: guildIcon || undefined
        })
        .setTimestamp();

      // Crear dropdown menu con categorías exactas como en las imágenes
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('ticket_category_select')
        .setPlaceholder('Select a ticket category...')
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel('Product not received')
            .setDescription('Support for products not received')
            .setValue('product_not_received')
            .setEmoji('🚫'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Replace')
            .setDescription('Request product replacement')
            .setValue('replace')
            .setEmoji('⚙️'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Support')
            .setDescription('Receive support from the staff team')
            .setValue('support')
            .setEmoji('💬'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Staff Apply')
            .setDescription('Apply to become a staff member')
            .setValue('staff_apply')
            .setEmoji('📝')
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);

      await interaction.channel.send({
        embeds: [embed],
        components: [row]
      });

      await interaction.editReply({
        content: '✅ Ticket panel created successfully'
      });
    } catch (error) {
      console.error('[TICKETPANEL] Error:', error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`
      }).catch(() => {});
    }
  }
};

