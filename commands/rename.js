import { SlashCommandBuilder, EmbedBuilder, ChannelType } from 'discord.js';
import { TicketManager } from '../utils/TicketManager.js';
import { GuildConfig } from '../utils/GuildConfig.js';
import { config } from '../utils/config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rename')
    .setDescription('Rename the current channel')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('New name for the channel')
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

      // Verificar que es un canal de texto
      if (channel.type !== ChannelType.GuildText) {
        await interaction.editReply({
          content: '❌ This command can only be used in text channels.'
        });
        return;
      }

      // Verificar permisos del bot
      const botMember = interaction.guild.members.me;
      if (!channel.permissionsFor(botMember).has('ManageChannels')) {
        await interaction.editReply({
          content: '❌ I don\'t have permission to rename this channel. Please make sure I have the "Manage Channels" permission.'
        });
        return;
      }

      // Verificar permisos del usuario
      if (!channel.permissionsFor(interaction.member).has('ManageChannels')) {
        await interaction.editReply({
          content: '❌ You don\'t have permission to rename this channel. You need the "Manage Channels" permission.'
        });
        return;
      }

      // Limpiar el nombre (solo minúsculas, sin espacios, sin caracteres especiales)
      const cleanedName = newName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');

      // Renombrar el canal
      try {
        await channel.setName(cleanedName);
        
        // Verificar si es un ticket para logging
        const ticket = TicketManager.getTicketByChannel(channel.id);
        const channelType = ticket ? 'Ticket' : 'Channel';
        
        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle(`✅ ${channelType} Renamed`)
          .setDescription(`The ${channelType.toLowerCase()} has been renamed to: **${cleanedName}**`)
          .addFields({
            name: '📝 Original Name',
            value: newName,
            inline: true
          })
          .addFields({
            name: '✨ New Name',
            value: cleanedName,
            inline: true
          })
          .setFooter({ text: `Renamed by ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({
          embeds: [embed]
        });

        if (ticket) {
          console.log(`[RENAME] Ticket ${ticket.id} renombrado a "${cleanedName}" por ${interaction.user.tag}`);
        } else {
          console.log(`[RENAME] Canal ${channel.name} renombrado a "${cleanedName}" por ${interaction.user.tag}`);
        }
      } catch (error) {
        console.error('[RENAME] Error:', error);
        await interaction.editReply({
          content: `❌ Error renaming the channel: ${error.message}`
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

