import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';
import { ErrorLog } from '../utils/errorLogger.js';
import { GuildConfig } from '../utils/GuildConfig.js';
import { config } from '../utils/config.js';
import { CommandSpamDetector } from '../utils/CommandSpamDetector.js';

const SPAM_CHANNEL_ID = '1445838663786172619';

export default {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Banear un usuario del servidor (Admin only)')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Usuario a banear')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Razón del ban (opcional)')
        .setRequired(false)
        .setMaxLength(500)
    )
    .addIntegerOption((option) =>
      option
        .setName('delete_days')
        .setDescription('Días de mensajes a eliminar (0-7)')
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
      const reason = interaction.options.getString('reason') || 'Sin razón especificada';
      const deleteDays = interaction.options.getInteger('delete_days') || 0;

      // Verificar que el usuario no se esté baneando a sí mismo
      if (targetUser.id === interaction.user.id) {
        await interaction.editReply({
          content: '❌ No puedes banearte a ti mismo'
        });
        return;
      }

      // Verificar que el bot pueda banear
      const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
      if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
        await interaction.editReply({
          content: '❌ El bot no tiene permisos para banear miembros'
        });
        return;
      }

      // Verificar que el usuario que ejecuta el comando tenga permisos
      if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        await interaction.editReply({
          content: '❌ No tienes permisos para banear miembros'
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
            content: '❌ No puedes banear a un usuario con un rol igual o superior al tuyo'
          });
          return;
        }

        if (targetHighestRole >= botHighestRole) {
          await interaction.editReply({
            content: '❌ No puedo banear a un usuario con un rol igual o superior al mío'
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
          .setTitle('🚫 Usuario Baneado')
          .addFields(
            {
              name: '👤 Usuario',
              value: `${targetUser} (${targetUser.tag})`,
              inline: true
            },
            {
              name: '🆔 ID',
              value: targetUser.id,
              inline: true
            },
            {
              name: '👮 Baneado por',
              value: `${interaction.user} (${interaction.user.tag})`,
              inline: true
            },
            {
              name: '📝 Razón',
              value: reason,
              inline: false
            },
            {
              name: '🗑️ Mensajes eliminados',
              value: `${deleteDays} día(s)`,
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
          const spamChannel = await interaction.guild.channels.fetch(SPAM_CHANNEL_ID).catch(() => null);
          
          if (spamChannel) {
            await spamChannel.send({
              content: `🚫 **Usuario Baneado**\n\n` +
                `**Usuario:** ${targetUser} (${targetUser.tag})\n` +
                `**ID:** ${targetUser.id}\n` +
                `**Razón:** ${reason}\n` +
                `**Baneado por:** ${interaction.user} (${interaction.user.tag})\n` +
                `**Mensajes eliminados:** ${deleteDays} día(s)`
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
        
        let errorMsg = 'Error desconocido al banear';
        if (banError.message.includes('Missing Permissions')) {
          errorMsg = 'El bot no tiene permisos para banear a este usuario';
        } else if (banError.message.includes('hierarchy')) {
          errorMsg = 'No puedo banear a este usuario debido a la jerarquía de roles';
        } else {
          errorMsg = banError.message;
        }

        await interaction.editReply({
          content: `❌ Error al banear: ${errorMsg}`
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

