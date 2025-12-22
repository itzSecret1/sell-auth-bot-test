import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';
import { ErrorLog } from '../utils/errorLogger.js';
import { GuildConfig } from '../utils/GuildConfig.js';
import { config } from '../utils/config.js';
import { CommandSpamDetector } from '../utils/CommandSpamDetector.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server (Admin only)')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('User to ban')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Reason for the ban (optional)')
        .setRequired(false)
        .setMaxLength(500)
    )
    .addIntegerOption((option) =>
      option
        .setName('delete_days')
        .setDescription('Days of messages to delete (0-7)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(7)
    ),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction, api) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const targetUser = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason specified';
      const deleteDays = interaction.options.getInteger('delete_days') || 0;

      // Protección: Usuario protegido no puede ser baneado
      const protectedUserId = '1190738779015757914';
      if (targetUser.id === protectedUserId) {
        await interaction.editReply({
          content: '❌ **Protected User**\n\nThis user cannot be banned, kicked, muted, or timed out by anyone except Discord itself.'
        });
        return;
      }

      // Protección: Bot no puede ser baneado
      if (targetUser.id === interaction.client.user.id) {
        await interaction.editReply({
          content: '❌ **Bot Protection**\n\nThe bot cannot be banned.'
        });
        return;
      }

      // Verificar que el usuario no se esté baneando a sí mismo
      if (targetUser.id === interaction.user.id) {
        await interaction.editReply({
          content: '❌ You cannot ban yourself'
        });
        return;
      }

      // Verificar que el bot pueda banear
      const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
      if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
        await interaction.editReply({
          content: '❌ The bot does not have permission to ban members'
        });
        return;
      }

      // Verificar que el usuario que ejecuta el comando tenga permisos
      if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        await interaction.editReply({
          content: '❌ You do not have permission to ban members'
        });
        return;
      }

      // Obtener el miembro del servidor
      let targetMember;
      try {
        targetMember = await interaction.guild.members.fetch(targetUser.id);
      } catch (fetchError) {
        // El usuario no está en el servidor, pero aún se puede banear
        targetMember = null;
      }

      // Verificar jerarquía de roles si el usuario está en el servidor
      if (targetMember) {
        const executorHighestRole = interaction.member.roles.highest.position;
        const targetHighestRole = targetMember.roles.highest.position;
        const botHighestRole = botMember.roles.highest.position;

        if (targetHighestRole >= executorHighestRole) {
          await interaction.editReply({
            content: '❌ You cannot ban a user with a role equal to or higher than yours'
          });
          return;
        }

        if (targetHighestRole >= botHighestRole) {
          await interaction.editReply({
            content: '❌ I cannot ban a user with a role equal to or higher than mine'
          });
          return;
        }
      }

      // Intentar banear
      try {
        await interaction.guild.members.ban(targetUser.id, {
          reason: `${reason} | Baneado por: ${interaction.user.tag}`,
          deleteMessageDays: deleteDays
        });

        // Crear embed de confirmación
        const banEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('🚫 User Banned')
          .addFields(
            {
              name: '👤 User',
              value: `${targetUser} (${targetUser.tag})`,
              inline: true
            },
            {
              name: '🆔 ID',
              value: targetUser.id,
              inline: true
            },
            {
              name: '👮 Banned by',
              value: `${interaction.user} (${interaction.user.tag})`,
              inline: true
            },
            {
              name: '📝 Reason',
              value: reason,
              inline: false
            },
            {
              name: '🗑️ Messages Deleted',
              value: `${deleteDays} day(s)`,
              inline: true
            }
          )
          .setTimestamp()
          .setFooter({ text: 'SellAuth Bot | Moderation' });

        await interaction.editReply({
          embeds: [banEmbed]
        });

        // Enviar notificación al canal de spam
        try {
          const spamChannelId = CommandSpamDetector.getSpamChannelId(interaction.guild.id);
          const spamChannel = spamChannelId ? await interaction.guild.channels.fetch(spamChannelId).catch(() => null) : null;
          
          if (spamChannel) {
            await spamChannel.send({
              content: `🚫 **User Banned**\n\n` +
                `**User:** ${targetUser} (${targetUser.tag})\n` +
                `**ID:** ${targetUser.id}\n` +
                `**Reason:** ${reason}\n` +
                `**Banned by:** ${interaction.user} (${interaction.user.tag})\n` +
                `**Messages Deleted:** ${deleteDays} day(s)`
            });
          }
        } catch (notifyError) {
          console.error('[BAN] Error enviando notificación:', notifyError);
        }

        // Log
        await AdvancedCommandLogger.logCommand(interaction, 'ban', {
          status: 'EXECUTED',
          result: 'User banned successfully',
          metadata: {
            'Target User': targetUser.tag,
            'Target ID': targetUser.id,
            'Reason': reason,
            'Delete Days': deleteDays.toString()
          }
        });

        console.log(`[BAN] ✅ Usuario ${targetUser.tag} (${targetUser.id}) baneado por ${interaction.user.tag}`);

      } catch (banError) {
        console.error('[BAN] Error al banear:', banError);
        
        let errorMsg = 'Unknown error while banning';
        if (banError.message.includes('Missing Permissions')) {
          errorMsg = 'The bot does not have permission to ban this user';
        } else if (banError.message.includes('hierarchy')) {
          errorMsg = 'I cannot ban this user due to role hierarchy';
        } else {
          errorMsg = banError.message;
        }

        await interaction.editReply({
          content: `❌ Error banning user: ${errorMsg}`
        });

        ErrorLog.log('ban', banError, {
          targetUserId: targetUser.id,
          executorId: interaction.user.id,
          reason: reason
        });
      }

    } catch (error) {
      console.error('[BAN] Error:', error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`
      }).catch(() => {});
    }
  }
};

