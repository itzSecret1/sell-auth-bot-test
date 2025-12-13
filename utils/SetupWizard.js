import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { GuildConfig } from './GuildConfig.js';

export class SetupWizard {
  static setupSessions = new Map(); // Almacenar sesiones de setup por usuario

  static createSession(userId, guildId) {
    const session = {
      userId,
      guildId,
      step: 0,
      config: {
        adminRoleId: null,
        staffRoleId: null,
        customerRoleId: null,
        logChannelId: null,
        transcriptChannelId: null,
        ratingChannelId: null,
        spamChannelId: null,
        trialAdminRoleId: null
      }
    };
    this.setupSessions.set(userId, session);
    return session;
  }

  static getSession(userId) {
    return this.setupSessions.get(userId);
  }

  static deleteSession(userId) {
    this.setupSessions.delete(userId);
  }

  static getStepEmbed(step, session) {
    const steps = [
      {
        title: '👑 Paso 1: Rol de Administrador',
        description: '**¿Qué es?**\nEl rol de administrador tiene acceso completo a todos los comandos del bot.\n\n**¿Quién debe tenerlo?**\nLos dueños y administradores principales del servidor.',
        fieldName: 'Admin Role',
        fieldValue: session.config.adminRoleId ? `<@&${session.config.adminRoleId}>` : 'No configurado',
        buttonId: 'setup_admin_role'
      },
      {
        title: '👥 Paso 2: Rol de Trial Staff',
        description: '**¿Qué es?**\nEl rol de trial staff tiene acceso limitado a comandos específicos como `/replace`, `/unreplace`, `/claim`, etc.\n\n**¿Quién debe tenerlo?**\nLos miembros del staff que ayudan con el soporte y gestión de productos.',
        fieldName: 'Staff Role',
        fieldValue: session.config.staffRoleId ? `<@&${session.config.staffRoleId}>` : 'No configurado',
        buttonId: 'setup_staff_role'
      },
      {
        title: '📝 Paso 3: Canal de Logs',
        description: '**¿Qué es?**\nEste canal registra todas las acciones importantes del bot:\n• Comandos ejecutados por el staff\n• Cambios en el stock\n• Órdenes procesadas\n• Errores y eventos importantes\n\n**¿Es obligatorio?** No, pero es recomendado para mantener un registro de actividad.',
        fieldName: 'Log Channel',
        fieldValue: session.config.logChannelId ? `<#${session.config.logChannelId}>` : 'No configurado (Opcional)',
        buttonId: 'setup_log_channel',
        optional: true
      },
      {
        title: '📄 Paso 4: Canal de Transcripts',
        description: '**¿Qué es?**\nEste canal recibe las transcripciones completas de los tickets cuando se cierran.\n\n**¿Qué contiene?**\n• Todas las conversaciones del ticket\n• Información del usuario\n• Razón de cierre\n• Ratings dados\n\n**¿Es obligatorio?** No, pero es útil para mantener un historial de soporte.',
        fieldName: 'Transcript Channel',
        fieldValue: session.config.transcriptChannelId ? `<#${session.config.transcriptChannelId}>` : 'No configurado (Opcional)',
        buttonId: 'setup_transcript_channel',
        optional: true
      },
      {
        title: '⭐ Paso 5: Canal de Ratings',
        description: '**¿Qué es?**\nEste canal recibe las calificaciones que los usuarios dan después de cerrar un ticket.\n\n**¿Qué contiene?**\n• Service Rating (calificación del servicio)\n• Staff Rating (calificación del staff)\n• Información del ticket\n\n**¿Es obligatorio?** No, pero es útil para monitorear la satisfacción del cliente.',
        fieldName: 'Rating Channel',
        fieldValue: session.config.ratingChannelId ? `<#${session.config.ratingChannelId}>` : 'No configurado (Opcional)',
        buttonId: 'setup_rating_channel',
        optional: true
      },
      {
        title: '🚫 Paso 6: Canal de Spam/Bans',
        description: '**¿Qué es?**\nEste canal recibe notificaciones de moderación:\n• Usuarios baneados por spam de comandos\n• Usuarios baneados manualmente con `/ban`\n• Detección de actividad sospechosa\n\n**¿Es obligatorio?** No, pero es recomendado para mantener un registro de moderación.',
        fieldName: 'Spam/Ban Channel',
        fieldValue: session.config.spamChannelId ? `<#${session.config.spamChannelId}>` : 'No configurado (Opcional)',
        buttonId: 'setup_spam_channel',
        optional: true
      },
      {
        title: '🛒 Paso 7: Rol de Cliente',
        description: '**¿Qué es?**\nEste rol se asigna automáticamente a los usuarios cuando reclaman una factura con el comando `/claim`.\n\n**¿Es obligatorio?** No, es completamente opcional.',
        fieldName: 'Customer Role',
        fieldValue: session.config.customerRoleId ? `<@&${session.config.customerRoleId}>` : 'No configurado (Opcional)',
        buttonId: 'setup_customer_role',
        optional: true
      },
      {
        title: '🔧 Paso 8: Rol de Trial Admin',
        description: '**¿Qué es?**\nEste rol tiene acceso limitado solo al comando `/sync-variants`.\n\n**¿Para qué sirve?**\nPara usuarios que necesitan sincronizar variantes de productos pero no deben tener acceso completo a todos los comandos.\n\n**¿Es obligatorio?** No, es completamente opcional.',
        fieldName: 'Trial Admin Role',
        fieldValue: session.config.trialAdminRoleId ? `<@&${session.config.trialAdminRoleId}>` : 'No configurado (Opcional)',
        buttonId: 'setup_trial_admin_role',
        optional: true
      }
    ];

    const currentStep = steps[step];
    if (!currentStep) return null;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(currentStep.title)
      .setDescription(currentStep.description)
      .addFields({
        name: currentStep.fieldName,
        value: currentStep.fieldValue,
        inline: false
      })
      .setFooter({ text: `Paso ${step + 1} de ${steps.length} • Usa los botones para configurar` })
      .setTimestamp();

    const buttons = new ActionRowBuilder();
    
    if (currentStep.buttonId.includes('role')) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(currentStep.buttonId)
          .setLabel('Seleccionar Rol')
          .setStyle(ButtonStyle.Primary)
      );
    } else {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(currentStep.buttonId)
          .setLabel('Seleccionar Canal')
          .setStyle(ButtonStyle.Primary)
      );
    }

    if (currentStep.optional) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId('setup_skip')
          .setLabel('⏭️ Omitir')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    if (step > 0) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId('setup_back')
          .setLabel('⬅️ Atrás')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    if (step < steps.length - 1) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId('setup_next')
          .setLabel('Siguiente ➡️')
          .setStyle(ButtonStyle.Success)
      );
    } else {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId('setup_finish')
          .setLabel('✅ Finalizar Configuración')
          .setStyle(ButtonStyle.Success)
      );
    }

    return { embed, buttons };
  }

  static createRoleModal(stepName, label) {
    return new ModalBuilder()
      .setCustomId(`setup_modal_${stepName}`)
      .setTitle(`Configurar ${label}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('role_id')
            .setLabel('ID del Rol')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('123456789012345678')
            .setRequired(true)
            .setMaxLength(20)
        )
      );
  }

  static createChannelModal(stepName, label) {
    return new ModalBuilder()
      .setCustomId(`setup_modal_${stepName}`)
      .setTitle(`Configurar ${label}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('channel_id')
            .setLabel('ID del Canal')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('123456789012345678')
            .setRequired(true)
            .setMaxLength(20)
        )
      );
  }
}

