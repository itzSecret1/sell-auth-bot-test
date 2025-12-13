import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';
import { ErrorLog } from '../utils/errorLogger.js';
import { GuildConfig } from '../utils/GuildConfig.js';
import { config } from '../utils/config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Desbanear un usuario del servidor (Admin only)')
    .addStringOption((option) =>
      option
        .setName('user')
        .setDescription('ID o tag del usuario a desbanear')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Razón del unban (opcional)')
        .setRequired(false)
        .setMaxLength(500)
    ),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction, api) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const userInput = interaction.options.getString('user');
      const reason = interaction.options.getString('reason') || 'Sin razón especificada';

      // Verificar que el bot pueda banear (necesario para unban)
      const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
      if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
        await interaction.editReply({
          content: '❌ El bot no tiene permisos para desbanear miembros'
        });
        return;
      }

      // Verificar que el usuario que ejecuta el comando tenga permisos
      if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        await interaction.editReply({
          content: '❌ No tienes permisos para desbanear miembros'
        });
        return;
      }

      // Obtener lista de baneados
      let bannedUsers;
      try {
        bannedUsers = await interaction.guild.bans.fetch();
      } catch (fetchError) {
        await interaction.editReply({
          content: '❌ Error al obtener la lista de baneados'
        });
        return;
      }

      // Buscar el usuario baneado
      let targetBan = null;
      
      // Intentar buscar por ID
      if (userInput.match(/^\d+$/)) {
        targetBan = bannedUsers.get(userInput);
      }
      
      // Si no se encontró por ID, buscar por tag o username
      if (!targetBan) {
        const searchLower = userInput.toLowerCase();
        for (const [userId, ban] of bannedUsers) {
          const userTag = ban.user.tag.toLowerCase();
          const username = ban.user.username.toLowerCase();
          
          if (userTag.includes(searchLower) || 
              username.includes(searchLower) ||
              userId === userInput) {
            targetBan = ban;
            break;
          }
        }
      }

      if (!targetBan) {
        await interaction.editReply({
          content: `❌ Usuario no encontrado en la lista de baneados: \`${userInput}\``
        });
        return;
      }

      // Desbanear
      try {
        await interaction.guild.members.unban(targetBan.user.id, `${reason} | Desbaneado por: ${interaction.user.tag}`);

        // Crear embed de confirmación
        const unbanEmbed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✅ Usuario Desbaneado')
          .addFields(
            {
              name: '👤 Usuario',
              value: `${targetBan.user} (${targetBan.user.tag})`,
              inline: true
            },
            {
              name: '🆔 ID',
              value: targetBan.user.id,
              inline: true
            },
            {
              name: '👮 Desbaneado por',
              value: `${interaction.user} (${interaction.user.tag})`,
              inline: true
            },
            {
              name: '📝 Razón',
              value: reason,
              inline: false
            },
            {
              name: '📋 Razón del ban original',
              value: targetBan.reason || 'Sin razón',
              inline: false
            }
          )
          .setTimestamp()
          .setFooter({ text: 'SellAuth Bot | Moderation' });

        await interaction.editReply({
          embeds: [unbanEmbed]
        });

        // Log
        await AdvancedCommandLogger.logCommand(interaction, 'unban', {
          status: 'EXECUTED',
          result: 'User unbanned successfully',
          metadata: {
            'Target User': targetBan.user.tag,
            'Target ID': targetBan.user.id,
            'Reason': reason
          }
        });

        console.log(`[UNBAN] ✅ Usuario ${targetBan.user.tag} (${targetBan.user.id}) desbaneado por ${interaction.user.tag}`);

      } catch (unbanError) {
        console.error('[UNBAN] Error al desbanear:', unbanError);
        
        let errorMsg = 'Error desconocido al desbanear';
        if (unbanError.message.includes('Missing Permissions')) {
          errorMsg = 'El bot no tiene permisos para desbanear';
        } else {
          errorMsg = unbanError.message;
        }

        await interaction.editReply({
          content: `❌ Error al desbanear: ${errorMsg}`
        });

        ErrorLog.log('unban', unbanError, {
          targetUserId: targetBan.user.id,
          executorId: interaction.user.id,
          reason: reason
        });
      }

    } catch (error) {
      console.error('[UNBAN] Error:', error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`
      }).catch(() => {});
    }
  }
};

