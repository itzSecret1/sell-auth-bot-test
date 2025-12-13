import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from '../utils/config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Crea el panel de tickets'),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎫 TICKET SYSTEM')
        .setDescription('Select the category for your ticket to get started.')
        .addFields(
          {
            name: '🔄 Replaces',
            value: 'Manage product replacements',
            inline: false
          },
          {
            name: '❓ FAQ',
            value: 'General questions',
            inline: false
          },
          {
            name: '🛒 Purchase',
            value: 'Purchase inquiries',
            inline: false
          },
          {
            name: '🤝 Partner',
            value: 'Partnership requests',
            inline: false
          },
          {
            name: '👑 Partner Manager',
            value: 'Partner management',
            inline: false
          }
        )
        .setFooter({ text: 'Click a button to create your ticket' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_replaces')
          .setLabel('Replaces')
          .setEmoji('🔄')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('ticket_faq')
          .setLabel('FAQ')
          .setEmoji('❓')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('ticket_purchase')
          .setLabel('Purchase')
          .setEmoji('🛒')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('ticket_partner')
          .setLabel('Partner')
          .setEmoji('🤝')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('ticket_partner_manager')
          .setLabel('Partner Manager')
          .setEmoji('👑')
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.channel.send({
        embeds: [embed],
        components: [row]
      });

      await interaction.editReply({
        content: '✅ Panel de tickets creado exitosamente'
      });
    } catch (error) {
      console.error('[TICKETPANEL] Error:', error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`
      }).catch(() => {});
    }
  }
};

