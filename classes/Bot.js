import { Collection, Events, REST, Routes, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } from 'discord.js';
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
    this.commandRefreshInterval = null;

    this.statusReporter = createStatusReporter(client);
    sessionManager.statusReporter = this.statusReporter;

    this.weeklyReporter = createWeeklyReporter(client, api);
    this.dailyBackupReporter = createDailyBackupReporter(client);
    this.autoModerator = createAutoModerator(client);
    this.autoSyncScheduler = createAutoSyncScheduler(client, api);
    this.predictiveAlerts = createPredictiveAlerts(client);

    this.loginWithRetry();

    this.client.on('clientReady', () => {
      console.log(`${this.client.user.username} ready!`);
      console.log(`[BOT] Bot ID: ${this.client.user.id}`);
      console.log(`[BOT] Bot Tag: ${this.client.user.tag}`);
      console.log(`[BOT] Bot Username: ${this.client.user.username}`);
      console.log(`[BOT] Bot Discriminator: ${this.client.user.discriminator}`);
      
      if (!this.isRegisteringCommands) {
        this.registerSlashCommands();
      }
      this.initializeAutomatedSystems();
      
      // Iniciar verificador de cierre automático de tickets para todos los servidores
      this.client.guilds.cache.forEach(guild => {
        TicketManager.startAutoCloseChecker(guild);
      });
      
      // Programar refresh automático de comandos cada 4 horas
      if (!this.commandRefreshInterval) {
        this.commandRefreshInterval = setInterval(() => {
          console.log('[BOT] 🔄 Auto-refreshing commands (scheduled refresh every 4 hours)...');
          if (!this.isRegisteringCommands) {
            this.registerSlashCommands();
          }
        }, 4 * 60 * 60 * 1000); // 4 horas
        console.log('[BOT] ✅ Auto-refresh scheduled: Commands will refresh every 4 hours');
      }
      
      console.log(`✅ Bot ready in ${this.client.guilds.cache.size} server(s)`);
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
              const cmdData = command.default.data.toJSON();
              this.slashCommands.push(cmdData);
              this.slashCommandsMap.set(cmdName, command.default);
              // Log para verificar que vouches-restore se carga
              if (cmdName === 'vouches-restore') {
                console.log(`[BOT] ✅ Loaded command: ${cmdName} (from ${file})`);
              }
            } else {
              console.warn(`[BOT] ⚠️  Duplicate command name: ${cmdName} (from ${file})`);
            }
          } else {
            console.warn(`[BOT] ⚠️  Invalid command structure in ${file}: missing data property`);
          }
        } catch (err) {
          console.error(`[BOT] ❌ Error loading ${file}:`, err.message);
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
    const startTime = Date.now();
    try {
      const rest = new REST({ version: '9' }).setToken(config.BOT_TOKEN);
      
      // Registrar comandos en todos los servidores
      const guilds = this.client.guilds.cache;
      
      if (guilds.size === 0) {
        console.log('[BOT] ⚠️  No servers available. Commands will be registered when the bot is added to a server.');
        this.isRegisteringCommands = false;
        return;
      }

      console.log(`[BOT] 📋 Registering commands in ${guilds.size} server(s)...`);
      console.log(`[BOT] 📊 Total commands to register: ${this.slashCommands.length}`);

      for (const [guildId, guild] of guilds) {
        try {
          console.log(`[BOT] 📋 Registering commands in: ${guild.name} (${guildId})`);
          
          // Validar y filtrar comandos antes de registrar
          const validCommands = this.slashCommands.filter(cmd => {
            if (!cmd || !cmd.name || !cmd.description) {
              console.warn(`[BOT] ⚠️  Skipping invalid command: ${cmd?.name || 'unknown'}`);
              return false;
            }
            return true;
          });

          const totalCommands = validCommands.length;
          const startTime = Date.now();
          
          console.log(`[BOT] 📝 Registering ${totalCommands} command(s) in ${guild.name}...`);
          
          // Log lista de comandos que se van a registrar
          const commandNames = validCommands.map(c => c.name).sort();
          console.log(`[BOT] 📋 Commands to register: ${commandNames.join(', ')}`);
          if (commandNames.includes('vouches-restore')) {
            console.log(`[BOT] ✅ vouches-restore found in command list`);
          } else {
            console.warn(`[BOT] ⚠️  vouches-restore NOT found in command list!`);
          }
          
          // Usar REST API POST para crear comandos individuales - método más confiable
          console.log(`[BOT] 📤 Starting individual command registration for ${totalCommands} commands...`);
          console.log(`[BOT] 🔍 Using REST API POST method (direct API calls)`);
          console.log(`[BOT] 🔍 Guild ID: ${guildId}, Guild Name: ${guild.name}`);
          console.log(`[BOT] 🔍 Bot User ID: ${this.client.user.id}`);
          
          const route = Routes.applicationGuildCommands(this.client.user.id, guildId);
          let success = 0;
          let failed = 0;
          const failedCommands = [];
          
          // Limpiar comandos existentes primero usando REST API
          try {
            console.log(`[BOT] 🗑️  Cleaning existing commands using REST API...`);
            const fetchStart = Date.now();
            const existing = await Promise.race([
              rest.get(route),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout after 10s')), 10000))
            ]);
            const fetchTime = ((Date.now() - fetchStart) / 1000).toFixed(2);
            const existingCount = Array.isArray(existing) ? existing.length : 0;
            console.log(`[BOT] 📊 Found ${existingCount} existing command(s) to delete (fetch took ${fetchTime}s)`);
            
            if (existingCount > 0) {
              for (const cmd of existing) {
                try {
                  console.log(`[BOT] 🗑️  Deleting: ${cmd.name} (ID: ${cmd.id})...`);
                  const delStart = Date.now();
                  await Promise.race([
                    rest.delete(Routes.applicationGuildCommand(this.client.user.id, guildId, cmd.id)),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Delete timeout after 5s')), 5000))
                  ]);
                  const delTime = ((Date.now() - delStart) / 1000).toFixed(2);
                  console.log(`[BOT] ✅ Deleted: ${cmd.name} (${delTime}s)`);
                } catch (delErr) {
                  console.warn(`[BOT] ⚠️  Failed to delete ${cmd.name}: ${delErr.message}`);
                }
              }
              console.log(`[BOT] ✅ Cleaned ${existingCount} existing command(s)`);
              console.log(`[BOT] ⏳ Waiting 2 seconds after deletion...`);
              await new Promise(r => setTimeout(r, 2000));
              console.log(`[BOT] ✅ Ready to register new commands`);
            }
          } catch (cleanErr) {
            console.error(`[BOT] ❌ Error cleaning commands: ${cleanErr.message}`);
            console.error(`[BOT]    Error stack: ${cleanErr.stack}`);
            // Continuar de todas formas
          }
          
          // Registrar comandos individualmente usando REST API POST
          for (let i = 0; i < validCommands.length; i++) {
            const cmd = validCommands[i];
            const cmdStartTime = Date.now();
            
            try {
              console.log(`[BOT] 📝 [${i + 1}/${totalCommands}] Registering: ${cmd.name}...`);
              console.log(`[BOT]    Command data: name="${cmd.name}", description="${cmd.description?.substring(0, 50)}..."`);
              console.log(`[BOT]    Options count: ${cmd.options?.length || 0}`);
              
              // Usar REST API POST para crear comando individual
              console.log(`[BOT]    Sending POST request to REST API...`);
              const createPromise = rest.post(route, { body: cmd });
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`Command creation timeout after 10s`)), 10000)
              );
              
              const created = await Promise.race([createPromise, timeoutPromise]);
              
              if (created && created.id) {
                success++;
                const cmdTime = ((Date.now() - cmdStartTime) / 1000).toFixed(2);
                console.log(`[BOT] ✅ [${i + 1}/${totalCommands}] Registered: ${cmd.name} (${cmdTime}s) - ID: ${created.id}`);
                
                // Verificar vouches-restore específicamente
                if (cmd.name === 'vouches-restore') {
                  console.log(`[BOT] 🎯 vouches-restore successfully registered! ID: ${created.id}`);
                }
              } else {
                throw new Error('Command created but no ID returned');
              }
              
              // Delay entre comandos para evitar rate limits (500ms)
              if (i < validCommands.length - 1) {
                await new Promise(r => setTimeout(r, 500));
              }
              
            } catch (cmdErr) {
              failed++;
              failedCommands.push(cmd.name);
              const cmdTime = ((Date.now() - cmdStartTime) / 1000).toFixed(2);
              
              // Log MUY detallado del error
              console.error(`[BOT] ❌ [${i + 1}/${totalCommands}] Failed: ${cmd.name} (${cmdTime}s)`);
              console.error(`[BOT]    Error type: ${cmdErr.constructor?.name || 'Unknown'}`);
              console.error(`[BOT]    Error code: ${cmdErr.code || 'N/A'}`);
              console.error(`[BOT]    Error status: ${cmdErr.status || 'N/A'}`);
              console.error(`[BOT]    Error message: ${cmdErr.message || 'Unknown error'}`);
              if (cmdErr.stack) {
                console.error(`[BOT]    Error stack: ${cmdErr.stack.split('\n').slice(0, 3).join('\n')}`);
              }
              if (cmdErr.requestData) {
                console.error(`[BOT]    Request data: ${JSON.stringify(cmdErr.requestData).substring(0, 200)}`);
              }
              
              // Si es rate limit, esperar más tiempo
              if (cmdErr.code === 50035 || cmdErr.status === 429 || cmdErr.retry_after || cmdErr.message?.includes('rate limit')) {
                const waitTime = cmdErr.retry_after ? (cmdErr.retry_after * 1000) : 2000;
                console.log(`[BOT] ⏳ Rate limited on ${cmd.name}, waiting ${waitTime/1000}s...`);
                await new Promise(r => setTimeout(r, waitTime));
                
                // Reintentar este comando una vez
                try {
                  console.log(`[BOT] 🔄 Retrying: ${cmd.name}...`);
                  const retryPromise = rest.post(route, { body: cmd });
                  const retryTimeout = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Retry timeout after 10s')), 10000)
                  );
                  const retryCreated = await Promise.race([retryPromise, retryTimeout]);
                  if (retryCreated && retryCreated.id) {
                    success++;
                    failed--;
                    failedCommands.pop();
                    console.log(`[BOT] ✅ Retry successful: ${cmd.name} - ID: ${retryCreated.id}`);
                  }
                } catch (retryErr) {
                  console.error(`[BOT] ❌ Retry failed for ${cmd.name}: ${retryErr.message}`);
                  console.error(`[BOT]    Retry error code: ${retryErr.code || 'N/A'}`);
                }
              }
              
              // Continuar con el siguiente comando
              console.log(`[BOT] ⏭️  Continuing with next command...`);
              await new Promise(r => setTimeout(r, 500));
            }
          }
          
          const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`[BOT] ✅ ${guild.name}: ${success}/${totalCommands} commands registered successfully, ${failed} failed (took ${totalTime}s)`);
          
          if (failedCommands.length > 0) {
            console.warn(`[BOT] ⚠️  Failed commands: ${failedCommands.join(', ')}`);
          }
          
          // Verificar vouches-restore en los comandos registrados
          try {
            const registered = await guild.commands.fetch();
            const vouchesRestore = registered.find(c => c.name === 'vouches-restore');
            if (vouchesRestore) {
              console.log(`[BOT] ✅ vouches-restore verified in registered commands! ID: ${vouchesRestore.id}`);
            } else {
              console.warn(`[BOT] ⚠️  vouches-restore NOT found in registered commands!`);
            }
          } catch (verifyErr) {
            console.warn(`[BOT] ⚠️  Could not verify vouches-restore: ${verifyErr.message}`);
          }
          
        } catch (error) {
          console.error(`[BOT] ❌ Error registering commands in ${guild.name}:`, error.message);
        }
      }
      
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[BOT] ✅ REGISTRATION COMPLETE in all servers (took ${elapsedTime}s)`);
    } catch (error) {
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(`[BOT] ❌ Registration error after ${elapsedTime}s:`, error.message);
      console.error(`[BOT] Stack trace:`, error.stack);
    } finally {
      this.isRegisteringCommands = false;
      console.log(`[BOT] 🔓 Command registration lock released`);
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
          // Verificar si es un botón de giveaway
          if (interaction.customId.startsWith('giveaway_join_')) {
            await this.handleGiveawayButton(interaction);
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
        // Si es "replaces", pedir invoice ID primero
        if (category === 'replaces') {
          const modal = new ModalBuilder()
            .setCustomId(`ticket_replaces_modal`)
            .setTitle('Replaces Ticket - Invoice Required');

          const invoiceInput = new TextInputBuilder()
            .setCustomId('invoice_id')
            .setLabel('Invoice ID (Required)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter your invoice ID...')
            .setRequired(true)
            .setMaxLength(100);

          const proofInput = new TextInputBuilder()
            .setCustomId('proof_note')
            .setLabel('Proof (Optional - Upload image after)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('You can upload proof image after ticket creation...')
            .setRequired(false)
            .setMaxLength(500);

          const actionRow1 = new ActionRowBuilder().addComponents(invoiceInput);
          const actionRow2 = new ActionRowBuilder().addComponents(proofInput);
          modal.addComponents(actionRow1, actionRow2);

          await interaction.showModal(modal);
          return;
        }
        
        // Para otras categorías, crear directamente
        await interaction.deferReply({ ephemeral: true });
        
        const guild = interaction.guild;
        const user = interaction.user;
        
        const result = await TicketManager.createTicket(guild, user, category);
        
        await interaction.editReply({
          content: `✅ Ticket ${result.ticketId} created in ${result.channel}`
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
          content: '❌ Only staff can claim tickets',
          ephemeral: true
        });
        return;
      }

      const ticketId = customId.replace('ticket_claim_', '');
      console.log(`[TICKET] Claim button clicked for ticket: ${ticketId}`);
      
      const ticket = TicketManager.getTicket(ticketId);
      
      if (!ticket) {
        console.warn(`[TICKET] Ticket not found: ${ticketId}`);
        await interaction.reply({
          content: `❌ Ticket not found: ${ticketId}`,
          ephemeral: true
        });
        return;
      }
      
      console.log(`[TICKET] Found ticket: ${ticket.id} for channel ${ticket.channelId}`);

      await interaction.deferUpdate();
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
      const ticketId = customId.replace('ticket_close_', '');
      console.log(`[TICKET] Close button clicked for ticket: ${ticketId}`);
      
      const ticket = TicketManager.getTicket(ticketId);
      
      if (!ticket) {
        console.warn(`[TICKET] Ticket not found: ${ticketId}`);
        await interaction.reply({
          content: `❌ Ticket not found: ${ticketId}`,
          ephemeral: true
        });
        return;
      }
      
      console.log(`[TICKET] Found ticket: ${ticket.id} for channel ${ticket.channelId}`);

      // Verificar que el usuario tenga rol de staff/admin O sea el creador del ticket
      const guildConfig = GuildConfig.getConfig(interaction.guild.id);
      const staffRoleId = guildConfig?.staffRoleId || config.BOT_STAFF_ROLE_ID;
      const adminRoleId = guildConfig?.adminRoleId || config.BOT_ADMIN_ROLE_ID;
      
      const hasStaffRole = staffRoleId && interaction.member.roles.cache.has(staffRoleId);
      const hasAdminRole = adminRoleId && interaction.member.roles.cache.has(adminRoleId);
      const isTicketCreator = ticket.userId === interaction.user.id;
      
      if (!hasStaffRole && !hasAdminRole && !isTicketCreator) {
        await interaction.reply({
          content: '❌ Only staff or the ticket creator can close tickets',
          ephemeral: true
        });
        return;
      }

      // Si es el creador del ticket, cerrar directamente sin reviews
      if (isTicketCreator && !hasStaffRole && !hasAdminRole) {
        // Mostrar modal para razón (obligatoria)
        const modal = new ModalBuilder()
          .setCustomId(`ticket_close_modal_${ticketId}`)
          .setTitle('Close Ticket');

        const reasonInput = new TextInputBuilder()
          .setCustomId('close_reason')
          .setLabel('Reason for closing (required)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Explain why you are closing this ticket...')
          .setRequired(true)
          .setMaxLength(500);

        const actionRow = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
        return;
      }

      // Si es owner/admin, puede cerrar sin razón (pero puede ponerla opcionalmente)
      if (hasAdminRole) {
        // Owner puede cerrar directamente sin razón, pero puede ponerla opcionalmente
        const modal = new ModalBuilder()
          .setCustomId(`ticket_close_modal_${ticketId}`)
          .setTitle('Close Ticket');

        const reasonInput = new TextInputBuilder()
          .setCustomId('close_reason')
          .setLabel('Reason for closing (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Optional: Explain why you are closing this ticket...')
          .setRequired(false)
          .setMaxLength(500);

        const actionRow = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
        return;
      }

      // Si es staff, necesita razón obligatoria
      if (hasStaffRole) {
        const modal = new ModalBuilder()
          .setCustomId(`ticket_close_modal_${ticketId}`)
          .setTitle('Close Ticket');

        const reasonInput = new TextInputBuilder()
          .setCustomId('close_reason')
          .setLabel('Reason for closing (required)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Explain why you are closing this ticket...')
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

  async handleGiveawayButton(interaction) {
    const giveawayId = interaction.customId.replace('giveaway_join_', '');
    const { readFileSync, writeFileSync, existsSync } = await import('fs');
    const GIVEAWAYS_FILE = './giveaways.json';

    function loadGiveaways() {
      try {
        if (existsSync(GIVEAWAYS_FILE)) {
          const data = readFileSync(GIVEAWAYS_FILE, 'utf-8');
          return JSON.parse(data);
        }
      } catch (error) {
        console.error('[GIVEAWAY] Error loading giveaways:', error);
      }
      return { giveaways: {}, nextId: 1 };
    }

    function saveGiveaways(data) {
      try {
        writeFileSync(GIVEAWAYS_FILE, JSON.stringify(data, null, 2), 'utf-8');
      } catch (error) {
        console.error('[GIVEAWAY] Error saving giveaways:', error);
      }
    }

    try {
      const giveawaysData = loadGiveaways();
      const giveaway = giveawaysData.giveaways[giveawayId];

      if (!giveaway || giveaway.ended) {
        await interaction.reply({
          content: '❌ This giveaway has ended',
          ephemeral: true
        });
        return;
      }

      if (Date.now() >= giveaway.endTime) {
        await interaction.reply({
          content: '❌ This giveaway has ended',
          ephemeral: true
        });
        return;
      }

      if (giveaway.participants.includes(interaction.user.id)) {
        await interaction.reply({
          content: '✅ You are already participating in this giveaway!',
          ephemeral: true
        });
        return;
      }

      giveaway.participants.push(interaction.user.id);
      saveGiveaways(giveawaysData);

      await interaction.reply({
        content: '🎉 You have joined the giveaway! Good luck!',
        ephemeral: true
      });

    } catch (error) {
      console.error('[GIVEAWAY] Error handling button:', error);
      await interaction.reply({
        content: '❌ Error joining giveaway',
        ephemeral: true
      }).catch(() => {});
    }
  }

  async handleTicketModal(interaction) {
    // Modal para crear ticket de replaces con invoice
    if (interaction.customId === 'ticket_replaces_modal') {
      const invoiceId = interaction.fields.getTextInputValue('invoice_id');
      
      if (!invoiceId || invoiceId.trim().length === 0) {
        await interaction.reply({
          content: '❌ Invoice ID is required',
          ephemeral: true
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      
      const guild = interaction.guild;
      const user = interaction.user;
      
      const result = await TicketManager.createTicket(guild, user, 'replaces', invoiceId);
      
      await interaction.editReply({
        content: `✅ Ticket ${result.ticketId} created in ${result.channel}\n\n📋 **Invoice ID:** ${invoiceId}\n\n💡 You can now upload proof images in the ticket channel.`
      });
      return;
    }

    // Modal para cerrar ticket
    if (interaction.customId.startsWith('ticket_close_modal_')) {
      const ticketId = interaction.customId.replace('ticket_close_modal_', '');
      const closeReason = interaction.fields.getTextInputValue('close_reason') || null;

      await interaction.deferUpdate();
      
      const ticket = TicketManager.getTicket(ticketId);
      const isTicketCreator = ticket && ticket.userId === interaction.user.id;
      const guildConfig = GuildConfig.getConfig(interaction.guild.id);
      const adminRoleId = guildConfig?.adminRoleId || config.BOT_ADMIN_ROLE_ID;
      const staffRoleId = guildConfig?.staffRoleId || config.BOT_STAFF_ROLE_ID;
      const hasAdminRole = adminRoleId && interaction.member.roles.cache.has(adminRoleId);
      const hasStaffRole = staffRoleId && interaction.member.roles.cache.has(staffRoleId);
      
      // Si es el creador del ticket (usuario normal), cerrar directamente sin reviews
      if (isTicketCreator && !hasStaffRole && !hasAdminRole) {
        if (!closeReason || closeReason.trim().length === 0) {
          await interaction.followUp({
            content: '❌ Reason is required when closing your own ticket',
            ephemeral: true
          });
          return;
        }

        ticket.closeReason = closeReason;
        ticket.closedBy = interaction.user.id;
        ticket.closedByType = 'user';
        TicketManager.saveTickets();
        
        const channel = await interaction.guild.channels.fetch(ticket.channelId);
        if (channel) {
          const closingEmbed = new EmbedBuilder()
            .setColor(0xff9900)
            .setTitle('✅ Ticket Closing')
            .setDescription('This ticket will close in a few seconds...')
            .addFields({
              name: '📝 Reason',
              value: closeReason,
              inline: false
            })
            .addFields({
              name: '👤 Closed by',
              value: `${interaction.user} (Ticket Creator)`,
              inline: false
            })
            .setTimestamp();
          
          await channel.send({ embeds: [closingEmbed] });
        }
        
        // Cerrar después de 3-5 segundos
        setTimeout(async () => {
          await TicketManager.closeTicket(interaction.guild, ticketId, interaction.user.id);
        }, 3000 + Math.random() * 2000);
        
        return;
      }
      
      // Si es owner/admin, puede cerrar sin razón pero la razón aparece en transcript si la pone
      if (hasAdminRole) {
        ticket.closeReason = closeReason;
        ticket.closedBy = interaction.user.id;
        ticket.closedByType = 'owner';
        TicketManager.saveTickets();
        
        // Cerrar directamente sin reviews
        const channel = await interaction.guild.channels.fetch(ticket.channelId);
        if (channel) {
          const closingEmbed = new EmbedBuilder()
            .setColor(0xff9900)
            .setTitle('✅ Ticket Closing')
            .setDescription('This ticket will close in a few seconds...')
            .addFields({
              name: '👤 Closed by',
              value: `${interaction.user} (Owner/Admin)`,
              inline: false
            });
          
          if (closeReason && closeReason.trim().length > 0) {
            closingEmbed.addFields({
              name: '📝 Reason',
              value: closeReason,
              inline: false
            });
          }
          
          closingEmbed.setTimestamp();
          await channel.send({ embeds: [closingEmbed] });
        }
        
        setTimeout(async () => {
          await TicketManager.closeTicket(interaction.guild, ticketId, interaction.user.id);
        }, 3000 + Math.random() * 2000);
        
        return;
      }
      
      // Si es staff, necesita razón obligatoria y mostrar ratings
      if (hasStaffRole) {
        if (!closeReason || closeReason.trim().length === 0) {
          await interaction.followUp({
            content: '❌ Reason is required for staff members',
            ephemeral: true
          });
          return;
        }
        
        ticket.closeReason = closeReason;
        ticket.closedBy = interaction.user.id;
        ticket.closedByType = 'staff';
        TicketManager.saveTickets();
        
        // Mostrar ratings (la razón ya está guardada)
        await TicketManager.showRatings(interaction.guild, ticketId, interaction.member, closeReason);
        return;
      }
    }
  }

  async handleSetupButton(interaction) {
    const { SetupWizard } = await import('../utils/SetupWizard.js');
    const AUTHORIZED_USER_IDS = ['1190738779015757914', '1407024330633642005'];

    if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
      await interaction.reply({
        content: '❌ You do not have permission to use this command.',
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
        content: '❌ Configuration cancelled.',
        embeds: [],
        components: []
      });
      return;
    }

    const session = SetupWizard.getSession(interaction.user.id);
    if (!session) {
      await interaction.reply({
        content: '❌ No active configuration session. Use `/setup start` to begin.',
        ephemeral: true
      });
      return;
    }

    if (customId === 'setup_next') {
      const maxSteps = 14; // 15 pasos (0-14)
      if (session.step < maxSteps) {
        session.step++;
        const stepData = SetupWizard.getStepEmbed(session.step, session);
        if (stepData) {
          await interaction.update({
            embeds: [stepData.embed],
            components: [stepData.buttons]
          });
        }
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
      const maxSteps = 14; // 15 pasos (0-14)
      if (session.step <= maxSteps) {
        const stepData = SetupWizard.getStepEmbed(session.step, session);
        if (stepData) {
          await interaction.update({
            embeds: [stepData.embed],
            components: [stepData.buttons]
          });
        } else {
          await this.finishSetup(interaction, session);
        }
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
        const label = stepName === 'admin_role' ? 'Admin Role' :
                     stepName === 'staff_role' ? 'Trial Staff Role' :
                     stepName === 'customer_role' ? 'Customer Role' :
                     'Trial Admin Role';
        modal = SetupWizard.createRoleModal(stepName, label);
      } else {
        const label = stepName === 'log_channel' ? 'Log Channel' :
                     stepName === 'transcript_channel' ? 'Transcript Channel' :
                     stepName === 'rating_channel' ? 'Rating Channel' :
                     stepName === 'spam_channel' ? 'Spam/Ban Channel' :
                     stepName === 'bot_status_channel' ? 'Bot Status Channel' :
                     stepName === 'automod_channel' ? 'Automod Channel' :
                     stepName === 'backup_channel' ? 'Backup Channel' :
                     stepName === 'weekly_reports_channel' ? 'Weekly Reports Channel' :
                     stepName === 'accept_channel' ? 'Accept Channel' :
                     stepName === 'staff_rating_support_channel' ? 'Staff Rating Support Channel' :
                     stepName === 'staff_feedbacks_channel' ? 'Staff Feedbacks Channel' :
                     'Channel';
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
        content: '❌ The ID must be a valid number.',
        ephemeral: true
      });
      return;
    }

    try {
      if (stepName.includes('role')) {
        const role = await interaction.guild.roles.fetch(value);
        if (!role) {
          await interaction.reply({
            content: '❌ The role does not exist in this server.',
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
            content: '❌ The channel does not exist in this server.',
            ephemeral: true
          });
          return;
        }
        const configKey = stepName === 'log_channel' ? 'logChannelId' :
                         stepName === 'transcript_channel' ? 'transcriptChannelId' :
                         stepName === 'rating_channel' ? 'ratingChannelId' :
                         stepName === 'spam_channel' ? 'spamChannelId' :
                         stepName === 'bot_status_channel' ? 'botStatusChannelId' :
                         stepName === 'automod_channel' ? 'automodChannelId' :
                         stepName === 'backup_channel' ? 'backupChannelId' :
                         stepName === 'weekly_reports_channel' ? 'weeklyReportsChannelId' :
                         stepName === 'accept_channel' ? 'acceptChannelId' :
                         stepName === 'staff_rating_support_channel' ? 'staffRatingSupportChannelId' :
                         stepName === 'staff_feedbacks_channel' ? 'staffFeedbacksChannelId' :
                         'channelId';
        session.config[configKey] = value;
      }
    } catch (error) {
      await interaction.reply({
        content: '❌ Error verifying the ID. Make sure the role/channel exists and the bot has access.',
        ephemeral: true
      });
      return;
    }

    const stepData = SetupWizard.getStepEmbed(session.step, session);
    await interaction.reply({
        content: '✅ Configuration saved!',
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
        content: '❌ You must configure at least the Admin Role and the Trial Staff Role.',
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
      botStatusChannelId: session.config.botStatusChannelId,
      automodChannelId: session.config.automodChannelId,
      backupChannelId: session.config.backupChannelId,
      weeklyReportsChannelId: session.config.weeklyReportsChannelId,
      acceptChannelId: session.config.acceptChannelId,
      staffRatingSupportChannelId: session.config.staffRatingSupportChannelId,
      staffFeedbacksChannelId: session.config.staffFeedbacksChannelId,
      configuredBy: interaction.user.id,
      configuredByUsername: interaction.user.username
    });

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('✅ Bot Configured Successfully')
      .setDescription(`The bot has been configured for server **${interaction.guild.name}**`)
      .addFields(
        {
          name: '👑 Admin Role',
          value: `<@&${session.config.adminRoleId}>`,
          inline: true
        },
        {
          name: '👥 Trial Staff Role',
          value: `<@&${session.config.staffRoleId}>`,
          inline: true
        },
        {
          name: '🛒 Customer Role',
          value: session.config.customerRoleId ? `<@&${session.config.customerRoleId}>` : 'Not configured',
          inline: true
        },
        {
          name: '📝 Log Channel',
          value: session.config.logChannelId ? `<#${session.config.logChannelId}>` : 'Not configured',
          inline: true
        },
        {
          name: '📄 Transcript Channel',
          value: session.config.transcriptChannelId ? `<#${session.config.transcriptChannelId}>` : 'Not configured',
          inline: true
        },
        {
          name: '⭐ Rating Channel',
          value: session.config.ratingChannelId ? `<#${session.config.ratingChannelId}>` : 'Not configured',
          inline: true
        },
        {
          name: '🚫 Spam/Ban Channel',
          value: session.config.spamChannelId ? `<#${session.config.spamChannelId}>` : 'Not configured',
          inline: true
        },
        {
          name: '🔧 Trial Admin Role',
          value: session.config.trialAdminRoleId ? `<@&${session.config.trialAdminRoleId}>` : 'Not configured',
          inline: true
        },
        {
          name: '🤖 Bot Status Channel',
          value: session.config.botStatusChannelId ? `<#${session.config.botStatusChannelId}>` : 'Not configured',
          inline: true
        },
        {
          name: '🛡️ Automod Channel',
          value: session.config.automodChannelId ? `<#${session.config.automodChannelId}>` : 'Not configured',
          inline: true
        },
        {
          name: '💾 Backup Channel',
          value: session.config.backupChannelId ? `<#${session.config.backupChannelId}>` : 'Not configured',
          inline: true
        },
        {
          name: '📊 Weekly Reports Channel',
          value: session.config.weeklyReportsChannelId ? `<#${session.config.weeklyReportsChannelId}>` : 'Not configured',
          inline: true
        },
        {
          name: '✅ Accept Channel',
          value: session.config.acceptChannelId ? `<#${session.config.acceptChannelId}>` : 'Not configured',
          inline: true
        },
        {
          name: '⭐ Staff Rating Support',
          value: session.config.staffRatingSupportChannelId ? `<#${session.config.staffRatingSupportChannelId}>` : 'Not configured',
          inline: true
        },
        {
          name: '🌟 Staff Feedbacks',
          value: session.config.staffFeedbacksChannelId ? `<#${session.config.staffFeedbacksChannelId}>` : 'Not configured',
          inline: true
        }
      )
      .setFooter({ text: `Configured by ${interaction.user.username}` })
      .setTimestamp();

    await interaction.update({
      content: null,
      embeds: [embed],
      components: []
    });

    SetupWizard.deleteSession(interaction.user.id);

    console.log(`[SETUP] Bot configured in server: ${interaction.guild.name} (${session.guildId})`);
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
        
        // Sistema de auto-respuesta para tickets
        const autoResponses = [
          {
            triggers: ['warranty', 'warrant', 'guarantee', 'guaranty'],
            response: '📋 **Warranty Check Required**\n\n1. First, check the warranty on the website\n2. Send your invoice number\n3. Send proof (screenshot/image)\n\nOnce you provide these, the staff will process your replacement.'
          },
          {
            triggers: ['password', 'incorrect', 'wrong password', 'can\'t access', 'cannot access', 'can\'t login', 'cannot login'],
            response: '🔐 **Account Access Issue**\n\nPlease provide:\n1. Invoice number\n2. Screenshot/proof of the issue\n3. Service name (if known)\n\nThe staff will help you resolve this issue.'
          },
          {
            triggers: ['invoice', 'invoice number', 'invoice id'],
            response: '📄 **Invoice Information**\n\nPlease send:\n1. Your invoice number (alphanumeric code)\n2. Proof/screenshot of the issue\n\nThis will help the staff process your request faster.'
          },
          {
            triggers: ['payment', 'payment method', 'pay', 'how to pay', 'payment methods', 'btc', 'ltc', 'pp', 'paypal', 'bitcoin', 'litecoin', 'crypto'],
            response: '💳 **Payment Methods**\n\nWe accept the following payment methods:\n• **BTC** (Bitcoin)\n• **LTC** (Litecoin)\n• **PP** (PayPal)\n\n**Note:** Payment methods may vary. Please check our website or announcements for the most up-to-date information on available payment options.\n\nFor payment-related issues, please contact our support team.'
          }
        ];

        // Verificar si hay una respuesta automática para este mensaje
        for (const autoResponse of autoResponses) {
          const hasTrigger = autoResponse.triggers.some(trigger => content.includes(trigger));
          if (hasTrigger) {
            const lastMessages = await message.channel.messages.fetch({ limit: 10 });
            const alreadyResponded = lastMessages.some(msg => 
              msg.author.bot && 
              msg.content.includes(autoResponse.response.substring(0, 30))
            );
            
            if (!alreadyResponded) {
              await message.channel.send({
                content: autoResponse.response
              });
              break;
            }
          }
        }

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
          'don\'t work',
          'the account doesn\'t work',
          'the account don\'t work',
          'now the account doesn\'t work'
        ];
        
        const hasAccountIssue = accountIssues.some(phrase => content.includes(phrase));
        
        // Si detecta problema de cuenta, preguntar qué cuenta específicamente
        if (hasAccountIssue) {
          // Verificar si ya preguntamos antes (evitar spam)
          const lastMessages = await message.channel.messages.fetch({ limit: 5 });
          const alreadyAsked = lastMessages.some(msg => 
            msg.author.bot && 
            (msg.content.includes('What account') || 
             msg.content.includes('Please specify'))
          );
          
          if (!alreadyAsked) {
            await message.channel.send({
              content: `❓ **What account?**\n\nPlease specify which account is not working.`
            });
          }
          return;
        }
        
        // Detectar invoice con formato específico (ej: 3bcf919f0e26c-0000008525997)
        const invoiceMatch = this.detectInvoice(message.content); // Usar contenido original, no lowercase
        
        // Detectar servicios y cantidades mencionados (Netflix x1, Hulu, etc.)
        const serviceInfo = this.detectServiceAndQuantity(content);
        
        // Si detecta invoice + fotos, verificar invoice y analizar fotos
        if (invoiceMatch && hasImages) {
          try {
            // Verificar invoice con la API
            const invoiceValid = await this.verifyInvoice(invoiceMatch);
            
            if (!invoiceValid) {
              const lastMessages = await message.channel.messages.fetch({ limit: 5 });
              const alreadyWarned = lastMessages.some(msg => 
                msg.author.bot && 
                msg.content.includes('Invoice not found')
              );
              
              if (!alreadyWarned) {
                await message.channel.send({
                  content: `❌ **Invoice Not Found**\n\nThe invoice ID \`${invoiceMatch}\` was not found in the system.\n\nPlease verify the invoice number and try again.`
                });
              }
              return;
            }
            
            // Analizar fotos para detectar errores o cuentas válidas
            const photoAnalysis = await this.analyzePhotos(message.attachments);
            const accountCount = photoAnalysis.accountCount;
            const hasErrors = photoAnalysis.hasErrors;
            const hasValidAccounts = photoAnalysis.hasValidAccounts;
            
            // Si hay errores detectados o no se puede determinar claramente, etiquetar staff
            if (hasErrors || (!hasValidAccounts && accountCount === 0)) {
              const guildConfig = GuildConfig.getConfig(message.guild.id);
              const staffRoleId = guildConfig?.staffRoleId;
              
              let staffMention = '';
              if (staffRoleId) {
                staffMention = `<@&${staffRoleId}> `;
              }
              
              await message.channel.send({
                content: `${staffMention}⚠️ **Manual Review Required**\n\nInvoice: \`${invoiceMatch}\`\nPhotos detected: ${message.attachments.size}\n\n**Issue:** Unable to automatically determine account status or errors detected in photos.\n\nPlease review the photos and process manually.`
              });
              return;
            }
            
            // Si hay fotos válidas pero no se detectó servicio, preguntar tipo de cuenta
            if (hasValidAccounts && !serviceInfo.service) {
              const lastMessages = await message.channel.messages.fetch({ limit: 5 });
              const alreadyAsked = lastMessages.some(msg => 
                msg.author.bot && 
                (msg.content.includes('What type of account') || 
                 msg.content.includes('How many accounts'))
              );
              
              if (!alreadyAsked) {
                await message.channel.send({
                  content: `❓ **Account Information Required**\n\n**How many accounts?** (Detected: ${accountCount > 0 ? accountCount : 'unknown'})\n**What type of account?** (e.g., Netflix, Hulu, Disney+, etc.)\n\nPlease provide this information to proceed with the replacement.`
                });
              }
              return;
            }
            
            // Si hay servicio pero no cantidad, preguntar cantidad
            if (serviceInfo.service && !serviceInfo.quantity) {
              const lastMessages = await message.channel.messages.fetch({ limit: 5 });
              const alreadyAsked = lastMessages.some(msg => 
                msg.author.bot && 
                msg.content.includes('How many accounts')
              );
              
              if (!alreadyAsked) {
                await message.channel.send({
                  content: `❓ **How many accounts?**\n\nDetected service: **${serviceInfo.service}**\nDetected in photos: ${accountCount > 0 ? accountCount : 'unknown'}\n\nPlease specify the number of accounts that need to be replaced.`
                });
              }
              return;
            }
            
            // Si tenemos invoice válido + servicio + cantidad + fotos válidas, procesar replace
            if (serviceInfo.service && serviceInfo.quantity && hasValidAccounts) {
              const ticketId = ticket.id;
              const serviceName = serviceInfo.service.toLowerCase();
              const quantity = serviceInfo.quantity;
              
              // Asegurar que el emoji 🔧 siempre esté presente
              let newName = `replace-${serviceName}-x${quantity}-acc-${ticketId.toLowerCase()}`;
              if (!newName.includes('🔧')) {
                newName += '-🔧';
              }
              
              await message.channel.setName(newName);
              
              console.log(`[TICKET] Ticket ${ticketId} renamed to "${newName}" (Invoice: ${invoiceMatch}, Service: ${serviceName}, Qty: ${quantity})`);
              
              // Ejecutar replace automáticamente en público
              setTimeout(async () => {
                try {
                  const { default: replaceCommand } = await import('../commands/replace.js');
                  
                  // Crear una interacción simulada para ejecutar /replace
                  const fakeInteraction = {
                    options: {
                      getString: (name) => {
                        if (name === 'product') return serviceName;
                        if (name === 'variant') return null;
                        if (name === 'quantity') return quantity.toString();
                        return null;
                      },
                      getInteger: (name) => {
                        if (name === 'quantity') return quantity;
                        return null;
                      }
                    },
                    guild: message.guild,
                    channel: message.channel,
                    user: message.client.user,
                    member: message.guild.members.me,
                    editReply: async (data) => {
                      await message.channel.send({
                        content: `✅ **Replacement Processed Automatically**\n\nInvoice: ${invoiceMatch}\nService: ${serviceName} x${quantity}\nProof: Attached\n\nThe replacement has been processed.`
                      });
                    },
                    deferReply: async () => {},
                    reply: async () => {}
                  };
                  
                  await replaceCommand.execute(fakeInteraction, this.api);
                  
                  console.log(`[AUTO-REPLACE] Invoice ${invoiceMatch} processed automatically - Service: ${serviceName}, Qty: ${quantity}`);
                } catch (error) {
                  console.error('[AUTO-REPLACE] Error:', error);
                  await message.channel.send({
                    content: `⚠️ **Automatic replacement failed**\n\nInvoice: ${invoiceMatch}\nService: ${serviceName} x${quantity}\n\nPlease process manually using \`/replace\`.`
                  });
                }
              }, 2000);
              
              return; // Salir después de procesar
            }
            
          } catch (error) {
            console.error('[TICKET] Error processing invoice and photos:', error);
            // En caso de error, etiquetar staff
            const guildConfig = GuildConfig.getConfig(message.guild.id);
            const staffRoleId = guildConfig?.staffRoleId;
            
            let staffMention = '';
            if (staffRoleId) {
              staffMention = `<@&${staffRoleId}> `;
            }
            
            await message.channel.send({
              content: `${staffMention}⚠️ **Error Processing Request**\n\nAn error occurred while processing the invoice and photos. Please review manually.`
            });
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
            
            console.log(`[TICKET] Ticket ${ticketId} renamed to "${newName}" after specifying account`);
          } catch (renameError) {
            console.error('[TICKET] Error renaming ticket:', renameError);
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
        
        // Si detecta invoice pero sin fotos, pedir fotos
        if (invoiceMatch && !hasImages) {
          const lastMessages = await message.channel.messages.fetch({ limit: 5 });
          const alreadyAsked = lastMessages.some(msg => 
            msg.author.bot && 
            msg.content.includes('Proof Required')
          );
          
          if (!alreadyAsked) {
            await message.channel.send({
              content: `📸 **Proof Required**\n\nInvoice detected: \`${invoiceMatch}\`\n\nPlease upload screenshot(s) as proof of the issue.`
            });
          }
          return;
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

  async verifyInvoice(invoiceId) {
    try {
      const cleanId = invoiceId.trim();
      
      // Buscar invoice en la API (similar a invoice-view)
      for (let page = 1; page <= 10; page++) { // Limitar a 10 páginas para no sobrecargar
        try {
          const response = await this.api.get(`shops/${this.api.shopId}/invoices?limit=250&page=${page}`);
          const invoicesList = Array.isArray(response) ? response : response?.data || [];
          
          if (invoicesList.length === 0) break;
          
          for (const inv of invoicesList) {
            const idMatch = inv.id === cleanId || 
                            inv.unique_id === cleanId ||
                            inv.invoice_id === cleanId || 
                            inv.reference_id === cleanId ||
                            (inv.id && inv.id.toString() === cleanId) ||
                            (inv.invoice_id && inv.invoice_id.toString() === cleanId);
            
            if (idMatch) {
              console.log(`[INVOICE-VERIFY] ✅ Invoice ${cleanId} verified`);
              return true;
            }
          }
        } catch (apiError) {
          console.error(`[INVOICE-VERIFY] Error fetching page ${page}:`, apiError.message);
          if (apiError.status === 429) break; // Rate limit
        }
      }
      
      console.log(`[INVOICE-VERIFY] ❌ Invoice ${cleanId} not found`);
      return false;
    } catch (error) {
      console.error('[INVOICE-VERIFY] Error:', error);
      return false; // En caso de error, asumir que no es válido
    }
  }

  async analyzePhotos(attachments) {
    // Sin OCR, solo podemos hacer análisis básico
    // Contar archivos de imagen
    const imageAttachments = Array.from(attachments.values()).filter(att => 
      att.contentType && att.contentType.startsWith('image/')
    );
    
    // Intentar detectar patrones en los nombres de archivo
    let accountCount = 0;
    let hasErrors = false;
    let hasValidAccounts = false;
    
    // Contar archivos únicos (no duplicados por nombre)
    const uniqueFiles = new Set();
    imageAttachments.forEach(att => {
      uniqueFiles.add(att.name);
    });
    
    accountCount = uniqueFiles.size;
    
    // Detectar posibles errores en nombres de archivo
    const errorKeywords = ['error', 'failed', 'incorrect', 'wrong', 'invalid'];
    imageAttachments.forEach(att => {
      const fileName = att.name.toLowerCase();
      if (errorKeywords.some(keyword => fileName.includes(keyword))) {
        hasErrors = true;
      }
    });
    
    // Si hay imágenes, asumir que hay al menos una cuenta válida (a menos que haya errores explícitos)
    if (imageAttachments.length > 0 && !hasErrors) {
      hasValidAccounts = true;
      // Si no se detectó cantidad específica, usar el número de imágenes únicas
      if (accountCount === 0) {
        accountCount = uniqueFiles.size;
      }
    }
    
    return {
      accountCount: accountCount,
      hasErrors: hasErrors,
      hasValidAccounts: hasValidAccounts,
      imageCount: imageAttachments.length
    };
  }
}
