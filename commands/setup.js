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
        .addChannelOption((option) =>
          option
            .setName('verification_channel')
            .setDescription('Canal para verificación/autorización del bot (opcional)')
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName('member_role')
            .setDescription('Rol de miembro (se asigna al verificar/autorizar, opcional)')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('Edit a specific configuration field')
        .addStringOption((option) =>
          option
            .setName('field')
            .setDescription('Field to edit')
            .setRequired(true)
            .addChoices(
              { name: 'Member Role', value: 'member_role' },
              { name: 'Verification Channel', value: 'verification_channel' },
              { name: 'Viewer Role', value: 'viewer_role' },
              { name: 'Bot Status Channel', value: 'bot_status_channel' },
              { name: 'Automod Channel', value: 'automod_channel' },
              { name: 'Backup Channel', value: 'backup_channel' },
              { name: 'Weekly Reports Channel', value: 'weekly_reports_channel' },
              { name: 'Accept Channel', value: 'accept_channel' },
              { name: 'Staff Rating Support Channel', value: 'staff_rating_support_channel' },
              { name: 'Staff Feedbacks Channel', value: 'staff_feedbacks_channel' },
              { name: 'Vouches Channel', value: 'vouches_channel' },
              { name: 'Customer Role', value: 'customer_role' },
              { name: 'Log Channel', value: 'log_channel' },
              { name: 'Transcript Channel', value: 'transcript_channel' },
              { name: 'Rating Channel', value: 'rating_channel' },
              { name: 'Spam Channel', value: 'spam_channel' },
              { name: 'Trial Admin Role', value: 'trial_admin_role' }
            )
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('Role to set (if editing a role field)')
            .setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel to set (if editing a channel field)')
            .setRequired(false)
        ),
    ),

  async execute(interaction, api) {
    try {
      // Verificar que el usuario esté autorizado O sea dueño del servidor
      const isOwner = interaction.guild && interaction.guild.ownerId === interaction.user.id;
      const isAuthorized = AUTHORIZED_USER_IDS.includes(interaction.user.id);
      
      if (!isAuthorized && !isOwner) {
        await interaction.reply({
          content: '❌ No tienes permiso para usar este comando. Solo los usuarios autorizados o el dueño del servidor pueden configurar el bot.',
          ephemeral: true
        });
        return;
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'start') {
        await this.startInteractiveSetup(interaction);
      } else if (subcommand === 'quick') {
        await this.quickSetup(interaction);
      } else if (subcommand === 'edit') {
        await this.editConfig(interaction);
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

    // Obtener URL del website (de configuración o por defecto)
    const guildConfig = GuildConfig.getConfig(interaction.guild.id);
    const websiteUrl = guildConfig?.websiteLink || config.SHOP_URL || 'https://sellauth.com';
    
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
        },
        {
          name: '🌐 Website',
          value: `**URL**: ${websiteUrl}\n\nPuedes configurar el enlace del website que aparecerá en los mensajes del bot.`,
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
        .setLabel('🌐 Go to website')
        .setStyle(ButtonStyle.Link)
        .setURL(websiteUrl),
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
    const verificationChannel = interaction.options.getChannel('verification_channel');
    const memberRole = interaction.options.getRole('member_role');

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

    // Obtener configuración existente para preservar campos adicionales
    const existingConfig = GuildConfig.getConfig(guildId) || {};
    
    // Guardar configuración de forma persistente (preservando campos existentes)
    const guildConfig = GuildConfig.setConfig(guildId, {
      guildId: guildId,
      guildName: interaction.guild.name,
      adminRoleId: adminRole.id,
      staffRoleId: staffRole.id,
      customerRoleId: customerRole?.id || existingConfig.customerRoleId || null,
      logChannelId: logChannel?.id || existingConfig.logChannelId || null,
      transcriptChannelId: transcriptChannel?.id || existingConfig.transcriptChannelId || null,
      ratingChannelId: ratingChannel?.id || existingConfig.ratingChannelId || null,
      spamChannelId: spamChannel?.id || existingConfig.spamChannelId || null,
      trialAdminRoleId: trialAdminRole?.id || existingConfig.trialAdminRoleId || null,
      viewerRoleId: existingConfig.viewerRoleId || null,
      // Preservar campos adicionales que pueden estar configurados en setup start
      botStatusChannelId: existingConfig.botStatusChannelId || null,
      automodChannelId: existingConfig.automodChannelId || null,
      backupChannelId: existingConfig.backupChannelId || null,
      weeklyReportsChannelId: existingConfig.weeklyReportsChannelId || null,
      acceptChannelId: existingConfig.acceptChannelId || null,
      staffRatingSupportChannelId: existingConfig.staffRatingSupportChannelId || null,
      staffFeedbacksChannelId: existingConfig.staffFeedbacksChannelId || null,
      vouchesChannelId: existingConfig.vouchesChannelId || null,
      verificationChannelId: verificationChannel?.id || existingConfig.verificationChannelId || null,
      memberRoleId: memberRole?.id || existingConfig.memberRoleId || null,
      verificationCategoryId: existingConfig.verificationCategoryId || null,
      websiteLink: existingConfig.websiteLink || config.SHOP_URL || 'https://sellauth.com',
      configuredBy: interaction.user.id,
      configuredByUsername: interaction.user.username
    });

    // Confirmar que se guardó correctamente
    if (!guildConfig) {
      await interaction.editReply({
        content: '❌ Error: No se pudo guardar la configuración. Por favor, intenta de nuevo.'
      });
      return;
    }

    // Verificar inmediatamente que se guardó correctamente
    const verifyConfig = GuildConfig.getConfig(guildId);
    if (!verifyConfig || verifyConfig.adminRoleId !== adminRole.id) {
      console.error(`[SETUP] ⚠️ Warning: Configuration may not have persisted correctly. Retrying...`);
      // Reintentar guardado
      const retryConfig = GuildConfig.setConfig(guildId, guildConfig);
      if (!retryConfig || retryConfig.adminRoleId !== adminRole.id) {
        await interaction.editReply({
          content: '❌ Error: No se pudo verificar que la configuración se guardó correctamente. Por favor, verifica manualmente o intenta de nuevo.'
        });
        return;
      }
    }

    console.log(`[SETUP] ✅ Quick setup configuration saved and verified successfully for guild: ${guildId} (${interaction.guild.name})`);

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
        },
        {
          name: '🔐 Verification Channel',
          value: verificationChannel ? `${verificationChannel}` : 'Not configured',
          inline: true
        },
        {
          name: '👤 Member Role',
          value: memberRole ? `${memberRole}` : 'Not configured',
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
  },

  async editConfig(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guild.id;
    const field = interaction.options.getString('field');
    const role = interaction.options.getRole('role');
    const channel = interaction.options.getChannel('channel');

    // Verificar que existe configuración
    const existingConfig = GuildConfig.getConfig(guildId);
    if (!existingConfig) {
      await interaction.editReply({
        content: '❌ No hay configuración guardada. Usa `/setup start` o `/setup quick` primero.'
      });
      return;
    }

    // Mapear campos a keys de configuración
    const fieldMap = {
      'member_role': 'memberRoleId',
      'verification_channel': 'verificationChannelId',
      'viewer_role': 'viewerRoleId',
      'bot_status_channel': 'botStatusChannelId',
      'automod_channel': 'automodChannelId',
      'backup_channel': 'backupChannelId',
      'weekly_reports_channel': 'weeklyReportsChannelId',
      'accept_channel': 'acceptChannelId',
      'staff_rating_support_channel': 'staffRatingSupportChannelId',
      'staff_feedbacks_channel': 'staffFeedbacksChannelId',
      'vouches_channel': 'vouchesChannelId',
      'customer_role': 'customerRoleId',
      'log_channel': 'logChannelId',
      'transcript_channel': 'transcriptChannelId',
      'rating_channel': 'ratingChannelId',
      'spam_channel': 'spamChannelId',
      'trial_admin_role': 'trialAdminRoleId'
    };

    const configKey = fieldMap[field];
    if (!configKey) {
      await interaction.editReply({
        content: '❌ Campo no válido.'
      });
      return;
    }

    // Verificar que se proporcionó el valor correcto
    const isRoleField = field.includes('role');
    if (isRoleField && !role) {
      await interaction.editReply({
        content: '❌ Debes proporcionar un rol para este campo.'
      });
      return;
    }
    if (!isRoleField && !channel) {
      await interaction.editReply({
        content: '❌ Debes proporcionar un canal para este campo.'
      });
      return;
    }

    // Actualizar configuración
    const updates = {};
    if (isRoleField) {
      updates[configKey] = role.id;
    } else {
      updates[configKey] = channel.id;
    }

    const updatedConfig = GuildConfig.updateConfig(guildId, updates);

    if (!updatedConfig) {
      await interaction.editReply({
        content: '❌ Error al actualizar la configuración.'
      });
      return;
    }

    // Crear embed de confirmación
    const fieldName = field.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('✅ Configuración Actualizada')
      .setDescription(`El campo **${fieldName}** ha sido actualizado exitosamente.`)
      .addFields({
        name: 'Campo',
        value: fieldName,
        inline: true
      })
      .addFields({
        name: 'Valor',
        value: isRoleField ? `${role}` : `${channel}`,
        inline: true
      })
      .setFooter({ text: `Updated by ${interaction.user.username}` })
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed]
    });

    console.log(`[SETUP] Updated ${fieldName} for guild: ${guildId} (${interaction.guild.name})`);
  }
};
