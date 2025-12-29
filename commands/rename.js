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

      // Verificar si es un ticket y si necesita ser reclamado
      const ticket = TicketManager.getTicketByChannel(channel.id);
      if (ticket && !ticket.closed) {
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
      }

      // Limpiar el nombre (solo minúsculas, sin espacios, sin caracteres especiales)
      const cleanedName = newName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');

      // Renombrar el canal
      try {
        await channel.setName(cleanedName);
        
        // Verificar si es un ticket para logging (ya lo tenemos de arriba)
        const channelType = ticket ? 'Ticket' : 'Channel';
        
        // Verificar si el nombre contiene "done" y mover a categoría "Done"
        if (ticket && (cleanedName.includes('done') || cleanedName.includes('✅'))) {
          try {
            await TicketManager.moveTicketToDoneCategory(interaction.guild, ticket.id, channel);
            console.log(`[RENAME] ✅ Ticket ${ticket.id} moved to "Done" category after rename`);
          } catch (moveError) {
            console.error(`[RENAME] ⚠️ Error moving ticket to Done category:`, moveError.message);
          }
        }
        
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

