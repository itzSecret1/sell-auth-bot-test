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
        trialAdminRoleId: null,
        vouchesChannelId: null,
        verificationChannelId: null,
        memberRoleId: null,
        verificationCategoryId: null
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
        title: '👑 Step 1: Admin Role',
        description: '**¿Qué es?**\nEl rol de administrador tiene acceso completo a todos los comandos del bot.\n\n**¿Quién debe tenerlo?**\nLos dueños y administradores principales del servidor.',
        fieldName: 'Admin Role',
        fieldValue: session.config.adminRoleId ? `<@&${session.config.adminRoleId}>` : 'Not configured',
        buttonId: 'setup_admin_role'
      },
      {
        title: '👥 Step 2: Trial Staff Role',
        description: '**What is it?**\nThe trial staff role has limited access to specific commands like `/replace`, `/unreplace`, `/claim`, etc.\n\n**Who should have it?**\nStaff members who help with support and product management.',
        fieldName: 'Staff Role',
        fieldValue: session.config.staffRoleId ? `<@&${session.config.staffRoleId}>` : 'Not configured',
        buttonId: 'setup_staff_role'
      },
      {
        title: '📝 Step 3: Log Channel',
        description: '**What is it?**\nThis channel records all important bot actions:\n• Commands executed by staff\n• Stock changes\n• Processed orders\n• Errors and important events\n\n**Is it mandatory?** No, but recommended to maintain an activity log.',
        fieldName: 'Log Channel',
        fieldValue: session.config.logChannelId ? `<#${session.config.logChannelId}>` : 'Not configured (Optional)',
        buttonId: 'setup_log_channel',
        optional: true
      },
      {
        title: '📄 Step 4: Transcript Channel',
        description: '**What is it?**\nThis channel receives complete transcripts of tickets when they are closed.\n\n**What does it contain?**\n• All ticket conversations\n• User information\n• Close reason\n• Ratings given\n\n**Is it mandatory?** No, but useful to maintain a support history.',
        fieldName: 'Transcript Channel',
        fieldValue: session.config.transcriptChannelId ? `<#${session.config.transcriptChannelId}>` : 'Not configured (Optional)',
        buttonId: 'setup_transcript_channel',
        optional: true
      },
      {
        title: '⭐ Step 5: Rating Channel',
        description: '**What is it?**\nThis channel receives ratings that users give after closing a ticket.\n\n**What does it contain?**\n• Service Rating\n• Staff Rating\n• Ticket information\n\n**Is it mandatory?** No, but useful to monitor customer satisfaction.',
        fieldName: 'Rating Channel',
        fieldValue: session.config.ratingChannelId ? `<#${session.config.ratingChannelId}>` : 'Not configured (Optional)',
        buttonId: 'setup_rating_channel',
        optional: true
      },
      {
        title: '🚫 Step 6: Spam/Ban Channel',
        description: '**What is it?**\nThis channel receives moderation notifications:\n• Users banned for command spam\n• Users banned manually with `/ban`\n• Suspicious activity detection\n\n**Is it mandatory?** No, but recommended to maintain a moderation log.',
        fieldName: 'Spam/Ban Channel',
        fieldValue: session.config.spamChannelId ? `<#${session.config.spamChannelId}>` : 'Not configured (Optional)',
        buttonId: 'setup_spam_channel',
        optional: true
      },
      {
        title: '🛒 Step 7: Customer Role',
        description: '**What is it?**\nThis role is automatically assigned to users when they claim an invoice with the `/claim` command.\n\n**Is it mandatory?** No, it is completely optional.',
        fieldName: 'Customer Role',
        fieldValue: session.config.customerRoleId ? `<@&${session.config.customerRoleId}>` : 'Not configured (Optional)',
        buttonId: 'setup_customer_role',
        optional: true
      },
      {
        title: '🔧 Step 8: Trial Admin Role',
        description: '**What is it?**\nThis role has limited access only to the `/sync-variants` command.\n\n**What is it for?**\nFor users who need to sync product variants but should not have full access to all commands.\n\n**Is it mandatory?** No, it is completely optional.',
        fieldName: 'Trial Admin Role',
        fieldValue: session.config.trialAdminRoleId ? `<@&${session.config.trialAdminRoleId}>` : 'Not configured (Optional)',
        buttonId: 'setup_trial_admin_role',
        optional: true
      },
      {
        title: '🤖 Step 9: Bot Status Channel',
        description: '**What is it?**\nThis channel receives notifications about the bot status:\n• When the bot connects (online)\n• When the bot disconnects (offline)\n• Bot operational status\n\n**Is it mandatory?** No, but useful to monitor bot status.',
        fieldName: 'Bot Status Channel',
        fieldValue: session.config.botStatusChannelId ? `<#${session.config.botStatusChannelId}>` : 'Not configured (Optional)',
        buttonId: 'setup_bot_status_channel',
        optional: true
      },
      {
        title: '🛡️ Step 10: Automod Channel',
        description: '**What is it?**\nThis channel receives automatic moderation notifications:\n• Discord links detected and deleted\n• Messages deleted by automod\n• Automatic bot actions\n\n**Is it mandatory?** No, but recommended to maintain an automatic moderation log.',
        fieldName: 'Automod Channel',
        fieldValue: session.config.automodChannelId ? `<#${session.config.automodChannelId}>` : 'Not configured (Optional)',
        buttonId: 'setup_automod_channel',
        optional: true
      },
      {
        title: '💾 Step 11: Backup Channel',
        description: '**What is it?**\nThis channel receives notifications every time an automatic server backup is performed.\n\n**What does it contain?**\n• Backup completion confirmation\n• Backup date and time\n• Information about what was backed up\n\n**Is it mandatory?** No, but useful to confirm that backups are being performed correctly.',
        fieldName: 'Backup Channel',
        fieldValue: session.config.backupChannelId ? `<#${session.config.backupChannelId}>` : 'Not configured (Optional)',
        buttonId: 'setup_backup_channel',
        optional: true
      },
      {
        title: '📊 Step 12: Weekly Reports Channel',
        description: '**What is it?**\nThis channel receives weekly bot reports with statistics and metrics.\n\n**What does it contain?**\n• Transaction summary\n• Bot status\n• Usage statistics\n• Tips and recommendations\n\n**Is it mandatory?** No, but useful to monitor bot performance.',
        fieldName: 'Weekly Reports Channel',
        fieldValue: session.config.weeklyReportsChannelId ? `<#${session.config.weeklyReportsChannelId}>` : 'Not configured (Optional)',
        buttonId: 'setup_weekly_reports_channel',
        optional: true
      },
      {
        title: '✅ Step 13: Accept Channel',
        description: '**What is it?**\nThis channel shows commands that require approval before execution:\n• Staff repeating commands (spam detection)\n• Replace of 5+ items that needs confirmation\n• Suspicious commands\n\n**Is it mandatory?** No, but recommended for security.',
        fieldName: 'Accept Channel',
        fieldValue: session.config.acceptChannelId ? `<#${session.config.acceptChannelId}>` : 'Not configured (Optional)',
        buttonId: 'setup_accept_channel',
        optional: true
      },
      {
        title: '⭐ Step 14: Staff Rating Support Channel',
        description: '**What is it?**\nThis private channel receives ALL staff ratings (good and bad) from ticket evaluations.\n\n**What does it contain?**\n• All staff ratings from closed tickets\n• User who evaluated\n• Staff member evaluated\n• Category and date\n• Rating given\n\n**Is it mandatory?** No, but recommended to monitor all staff feedback.',
        fieldName: 'Staff Rating Support Channel',
        fieldValue: session.config.staffRatingSupportChannelId ? `<#${session.config.staffRatingSupportChannelId}>` : 'Not configured (Optional)',
        buttonId: 'setup_staff_rating_support_channel',
        optional: true
      },
      {
        title: '🌟 Step 15: Staff Feedbacks Channel',
        description: '**What is it?**\nThis channel receives only POSITIVE staff ratings (4+ stars) from ticket evaluations.\n\n**What does it contain?**\n• Staff ratings of 4 or 5 stars only\n• User who evaluated\n• Staff member evaluated\n• Category and date\n• Rating given\n\n**Is it mandatory?** No, but useful to showcase positive feedback.',
        fieldName: 'Staff Feedbacks Channel',
        fieldValue: session.config.staffFeedbacksChannelId ? `<#${session.config.staffFeedbacksChannelId}>` : 'Not configured (Optional)',
        buttonId: 'setup_staff_feedbacks_channel',
        optional: true
      },
      {
        title: '💬 Step 16: Vouches/Feedbacks Channel',
        description: '**What is it?**\nThis channel is where customers can leave vouches and feedback about your service using the `/vouch` command.\n\n**What does it contain?**\n• Customer vouches and reviews\n• Service ratings\n• Customer testimonials\n• Proof screenshots\n\n**Is it mandatory?** No, but highly recommended to build trust and showcase customer satisfaction.',
        fieldName: 'Vouches/Feedbacks Channel',
        fieldValue: session.config.vouchesChannelId ? `<#${session.config.vouchesChannelId}>` : 'Not configured (Optional)',
        buttonId: 'setup_vouches_channel',
        optional: true
      },
      {
        title: '✅ Step 17: Verification Channel',
        description: '**What is it?**\nThis channel displays the verification embed that users must authorize to gain access to the server.\n\n**What does it contain?**\n• Verification embed with server name and logo\n• "Verify" button that opens Discord authorization\n• After authorization, users receive the member role\n\n**Is it mandatory?** No, but recommended for server security.',
        fieldName: 'Verification Channel',
        fieldValue: session.config.verificationChannelId ? `<#${session.config.verificationChannelId}>` : 'Not configured (Optional)',
        buttonId: 'setup_verification_channel',
        optional: true
      },
      {
        title: '👥 Step 18: Member Role (for verification)',
        description: '**What is it?**\nThis role is automatically assigned to users after they complete the verification process.\n\n**What is it for?**\nTo grant access to the server after users authorize the bot through the verification system.\n\n**Is it mandatory?** Only if you configure the verification channel.',
        fieldName: 'Member Role',
        fieldValue: session.config.memberRoleId ? `<@&${session.config.memberRoleId}>` : 'Not configured (Optional)',
        buttonId: 'setup_member_role',
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
      .setFooter({ text: `Step ${step + 1} of ${steps.length} • Use the buttons to configure` })
      .setTimestamp();

    const buttons = new ActionRowBuilder();
    
    if (currentStep.buttonId.includes('role')) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(currentStep.buttonId)
          .setLabel('Select Role')
          .setStyle(ButtonStyle.Primary)
      );
    } else {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(currentStep.buttonId)
          .setLabel('Select Channel')
          .setStyle(ButtonStyle.Primary)
      );
    }

    if (currentStep.optional) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId('setup_skip')
          .setLabel('⏭️ Skip')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    if (step > 0) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId('setup_back')
          .setLabel('⬅️ Back')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    if (step < steps.length - 1) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId('setup_next')
          .setLabel('Next ➡️')
          .setStyle(ButtonStyle.Success)
      );
    } else {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId('setup_finish')
          .setLabel('✅ Finish Configuration')
          .setStyle(ButtonStyle.Success)
      );
    }

    return { embed, buttons };
  }

  static createRoleModal(stepName, label) {
    return new ModalBuilder()
      .setCustomId(`setup_modal_${stepName}`)
      .setTitle(`Configure ${label}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('role_id')
            .setLabel('Role ID')
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
      .setTitle(`Configure ${label}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('channel_id')
            .setLabel('Channel ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('123456789012345678')
            .setRequired(true)
            .setMaxLength(20)
        )
      );
  }
}

