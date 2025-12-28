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

      // Obtener nombre del servidor
      const guildName = interaction.guild.name;
      const guildConfig = GuildConfig.getConfig(interaction.guild.id);
      
      // Crear embed con banner y diseño como en foto 4
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎫 Nebula Market Tickets')
        .setDescription('If you need help, click on the option corresponding to the type of ticket you want to open. Response time may vary to many factors, so please be patient.')
        .setFooter({ text: `${guildName} • Ticket System` })
        .setTimestamp();

      // Crear dropdown menu con categorías como en foto 5
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
            .setEmoji('🔄'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Support')
            .setDescription('Receive support from the staff team')
            .setValue('support')
            .setEmoji('💬')
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

