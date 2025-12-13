import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { GuildConfig } from '../utils/GuildConfig.js';
import { config } from '../utils/config.js';

const AUTHORIZED_USER_ID = '1190738779015757914';

export default {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configurar el bot en este servidor (Solo para usuario autorizado)')
    .addRoleOption((option) =>
      option
        .setName('admin_role')
        .setDescription('Rol de administrador/owner del bot')
        .setRequired(true)
    )
    .addRoleOption((option) =>
      option
        .setName('staff_role')
        .setDescription('Rol de trial staff')
        .setRequired(true)
    )
    .addRoleOption((option) =>
      option
        .setName('customer_role')
        .setDescription('Rol de cliente (opcional)')
        .setRequired(false)
    )
    .addChannelOption((option) =>
      option
        .setName('log_channel')
        .setDescription('Canal para logs (opcional)')
        .setRequired(false)
    )
    .addChannelOption((option) =>
      option
        .setName('transcript_channel')
        .setDescription('Canal para transcripts de tickets (opcional)')
        .setRequired(false)
    )
    .addChannelOption((option) =>
      option
        .setName('rating_channel')
        .setDescription('Canal para ratings de tickets (opcional)')
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      // Verificar que el usuario esté autorizado
      if (interaction.user.id !== AUTHORIZED_USER_ID) {
        await interaction.reply({
          content: '❌ No tienes permiso para usar este comando. Solo el usuario autorizado puede configurar el bot.',
          ephemeral: true
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guild.id;
      const adminRole = interaction.options.getRole('admin_role');
      const staffRole = interaction.options.getRole('staff_role');
      const customerRole = interaction.options.getRole('customer_role');
      const logChannel = interaction.options.getChannel('log_channel');
      const transcriptChannel = interaction.options.getChannel('transcript_channel');
      const ratingChannel = interaction.options.getChannel('rating_channel');

      // Verificar permisos del bot
      const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
      const botPermissions = interaction.guild.members.me.permissions;

      const requiredPermissions = [
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.ViewChannel
      ];

      const missingPermissions = requiredPermissions.filter(perm => !botPermissions.has(perm));

      if (missingPermissions.length > 0) {
        await interaction.editReply({
          content: `❌ El bot necesita los siguientes permisos:\n${missingPermissions.map(p => `- ${p}`).join('\n')}\n\nPor favor, otorga estos permisos al bot y vuelve a intentar.`
        });
        return;
      }

      // Guardar configuración
      const guildConfig = GuildConfig.setConfig(guildId, {
        guildId: guildId,
        guildName: interaction.guild.name,
        adminRoleId: adminRole.id,
        staffRoleId: staffRole.id,
        customerRoleId: customerRole?.id || null,
        logChannelId: logChannel?.id || null,
        transcriptChannelId: transcriptChannel?.id || null,
        ratingChannelId: ratingChannel?.id || null,
        configuredBy: interaction.user.id,
        configuredByUsername: interaction.user.username
      });

      // Crear embed de confirmación
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Bot Configurado Exitosamente')
        .setDescription(`El bot ha sido configurado para el servidor **${interaction.guild.name}**`)
        .addFields(
          {
            name: '👑 Rol de Admin',
            value: `${adminRole}`,
            inline: true
          },
          {
            name: '👥 Rol de Trial Staff',
            value: `${staffRole}`,
            inline: true
          },
          {
            name: '🛒 Rol de Cliente',
            value: customerRole ? `${customerRole}` : 'No configurado',
            inline: true
          },
          {
            name: '📝 Canal de Logs',
            value: logChannel ? `${logChannel}` : 'No configurado',
            inline: true
          },
          {
            name: '📄 Canal de Transcripts',
            value: transcriptChannel ? `${transcriptChannel}` : 'No configurado',
            inline: true
          },
          {
            name: '⭐ Canal de Ratings',
            value: ratingChannel ? `${ratingChannel}` : 'No configurado',
            inline: true
          }
        )
        .setFooter({ text: `Configurado por ${interaction.user.username}` })
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed]
      });

      // Registrar en consola
      console.log(`[SETUP] Bot configurado en servidor: ${interaction.guild.name} (${guildId})`);
      console.log(`[SETUP] Admin Role: ${adminRole.name} (${adminRole.id})`);
      console.log(`[SETUP] Staff Role: ${staffRole.name} (${staffRole.id})`);

    } catch (error) {
      console.error('[SETUP] Error:', error);
      await interaction.editReply({
        content: `❌ Error al configurar el bot: ${error.message}`
      }).catch(() => {});
    }
  }
};

