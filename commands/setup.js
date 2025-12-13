import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { GuildConfig } from '../utils/GuildConfig.js';
import { config } from '../utils/config.js';

const AUTHORIZED_USER_IDS = ['1190738779015757914', '1407024330633642005'];

export default {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the bot in this server (Authorized users only)')
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Start interactive bot configuration')
    )
    .addSubcommand((sub) =>
      sub
        .setName('quick')
        .setDescription('Quick setup (all parameters at once)')
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
        )
        .addChannelOption((option) =>
          option
            .setName('spam_channel')
            .setDescription('Canal para notificaciones de spam/bans (opcional)')
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName('trial_admin_role')
            .setDescription('Rol de trial admin (solo sync-variants, opcional)')
            .setRequired(false)
        )
    ),

  async execute(interaction, api) {
    try {
      // Verificar que el usuario esté autorizado
      if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
        await interaction.reply({
          content: '❌ No tienes permiso para usar este comando. Solo los usuarios autorizados pueden configurar el bot.',
          ephemeral: true
        });
        return;
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'start') {
        await this.startInteractiveSetup(interaction);
      } else if (subcommand === 'quick') {
        await this.quickSetup(interaction);
      }

    } catch (error) {
      console.error('[SETUP] Error:', error);
      await interaction.editReply({
        content: `❌ Error al configurar el bot: ${error.message}`
      }).catch(() => {});
    }
  },

  async startInteractiveSetup(interaction) {
    await interaction.deferReply({ ephemeral: true });

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

    // Mostrar guía de configuración
    const guideEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🔧 Configuración Interactiva del Bot')
      .setDescription('Te guiaré paso a paso para configurar el bot en este servidor.\n\n**¿Qué necesitas configurar?**')
      .addFields(
        {
          name: '👑 Roles Requeridos',
          value: '**Admin Role**: Acceso completo a todos los comandos\n**Staff Role**: Acceso limitado (trial staff)',
          inline: false
        },
        {
          name: '📝 Canales Opcionales',
          value: '**Log Channel**: Registra todos los comandos y acciones del staff\n**Transcript Channel**: Guarda conversaciones completas de tickets cerrados\n**Rating Channel**: Recibe las calificaciones de servicio y staff de los tickets\n**Spam Channel**: Notificaciones de baneos y detección de spam',
          inline: false
        },
        {
          name: '⚙️ Roles Opcionales',
          value: '**Customer Role**: Rol que se asigna automáticamente a clientes\n**Trial Admin Role**: Solo acceso al comando `/sync-variants`',
          inline: false
        }
      )
      .setFooter({ text: 'Haz clic en "Comenzar" para iniciar la configuración' })
      .setTimestamp();

    const startButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('setup_start_config')
        .setLabel('🚀 Comenzar Configuración')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('setup_cancel')
        .setLabel('❌ Cancelar')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({
      embeds: [guideEmbed],
      components: [startButton]
    });
  },

  async quickSetup(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guild.id;
    const adminRole = interaction.options.getRole('admin_role');
    const staffRole = interaction.options.getRole('staff_role');
    const customerRole = interaction.options.getRole('customer_role');
    const logChannel = interaction.options.getChannel('log_channel');
    const transcriptChannel = interaction.options.getChannel('transcript_channel');
    const ratingChannel = interaction.options.getChannel('rating_channel');
    const spamChannel = interaction.options.getChannel('spam_channel');
    const trialAdminRole = interaction.options.getRole('trial_admin_role');

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
      spamChannelId: spamChannel?.id || null,
      trialAdminRoleId: trialAdminRole?.id || null,
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
          name: '👥 Trial Staff Role',
          value: `${staffRole}`,
          inline: true
        },
        {
          name: '🛒 Customer Role',
          value: customerRole ? `${customerRole}` : 'Not configured',
          inline: true
        },
        {
          name: '📝 Log Channel',
          value: logChannel ? `${logChannel}` : 'Not configured',
          inline: true
        },
        {
          name: '📄 Transcript Channel',
          value: transcriptChannel ? `${transcriptChannel}` : 'Not configured',
          inline: true
        },
        {
          name: '⭐ Rating Channel',
          value: ratingChannel ? `${ratingChannel}` : 'Not configured',
          inline: true
        },
        {
          name: '🚫 Spam/Ban Channel',
          value: spamChannel ? `${spamChannel}` : 'Not configured',
          inline: true
        },
        {
          name: '🔧 Trial Admin Role',
          value: trialAdminRole ? `${trialAdminRole}` : 'Not configured',
          inline: true
        }
      )
      .setFooter({ text: `Configured by ${interaction.user.username}` })
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed]
    });

    // Registrar en consola
    console.log(`[SETUP] Bot configured in server: ${interaction.guild.name} (${guildId})`);
    console.log(`[SETUP] Admin Role: ${adminRole.name} (${adminRole.id})`);
    console.log(`[SETUP] Staff Role: ${staffRole.name} (${staffRole.id})`);
  }
};
