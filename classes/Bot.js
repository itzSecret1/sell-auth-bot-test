import { Collection, Events, REST, Routes, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { readdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { join, dirname } from 'path';
import { checkUserIdWhitelist } from '../utils/checkUserIdWhitelist.js';
import { config } from '../utils/config.js';
import { NotWhitelistedException } from '../utils/NotWhitelistedException.js';
import { startAutoSync } from '../utils/autoSync.js';
import { sessionManager } from '../utils/SessionRecoveryManager.js';
import { connectionManager } from '../utils/ConnectionManager.js';
import { createStatusReporter } from '../utils/StatusReporter.js';
import { createWeeklyReporter } from '../utils/WeeklyReporter.js';
import { createDailyBackupReporter } from '../utils/DailyBackupReporter.js';
import { createAutoModerator } from '../utils/AutoModerator.js';
import { createAutoSyncScheduler } from '../utils/AutoSyncScheduler.js';
import { createPredictiveAlerts } from '../utils/PredictiveAlerts.js';
import { TicketManager } from '../utils/TicketManager.js';
import { GuildConfig } from '../utils/GuildConfig.js';
import { CommandSpamDetector } from '../utils/CommandSpamDetector.js';
import { SetupWizard } from '../utils/SetupWizard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class Bot {
  constructor(client, api) {
    this.client = client;
    this.api = api;

    this.prefix = '/';
    this.commands = new Collection();
    this.slashCommands = [];
    this.slashCommandsMap = new Collection();
    this.cooldowns = new Collection();
    this.queues = new Collection();
    this.isRegisteringCommands = false;

    this.statusReporter = createStatusReporter(client);
    sessionManager.statusReporter = this.statusReporter;

    this.weeklyReporter = createWeeklyReporter(client, api);
    this.dailyBackupReporter = createDailyBackupReporter(client);
    this.autoModerator = createAutoModerator(client);
    this.autoSyncScheduler = createAutoSyncScheduler(client, api);
    this.predictiveAlerts = createPredictiveAlerts(client);

    this.loginWithRetry();

    this.client.on('ready', () => {
      console.log(`${this.client.user.username} ready!`);
      if (!this.isRegisteringCommands) {
        this.registerSlashCommands();
      }
      this.initializeAutomatedSystems();
      
      // Iniciar verificador de cierre automático de tickets para todos los servidores
      this.client.guilds.cache.forEach(guild => {
        TicketManager.startAutoCloseChecker(guild);
      });
      
      console.log(`✅ Bot listo en ${this.client.guilds.cache.size} servidor(es)`);
    });

    // Registrar comandos cuando el bot se añade a un nuevo servidor
    this.client.on('guildCreate', async (guild) => {
      console.log(`[BOT] ✅ Bot añadido a nuevo servidor: ${guild.name} (${guild.id})`);
      console.log(`[BOT] 💡 Usa /setup para configurar el bot en este servidor`);
      
      // Registrar comandos en el nuevo servidor
      if (!this.isRegisteringCommands) {
        setTimeout(() => {
          this.registerSlashCommands();
        }, 2000);
      }
    });

    this.client.on('warn', (info) => console.log(info));
    this.client.on('error', (error) => {
      console.error('[BOT ERROR]', error.message);
    });

    this.onInteractionCreate();
    this.onMessageCreate();

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[BOT] Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('[BOT] Uncaught Exception:', error);
    });
  }

  async loginWithRetry() {
    if (!connectionManager.canAttemptConnection()) {
      const waitTime = connectionManager.getSafeWaitTime();
      const waitSeconds = Math.ceil(waitTime / 1000);
      console.log(`[BOT LOGIN] ⏳ Safe wait: ${waitSeconds}s before retry\n`);
      setTimeout(() => this.loginWithRetry(), waitTime);
      return;
    }

    try {
      connectionManager.recordAttempt();
      console.log(`[BOT LOGIN] Connecting to Discord... (Safe attempt)`);
      await this.client.login(config.BOT_TOKEN);
      connectionManager.markSuccess();
      sessionManager.markSuccessfulLogin();
    } catch (error) {
      if (error.message && error.message.includes('Not enough sessions')) {
        connectionManager.markFailure(true);
        await sessionManager.handleSessionLimit(error, () => this.loginWithRetry());
      } else {
        connectionManager.markFailure(false);
        console.error(`\n❌ [BOT LOGIN ERROR] ${error.message}`);
        const waitTime = connectionManager.getSafeWaitTime(30 * 1000);
        const waitSeconds = Math.ceil(waitTime / 1000);
        console.log(`[BOT LOGIN] Retrying in ${waitSeconds} seconds...\n`);
        setTimeout(() => this.loginWithRetry(), waitTime);
      }
    }
  }

  async registerSlashCommands() {
    if (this.isRegisteringCommands) return;
    this.isRegisteringCommands = true;

    try {
      this.slashCommands = [];
      this.slashCommandsMap.clear();

      const commandFiles = readdirSync(join(__dirname, '..', 'commands'))
        .filter((file) => file.endsWith('.js') && !file.endsWith('.map'));

      for (const file of commandFiles) {
        try {
          const commandPath = pathToFileURL(join(__dirname, '..', 'commands', `${file}`)).href;
          const command = await import(commandPath);
          if (command.default && command.default.data) {
            const cmdName = command.default.data.name;
            if (!this.slashCommandsMap.has(cmdName)) {
              this.slashCommands.push(command.default.data.toJSON());
              this.slashCommandsMap.set(cmdName, command.default);
            }
          }
        } catch (err) {
          console.error(`[BOT] Error loading ${file}:`, err.message);
        }
      }

      console.log(`[BOT] ✅ Loaded ${this.slashCommands.length} commands into memory`);
      setTimeout(() => this.registerIndividualCommands(), 2000);
      
    } catch (error) {
      console.error('[BOT] Error loading commands:', error.message);
      this.isRegisteringCommands = false;
    }
  }

  async registerIndividualCommands() {
    try {
      const rest = new REST({ version: '9' }).setToken(config.BOT_TOKEN);
      
      // Registrar comandos en todos los servidores
      const guilds = this.client.guilds.cache;
      
      if (guilds.size === 0) {
        console.log('[BOT] ⚠️  No hay servidores disponibles. Los comandos se registrarán cuando el bot se añada a un servidor.');
        this.isRegisteringCommands = false;
        return;
      }

      console.log(`[BOT] 📋 Registrando comandos en ${guilds.size} servidor(es)...`);

      for (const [guildId, guild] of guilds) {
        try {
          console.log(`[BOT] 📋 Registrando comandos en: ${guild.name} (${guildId})`);
          
          // Clear first
          try {
            const existing = await guild.commands.fetch();
            for (const cmd of existing.values()) {
              await guild.commands.delete(cmd.id).catch(() => {});
            }
          } catch (e) {}

          await new Promise(r => setTimeout(r, 1000));

          let success = 0;
          for (const cmd of this.slashCommands) {
            try {
              await guild.commands.create(cmd);
              success++;
              await new Promise(r => setTimeout(r, 300));
            } catch (err) {
              console.warn(`[BOT] ⚠️  Failed to create ${cmd.name} in ${guild.name}: ${err.message}`);
            }
          }
          
          console.log(`[BOT] ✅ ${guild.name}: ${success}/${this.slashCommands.length} comandos registrados`);
        } catch (error) {
          console.error(`[BOT] Error registrando comandos en ${guild.name}:`, error.message);
        }
      }
      
      console.log(`[BOT] ✅ REGISTRATION COMPLETE en todos los servidores`);
    } catch (error) {
      console.error(`[BOT] Registration error:`, error.message);
    } finally {
      this.isRegisteringCommands = false;
    }
  }

  async initializeAutomatedSystems() {
    try {
      await this.statusReporter.sendDailyStatusUpdate();
      this.scheduleSystemUpdates();
      this.weeklyReporter.scheduleWeeklyReports();
      this.dailyBackupReporter.scheduleDailyBackups();
      this.autoSyncScheduler.startHourlySync();
      this.autoModerator.setup();
      this.predictiveAlerts.scheduleAlertChecks();
      console.log('[BOT] ✅ All automated systems initialized');
    } catch (error) {
      console.error('[BOT] Error initializing systems:', error.message);
    }
  }

  scheduleSystemUpdates() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(12, 0, 0, 0);
    const timeUntilNext = tomorrow - now;
    console.log(`[BOT] ✅ System scheduled: Daily updates at 12:00 UTC, Weekly reports at 09:00 UTC Mondays, Daily backups at 03:00 UTC`);
    setTimeout(
      () => {
        this.statusReporter.sendDailyStatusUpdate();
        setInterval(() => this.statusReporter.sendDailyStatusUpdate(), 24 * 60 * 60 * 1000);
      },
      timeUntilNext
    );
  }

  async onInteractionCreate() {
    this.client.on(Events.InteractionCreate, async (interaction) => {
      // Manejar autocomplete
      if (interaction.isAutocomplete()) {
        const command = this.slashCommandsMap.get(interaction.commandName);
        if (!command || !command.autocomplete) return;
        try {
          await command.autocomplete(interaction, this.api);
        } catch (error) {
          console.error('Autocomplete error:', error);
        }
        return;
      }

      // Manejar interacciones de botones
      if (interaction.isButton()) {
        try {
          // Verificar si es un botón de setup
          if (interaction.customId.startsWith('setup_')) {
            await this.handleSetupButton(interaction);
            return;
          }
          // Manejar botones de tickets
          await this.handleTicketButton(interaction);
        } catch (error) {
          console.error('[BUTTON] Error:', error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: `❌ Error: ${error.message}`,
              ephemeral: true
            }).catch(() => {});
          }
        }
        return;
      }

      // Manejar modales
      if (interaction.isModalSubmit()) {
        try {
          // Verificar si es un modal de setup
          if (interaction.customId.startsWith('setup_modal_')) {
            await this.handleSetupModal(interaction);
            return;
          }
          // Manejar modales de tickets
          await this.handleTicketModal(interaction);
        } catch (error) {
          console.error('[MODAL] Error:', error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: `❌ Error: ${error.message}`,
              ephemeral: true
            }).catch(() => {});
          }
        }
        return;
      }

      if (!interaction.isChatInputCommand()) return;
      const command = this.slashCommandsMap.get(interaction.commandName);
      if (!command) return;

      // Verificar spam de comandos ANTES de procesar
      const spamCheck = CommandSpamDetector.checkSpam(interaction.user.id, interaction.commandName);
      
      if (spamCheck.isSpam) {
        // Usuario está haciendo spam, banearlo
        try {
          const member = interaction.member;
          const reason = 'Repetido - Is he trying to steal? So you say that he has been banned for trying to steal.';
          
          // Intentar banear
          await member.ban({ reason: reason, deleteMessageDays: 0 });
          
          // Enviar mensaje al canal de spam
          const spamChannelId = CommandSpamDetector.getSpamChannelId(interaction.guild.id);
          const spamChannel = spamChannelId ? await interaction.guild.channels.fetch(spamChannelId).catch(() => null) : null;
          
          if (spamChannel) {
            await spamChannel.send({
              content: `🚫 **Usuario Baneado**\n\n` +
                `**Usuario:** ${interaction.user} (${interaction.user.tag})\n` +
                `**ID:** ${interaction.user.id}\n` +
                `**Razón:** ${reason}\n` +
                `**Comando:** \`/${interaction.commandName}\`\n` +
                `**Uso repetido:** ${spamCheck.count} veces en menos de 7 segundos`
            });
          }
          
          console.log(`[SPAM-DETECTOR] 🚫 Usuario ${interaction.user.tag} (${interaction.user.id}) baneado por spam de comandos`);
          
          // Limpiar historial del usuario
          CommandSpamDetector.clearUserHistory(interaction.user.id);
          
        } catch (banError) {
          console.error('[SPAM-DETECTOR] Error al banear usuario:', banError);
          
          // Si no se puede banear, al menos notificar
          try {
            const spamChannelId = CommandSpamDetector.getSpamChannelId();
            const spamChannel = await interaction.guild.channels.fetch(spamChannelId).catch(() => null);
            
            if (spamChannel) {
              await spamChannel.send({
                content: `⚠️ **Intento de Spam Detectado**\n\n` +
                  `**Usuario:** ${interaction.user} (${interaction.user.tag})\n` +
                  `**ID:** ${interaction.user.id}\n` +
                  `**Razón:** Repetido - Is he trying to steal?\n` +
                  `**Comando:** \`/${interaction.commandName}\`\n` +
                  `**Uso repetido:** ${spamCheck.count} veces en menos de 7 segundos\n` +
                  `**Error al banear:** ${banError.message}`
              });
            }
          } catch (notifyError) {
            console.error('[SPAM-DETECTOR] Error al notificar:', notifyError);
          }
        }
        
        // No procesar el comando
        return;
      }

      if (!this.cooldowns.has(interaction.commandName)) {
        this.cooldowns.set(interaction.commandName, new Collection());
      }

      const now = Date.now();
      const timestamps = this.cooldowns.get(interaction.commandName);
      const cooldownAmount = (command.cooldown || 1) * 1000;
      const timestamp = timestamps.get(interaction.user.id);

      if (timestamp) {
        const expirationTime = timestamp + cooldownAmount;
        if (now < expirationTime) {
          const timeLeft = (expirationTime - now) / 1000;
          return interaction.reply({
            content: `You need to wait ${timeLeft.toFixed(1)} more second(s) before reusing the \`${interaction.commandName}\` command.`,
            ephemeral: true
          });
        }
      }

      timestamps.set(interaction.user.id, now);
      setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

      try {
        if (await checkUserIdWhitelist(command, interaction, config)) {
          await command.execute(interaction, this.api);
        } else {
          throw new NotWhitelistedException();
        }
      } catch (error) {
        console.error(error);
        if (error.message.includes('permission')) {
          interaction.reply({ content: error.toString(), ephemeral: true }).catch(console.error);
        } else {
          interaction.reply({ content: 'An error occurred while executing the command.', ephemeral: true }).catch(console.error);
        }
      }
    });
  }

  async handleTicketButton(interaction) {
    const customId = interaction.customId;

    // Crear ticket desde panel
    if (customId.startsWith('ticket_')) {
      const category = customId.replace('ticket_', '');
      if (['replaces', 'faq', 'purchase', 'partner', 'partner_manager'].includes(category)) {
        await interaction.deferReply({ ephemeral: true });
        
        const guild = interaction.guild;
        const user = interaction.user;
        
        const result = await TicketManager.createTicket(guild, user, category);
        
        await interaction.editReply({
          content: `✅ Ticket ${result.ticketId} creado en ${result.channel}`
        });
        return;
      }
    }

    // Reclamar ticket
    if (customId.startsWith('ticket_claim_')) {
      // Verificar que el usuario tenga rol de staff o admin
      const guildConfig = GuildConfig.getConfig(interaction.guild.id);
      const staffRoleId = guildConfig?.staffRoleId || config.BOT_STAFF_ROLE_ID;
      const adminRoleId = guildConfig?.adminRoleId || config.BOT_ADMIN_ROLE_ID;
      
      const hasStaffRole = staffRoleId && interaction.member.roles.cache.has(staffRoleId);
      const hasAdminRole = adminRoleId && interaction.member.roles.cache.has(adminRoleId);
      
      if (!hasStaffRole && !hasAdminRole) {
        await interaction.reply({
          content: '❌ Solo el staff puede reclamar tickets',
          ephemeral: true
        });
        return;
      }

      await interaction.deferUpdate();
      const ticketId = customId.replace('ticket_claim_', '');
      const result = await TicketManager.claimTicket(interaction.guild, ticketId, interaction.member);
      
      if (!result.success) {
        await interaction.followUp({
          content: result.message,
          ephemeral: true
        });
      }
      return;
    }

    // Cerrar ticket
    if (customId.startsWith('ticket_close_')) {
      // Verificar que el usuario tenga rol de staff o admin
      const guildConfig = GuildConfig.getConfig(interaction.guild.id);
      const staffRoleId = guildConfig?.staffRoleId || config.BOT_STAFF_ROLE_ID;
      const adminRoleId = guildConfig?.adminRoleId || config.BOT_ADMIN_ROLE_ID;
      
      const hasStaffRole = staffRoleId && interaction.member.roles.cache.has(staffRoleId);
      const hasAdminRole = adminRoleId && interaction.member.roles.cache.has(adminRoleId);
      
      if (!hasStaffRole && !hasAdminRole) {
        await interaction.reply({
          content: '❌ Solo el staff puede cerrar tickets',
          ephemeral: true
        });
        return;
      }

      const ticketId = customId.replace('ticket_close_', '');
      const ticket = TicketManager.getTicket(ticketId);
      
      if (!ticket) {
        await interaction.reply({
          content: '❌ Ticket no encontrado',
          ephemeral: true
        });
        return;
      }

      // Verificar si necesita razón
      const member = interaction.member;
      const needsReason = hasStaffRole; // Solo staff necesita razón, admin no

      if (needsReason) {
        // Mostrar modal para razón
        const modal = new ModalBuilder()
          .setCustomId(`ticket_close_modal_${ticketId}`)
          .setTitle('Cerrar Ticket');

        const reasonInput = new TextInputBuilder()
          .setCustomId('close_reason')
          .setLabel('Razón del cierre (obligatorio)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Explica por qué se cierra este ticket...')
          .setRequired(true)
          .setMaxLength(500);

        const actionRow = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
        return;
      }

      // Si no necesita razón, iniciar proceso de cierre
      await interaction.deferUpdate();
      await TicketManager.initiateClose(interaction.guild, ticketId, interaction.member);
      return;
    }

    // Ratings de servicio
    if (customId.startsWith('rating_service_')) {
      const parts = customId.split('_');
      const rating = parseInt(parts[2]);
      const ticketId = parts.slice(3).join('_');
      
      try {
        await interaction.deferUpdate();
        await TicketManager.processServiceRating(interaction.guild, ticketId, rating, interaction.user.id);
      } catch (error) {
        await interaction.reply({
          content: `❌ ${error.message}`,
          ephemeral: true
        }).catch(() => {});
      }
      return;
    }

    // Ratings de staff
    if (customId.startsWith('rating_staff_')) {
      const parts = customId.split('_');
      const rating = parseInt(parts[2]);
      const ticketId = parts.slice(3).join('_');
      
      try {
        await interaction.deferUpdate();
        await TicketManager.processStaffRating(interaction.guild, ticketId, rating, interaction.user.id);
      } catch (error) {
        await interaction.reply({
          content: `❌ ${error.message}`,
          ephemeral: true
        }).catch(() => {});
      }
      return;
    }
  }

  async handleTicketModal(interaction) {
    if (interaction.customId.startsWith('ticket_close_modal_')) {
      const ticketId = interaction.customId.replace('ticket_close_modal_', '');
      const closeReason = interaction.fields.getTextInputValue('close_reason');

      if (!closeReason || closeReason.trim().length === 0) {
        await interaction.reply({
          content: '❌ La razón es obligatoria',
          ephemeral: true
        });
        return;
      }

      await interaction.deferUpdate();
      
      // Mostrar ratings (la razón se guarda en showRatings)
      await TicketManager.showRatings(interaction.guild, ticketId, interaction.member, closeReason);
    }
  }

  async handleSetupButton(interaction) {
    const { SetupWizard } = await import('../utils/SetupWizard.js');
    const AUTHORIZED_USER_IDS = ['1190738779015757914', '1407024330633642005'];

    if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
      await interaction.reply({
        content: '❌ No tienes permiso para usar este comando.',
        ephemeral: true
      });
      return;
    }

    const customId = interaction.customId;

    if (customId === 'setup_start_config') {
      const session = SetupWizard.createSession(interaction.user.id, interaction.guild.id);
      const stepData = SetupWizard.getStepEmbed(0, session);
      
      await interaction.update({
        embeds: [stepData.embed],
        components: [stepData.buttons]
      });
      return;
    }

    if (customId === 'setup_cancel') {
      SetupWizard.deleteSession(interaction.user.id);
      await interaction.update({
        content: '❌ Configuración cancelada.',
        embeds: [],
        components: []
      });
      return;
    }

    const session = SetupWizard.getSession(interaction.user.id);
    if (!session) {
      await interaction.reply({
        content: '❌ No hay una sesión de configuración activa. Usa `/setup start` para comenzar.',
        ephemeral: true
      });
      return;
    }

    if (customId === 'setup_next') {
      if (session.step < 7) {
        session.step++;
        const stepData = SetupWizard.getStepEmbed(session.step, session);
        await interaction.update({
          embeds: [stepData.embed],
          components: [stepData.buttons]
        });
      }
      return;
    }

    if (customId === 'setup_back') {
      if (session.step > 0) {
        session.step--;
        const stepData = SetupWizard.getStepEmbed(session.step, session);
        await interaction.update({
          embeds: [stepData.embed],
          components: [stepData.buttons]
        });
      }
      return;
    }

    if (customId === 'setup_skip') {
      session.step++;
      if (session.step < 8) {
        const stepData = SetupWizard.getStepEmbed(session.step, session);
        await interaction.update({
          embeds: [stepData.embed],
          components: [stepData.buttons]
        });
      } else {
        await this.finishSetup(interaction, session);
      }
      return;
    }

    if (customId === 'setup_finish') {
      await this.finishSetup(interaction, session);
      return;
    }

    // Botones para seleccionar rol/canal
    if (customId.startsWith('setup_')) {
      const stepName = customId.replace('setup_', '');
      let modal;
      
      if (stepName.includes('role')) {
        const label = stepName === 'admin_role' ? 'Rol de Administrador' :
                     stepName === 'staff_role' ? 'Rol de Trial Staff' :
                     stepName === 'customer_role' ? 'Rol de Cliente' :
                     'Rol de Trial Admin';
        modal = SetupWizard.createRoleModal(stepName, label);
      } else {
        const label = stepName === 'log_channel' ? 'Canal de Logs' :
                     stepName === 'transcript_channel' ? 'Canal de Transcripts' :
                     stepName === 'rating_channel' ? 'Canal de Ratings' :
                     'Canal de Spam/Bans';
        modal = SetupWizard.createChannelModal(stepName, label);
      }
      
      await interaction.showModal(modal);
      return;
    }
  }

  async handleSetupModal(interaction) {
    const { SetupWizard } = await import('../utils/SetupWizard.js');
    const session = SetupWizard.getSession(interaction.user.id);
    
    if (!session) {
      await interaction.reply({
        content: '❌ No hay una sesión de configuración activa.',
        ephemeral: true
      });
      return;
    }

    const stepName = interaction.customId.replace('setup_modal_', '');
    const value = stepName.includes('role') 
      ? interaction.fields.getTextInputValue('role_id')
      : interaction.fields.getTextInputValue('channel_id');

    if (!/^\d+$/.test(value)) {
      await interaction.reply({
        content: '❌ El ID debe ser un número válido.',
        ephemeral: true
      });
      return;
    }

    try {
      if (stepName.includes('role')) {
        const role = await interaction.guild.roles.fetch(value);
        if (!role) {
          await interaction.reply({
            content: '❌ El rol no existe en este servidor.',
            ephemeral: true
          });
          return;
        }
        const configKey = stepName === 'admin_role' ? 'adminRoleId' :
                         stepName === 'staff_role' ? 'staffRoleId' :
                         stepName === 'customer_role' ? 'customerRoleId' :
                         'trialAdminRoleId';
        session.config[configKey] = value;
      } else {
        const channel = await interaction.guild.channels.fetch(value);
        if (!channel) {
          await interaction.reply({
            content: '❌ El canal no existe en este servidor.',
            ephemeral: true
          });
          return;
        }
        const configKey = stepName === 'log_channel' ? 'logChannelId' :
                         stepName === 'transcript_channel' ? 'transcriptChannelId' :
                         stepName === 'rating_channel' ? 'ratingChannelId' :
                         'spamChannelId';
        session.config[configKey] = value;
      }
    } catch (error) {
      await interaction.reply({
        content: '❌ Error al verificar el ID. Asegúrate de que el rol/canal existe y el bot tiene acceso.',
        ephemeral: true
      });
      return;
    }

    const stepData = SetupWizard.getStepEmbed(session.step, session);
    await interaction.reply({
      content: '✅ Configuración guardada!',
      embeds: [stepData.embed],
      components: [stepData.buttons],
      ephemeral: true
    });
  }

  async finishSetup(interaction, session) {
    const { SetupWizard } = await import('../utils/SetupWizard.js');
    const { GuildConfig } = await import('../utils/GuildConfig.js');
    const { EmbedBuilder } = await import('discord.js');

    if (!session.config.adminRoleId || !session.config.staffRoleId) {
      await interaction.update({
        content: '❌ Debes configurar al menos el Rol de Administrador y el Rol de Trial Staff.',
        embeds: [],
        components: []
      });
      return;
    }

    const guildConfig = GuildConfig.setConfig(session.guildId, {
      guildId: session.guildId,
      guildName: interaction.guild.name,
      adminRoleId: session.config.adminRoleId,
      staffRoleId: session.config.staffRoleId,
      customerRoleId: session.config.customerRoleId,
      logChannelId: session.config.logChannelId,
      transcriptChannelId: session.config.transcriptChannelId,
      ratingChannelId: session.config.ratingChannelId,
      spamChannelId: session.config.spamChannelId,
      trialAdminRoleId: session.config.trialAdminRoleId,
      configuredBy: interaction.user.id,
      configuredByUsername: interaction.user.username
    });

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('✅ Bot Configurado Exitosamente')
      .setDescription(`El bot ha sido configurado para el servidor **${interaction.guild.name}**`)
      .addFields(
        {
          name: '👑 Rol de Admin',
          value: `<@&${session.config.adminRoleId}>`,
          inline: true
        },
        {
          name: '👥 Rol de Trial Staff',
          value: `<@&${session.config.staffRoleId}>`,
          inline: true
        },
        {
          name: '🛒 Rol de Cliente',
          value: session.config.customerRoleId ? `<@&${session.config.customerRoleId}>` : 'No configurado',
          inline: true
        },
        {
          name: '📝 Canal de Logs',
          value: session.config.logChannelId ? `<#${session.config.logChannelId}>` : 'No configurado',
          inline: true
        },
        {
          name: '📄 Canal de Transcripts',
          value: session.config.transcriptChannelId ? `<#${session.config.transcriptChannelId}>` : 'No configurado',
          inline: true
        },
        {
          name: '⭐ Canal de Ratings',
          value: session.config.ratingChannelId ? `<#${session.config.ratingChannelId}>` : 'No configurado',
          inline: true
        },
        {
          name: '🚫 Canal de Spam/Bans',
          value: session.config.spamChannelId ? `<#${session.config.spamChannelId}>` : 'No configurado',
          inline: true
        },
        {
          name: '🔧 Rol de Trial Admin',
          value: session.config.trialAdminRoleId ? `<@&${session.config.trialAdminRoleId}>` : 'No configurado',
          inline: true
        }
      )
      .setFooter({ text: `Configurado por ${interaction.user.username}` })
      .setTimestamp();

    await interaction.update({
      content: null,
      embeds: [embed],
      components: []
    });

    SetupWizard.deleteSession(interaction.user.id);

    console.log(`[SETUP] Bot configurado en servidor: ${interaction.guild.name} (${session.guildId})`);
  }

  onMessageCreate() {
    this.client.on('messageCreate', async (message) => {
      // Ignorar mensajes del bot
      if (message.author.bot) return;
      
      // Verificar que es un mensaje en un canal de ticket
      const { TicketManager } = await import('../utils/TicketManager.js');
      const ticket = TicketManager.getTicketByChannel(message.channel.id);
      
      if (!ticket) return;
      
      // Solo procesar tickets de tipo "replaces"
      if (ticket.category.toLowerCase() !== 'replaces') return;

      try {
        const content = message.content.toLowerCase();
        const hasImages = message.attachments.size > 0;
        
        // Detectar frases como "account doesn't work" o "acc don't work"
        const accountIssues = [
          'account doesn\'t work',
          'account don\'t work',
          'acc doesn\'t work',
          'acc don\'t work',
          'account not working',
          'acc not working',
          'account broken',
          'acc broken',
          'not working',
          'doesn\'t work',
          'don\'t work'
        ];
        
        const hasAccountIssue = accountIssues.some(phrase => content.includes(phrase));
        
        // Si detecta problema de cuenta, preguntar qué cuenta específicamente
        if (hasAccountIssue) {
          // Verificar si ya preguntamos antes (evitar spam)
          const lastMessages = await message.channel.messages.fetch({ limit: 5 });
          const alreadyAsked = lastMessages.some(msg => 
            msg.author.bot && 
            msg.content.includes('What account') || 
            msg.content.includes('Qué cuenta')
          );
          
          if (!alreadyAsked) {
            await message.channel.send({
              content: `❓ **What account?**\n\nPlease specify which account is not working.`
            });
          }
          return;
        }
        
        // Detectar invoice con formato específico (ej: 3bcf919f0e26c-0000008525997)
        const invoiceMatch = this.detectInvoice(content);
        
        // Detectar servicios y cantidades mencionados (Netflix x1, Hulu, etc.)
        const serviceInfo = this.detectServiceAndQuantity(content);
        
        // Si detecta invoice + servicio + cantidad, renombrar ticket
        if (invoiceMatch && serviceInfo.service && serviceInfo.quantity) {
          try {
            const ticketId = ticket.id;
            const serviceName = serviceInfo.service.toLowerCase();
            const quantity = serviceInfo.quantity;
            const newName = `replace-${serviceName}-x${quantity}-acc-${ticketId.toLowerCase()}-🔧`;
            
            await message.channel.setName(newName);
            
            console.log(`[TICKET] Ticket ${ticketId} renombrado a "${newName}" (Invoice: ${invoiceMatch}, Service: ${serviceName}, Qty: ${quantity})`);
            
            // Si hay foto, también procesar replace-message
            if (hasImages) {
              setTimeout(async () => {
                try {
                  const { default: replaceMessageCommand } = await import('../commands/replace-message.js');
                  
                  const fakeInteraction = {
                    options: {
                      getChannel: () => message.channel,
                      getString: () => null
                    },
                    guild: message.guild,
                    channel: message.channel,
                    user: message.client.user,
                    member: message.guild.members.me,
                    editReply: async (data) => {
                      await message.channel.send({
                        content: `✅ **Replacement Processed Automatically**\n\nInvoice: ${invoiceMatch}\nService: ${serviceName} x${quantity}\nProof: Attached\n\nThe staff will process your replacement shortly.`
                      });
                    },
                    deferReply: async () => {},
                    reply: async () => {}
                  };
                  
                  await replaceMessageCommand.execute(fakeInteraction, this.api);
                  
                  console.log(`[AUTO-REPLACE] Invoice ${invoiceMatch} detectado, replace-message ejecutado automáticamente`);
                } catch (error) {
                  console.error('[AUTO-REPLACE] Error:', error);
                }
              }, 1000);
            }
            
            return; // Salir después de procesar invoice + servicio
          } catch (renameError) {
            console.error('[TICKET] Error al renombrar ticket:', renameError);
          }
        }
        
        // Si el usuario especifica una cuenta (detectar respuestas como "this account", "my account", o menciona algo específico)
        const accountSpecified = this.detectAccountSpecification(content);
        if (accountSpecified && !ticket.accountSpecified) {
          // Renombrar ticket a "replace-✅-tkt-XXXX"
          try {
            const ticketId = ticket.id;
            const newName = `replace-✅-${ticketId.toLowerCase()}`;
            await message.channel.setName(newName);
            
            // Marcar que ya se especificó la cuenta
            ticket.accountSpecified = true;
            
            console.log(`[TICKET] Ticket ${ticketId} renombrado a "${newName}" después de especificar cuenta`);
          } catch (renameError) {
            console.error('[TICKET] Error al renombrar ticket:', renameError);
          }
        }
        
        // Si hay fotos pero no se detecta invoice, pedir invoice
        if (hasImages && !invoiceMatch) {
          const lastMessages = await message.channel.messages.fetch({ limit: 5 });
          const alreadyAsked = lastMessages.some(msg => 
            msg.author.bot && 
            msg.content.includes('Invoice Required')
          );
          
          if (!alreadyAsked) {
            await message.channel.send({
              content: `📋 **Invoice Required**\n\nPlease provide your invoice number along with the screenshot.`
            });
          }
          return;
        }
        
        // Si detecta invoice + foto pero sin servicio específico, ejecutar replace-message genérico
        if (invoiceMatch && hasImages && !serviceInfo.service) {
          setTimeout(async () => {
            try {
              const { default: replaceMessageCommand } = await import('../commands/replace-message.js');
              
              const fakeInteraction = {
                options: {
                  getChannel: () => message.channel,
                  getString: () => null
                },
                guild: message.guild,
                channel: message.channel,
                user: message.client.user,
                member: message.guild.members.me,
                editReply: async (data) => {
                  await message.channel.send({
                    content: `✅ **Replacement Processed Automatically**\n\nInvoice: ${invoiceMatch}\nProof: Attached\n\nThe staff will process your replacement shortly.`
                  });
                },
                deferReply: async () => {},
                reply: async () => {}
              };
              
              await replaceMessageCommand.execute(fakeInteraction, this.api);
              
              console.log(`[AUTO-REPLACE] Invoice ${invoiceMatch} detectado en ticket ${ticket.id}, replace-message ejecutado automáticamente`);
            } catch (error) {
              console.error('[AUTO-REPLACE] Error:', error);
            }
          }, 1000);
        }
        
      } catch (error) {
        console.error('[TICKET MESSAGE] Error procesando mensaje:', error);
      }
    });
  }

  detectAccountSpecification(text) {
    // Detectar si el usuario especificó una cuenta
    // Patrones como: "this account", "my account", "the account", o cualquier texto después de "account"
    const patterns = [
      /(?:this|my|the)\s+account/i,
      /account\s+(?:is|doesn't|don't|not)/i,
      /account\s+[\w\s]+/i
    ];
    
    return patterns.some(pattern => pattern.test(text));
  }

  detectInvoice(text) {
    // Detectar patrones comunes de invoice:
    // - Formato con guión: 3bcf919f0e26c-0000008525997
    // - INV-12345
    // - Invoice: ABC123
    // - #12345
    // - Combinaciones de letras y números (mínimo 5 caracteres)
    const patterns = [
      /\b([a-z0-9]{8,}-[0-9]{10,})\b/i, // Formato: abc123def-1234567890
      /(?:invoice|inv)[\s:]*([a-z0-9-]{5,})/i,
      /#([a-z0-9]{5,})/i,
      /\b([a-z]{2,}\d{3,}|\d{3,}[a-z]{2,})\b/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }
    
    return null;
  }

  detectServiceAndQuantity(text) {
    // Servicios comunes
    const services = ['netflix', 'hulu', 'disney', 'disney+', 'spotify', 'hbo', 'hbo max', 'paramount', 'prime', 'amazon prime', 'crunchyroll', 'youtube', 'youtube premium'];
    
    let detectedService = null;
    let quantity = 1; // Por defecto
    
    // Buscar servicios mencionados
    for (const service of services) {
      const serviceRegex = new RegExp(`\\b${service}\\b`, 'i');
      if (serviceRegex.test(text)) {
        detectedService = service.replace(/\s+/g, '').replace('+', 'plus'); // Normalizar nombre
        break;
      }
    }
    
    // Buscar cantidad (x1, x2, 1 acc, 2 acc, etc.)
    const quantityPatterns = [
      /x\s*(\d+)/i,           // x1, x2, x 1, etc.
      /(\d+)\s*acc/i,          // 1 acc, 2 acc, etc.
      /(\d+)\s*account/i,      // 1 account, 2 account, etc.
      /\b(\d+)\s*(?:netflix|hulu|disney|spotify|hbo|paramount|prime|crunchyroll|youtube)\b/i // 1 netflix, 2 hulu, etc.
    ];
    
    for (const pattern of quantityPatterns) {
      const match = text.match(pattern);
      if (match) {
        quantity = parseInt(match[1]) || 1;
        break;
      }
    }
    
    // Detectar "only" o "just" seguido de cantidad
    if (/only|just/i.test(text)) {
      const onlyMatch = text.match(/(?:only|just)\s+(\d+)/i);
      if (onlyMatch) {
        quantity = parseInt(onlyMatch[1]) || 1;
      }
    }
    
    return {
      service: detectedService,
      quantity: quantity
    };
  }
}
