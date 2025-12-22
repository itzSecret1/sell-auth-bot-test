import { Collection, Events, REST, Routes, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import axios from 'axios';
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
      
      // Recuperar y verificar tickets existentes al iniciar
      this.client.guilds.cache.forEach(async guild => {
        await TicketManager.recoverTickets(guild);
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

    // Detectar cuando el bot es removido de un servidor y crear re-invite automáticamente
    this.client.on(Events.GuildDelete, async (guild) => {
      console.log(`[BOT PROTECTION] ⚠️ Bot was removed from server: ${guild.name} (${guild.id})`);
      
      // Intentar crear re-invite automáticamente (si tenemos acceso)
      try {
        const guildConfig = GuildConfig.getConfig(guild.id);
        const verificationChannelId = guildConfig?.verificationChannelId;
        
        if (verificationChannelId) {
          // El bot fue removido pero tenía configuración, intentar re-añadirlo
          console.log(`[BOT PROTECTION] 🔄 Attempting to re-add bot to ${guild.name}...`);
          
          // Crear URL de re-autorización mejorada
          const clientId = this.client.user.id;
          const redirectUri = encodeURIComponent('https://restorecord.com');
          const scopes = ['identify', 'guilds.join', 'bot'];
          // Permisos mejorados: Manage Roles (268435456) + Manage Channels (16) + Send Messages (2048) + Embed Links (16384) = 268453904
          const permissions = '268453904';
          const reAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scopes.join('%20')}&permissions=${permissions}`;
          
          console.log(`[BOT PROTECTION] 🔗 Re-authorization URL created: ${reAuthUrl}`);
          console.log(`[BOT PROTECTION] ⚠️ Bot was removed. Please re-authorize using the URL above.`);
        }
      } catch (error) {
        console.error(`[BOT PROTECTION] Error handling guild delete: ${error.message}`);
      }
    });

    // Sistema de verificación: asignar rol cuando un usuario se une
    this.client.on(Events.GuildMemberAdd, async (member) => {
      try {
        const guildConfig = GuildConfig.getConfig(member.guild.id);
        const memberRoleId = guildConfig?.memberRoleId;
        
        if (!memberRoleId) return; // No configurado
        
        const memberRole = await member.guild.roles.fetch(memberRoleId).catch(() => null);
        if (!memberRole) return;
        
        // Verificar si el usuario ya tiene el rol
        if (member.roles.cache.has(memberRoleId)) {
          // Aún así, guardar como verificado si no está en la lista
          const { VerifiedUsers } = await import('../utils/VerifiedUsers.js');
          if (!VerifiedUsers.isVerified(member.user.id)) {
            VerifiedUsers.addVerifiedUser(
              member.user.id,
              member.user.username,
              member.user.discriminator,
              member.user.tag,
              member.guild.id
            );
          }
          return;
        }
        
        // Guardar usuario como verificado
        const { VerifiedUsers } = await import('../utils/VerifiedUsers.js');
        VerifiedUsers.addVerifiedUser(
          member.user.id,
          member.user.username,
          member.user.discriminator,
          member.user.tag,
          member.guild.id
        );
        
        // Dar el rol automáticamente (asumiendo que el usuario autorizó el bot)
        await member.roles.add(memberRole, 'Verification system - auto-assigned after authorization');
        
        console.log(`[VERIFICATION] ✅ Role ${memberRole.name} assigned to ${member.user.tag} (${member.user.id})`);
        console.log(`[VERIFICATION] ✅ User ${member.user.tag} saved as verified`);
      } catch (error) {
        console.error('[VERIFICATION] Error assigning role:', error);
      }
    });

    // Protección contra desautorización: verificar periódicamente y re-autorizar automáticamente
    setInterval(async () => {
      try {
        for (const [guildId, guild] of this.client.guilds.cache) {
          const guildConfig = GuildConfig.getConfig(guildId);
          const verificationChannelId = guildConfig?.verificationChannelId;
          
          if (!verificationChannelId) continue; // No configurado
          
          // Verificar que el bot tiene permisos básicos
          const botMember = guild.members.me;
          if (!botMember) continue;
          
          // Si el bot no tiene permisos de administrador o gestionar roles, re-autorizar automáticamente
          const hasAdminPerms = botMember.permissions.has('Administrator');
          const hasManageRoles = botMember.permissions.has('ManageRoles');
          const hasManageChannels = botMember.permissions.has('ManageChannels');
          
          if (!hasAdminPerms && (!hasManageRoles || !hasManageChannels)) {
            console.log(`[VERIFICATION] ⚠️ Bot missing permissions in ${guild.name}, auto re-authorizing...`);
            
            try {
              const verificationChannel = await guild.channels.fetch(verificationChannelId).catch(() => null);
              if (verificationChannel) {
                // Crear invite permanente para re-autorización automática
                const invite = await verificationChannel.createInvite({
                  maxAge: 0, // Sin expiración
                  maxUses: 0, // Sin límite de usos
                  unique: false // Permitir múltiples usos
                });
                
                // Crear embed de re-autorización automática
                const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
                const clientId = this.client.user.id;
                const redirectUri = encodeURIComponent('https://restorecord.com');
                const scopes = ['identify', 'guilds.join', 'bot'];
                // Permisos mejorados: Administrator (8) o permisos específicos combinados
                // Manage Roles (268435456) + Manage Channels (16) + Send Messages (2048) + Embed Links (16384) = 268453904
                const permissions = '268453904';
                const verifyUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scopes.join('%20')}&permissions=${permissions}`;
                
                const reAuthEmbed = new EmbedBuilder()
                  .setColor(0xff9900)
                  .setTitle('⚠️ Bot Re-Authorization Required')
                  .setDescription('The bot has detected missing permissions and needs to be re-authorized.\n\n**This is automatic - the bot will re-authorize itself.**')
                  .addFields({
                    name: '🔗 Re-Authorization Link',
                    value: `[Click here to re-authorize](${verifyUrl})`,
                    inline: false
                  })
                  .addFields({
                    name: '📋 Alternative Invite',
                    value: `If the link above doesn't work, use this invite:\n\`${invite.url}\``,
                    inline: false
                  })
                  .setFooter({ text: 'Auto Re-Authorization System' })
                  .setTimestamp();
                
                const verifyButton = new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setLabel('Re-Authorize Bot')
                    .setStyle(ButtonStyle.Link)
                    .setURL(verifyUrl)
                );
                
                // Enviar mensaje de re-autorización
                await verificationChannel.send({
                  content: '@here **Bot requires re-authorization**',
                  embeds: [reAuthEmbed],
                  components: [verifyButton]
                }).catch(() => {});
                
                console.log(`[VERIFICATION] 🔗 Auto re-authorization message sent to ${guild.name}`);
              }
            } catch (error) {
              console.error(`[VERIFICATION] ❌ Could not create re-authorization: ${error.message}`);
            }
          }
        }
      } catch (error) {
        console.error('[VERIFICATION] Error checking bot permissions:', error);
      }
    }, 30 * 60 * 1000); // Verificar cada 30 minutos (más frecuente para mejor protección)

    this.client.on('warn', (info) => console.log(info));
    this.client.on('error', (error) => {
      console.error('[BOT ERROR]', error.message);
    });

    this.onInteractionCreate();
    this.onMessageCreate();
    this.onGuildMemberRemove();
    this.onGuildBanAdd();
    this.onGuildMemberUpdate();

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
              // Log para verificar que vouches-restore y vouches-backup se cargan
              if (cmdName === 'vouches-restore' || cmdName === 'vouches-backup') {
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
      console.log(`[BOT] ⏳ Scheduling command registration in 2 seconds...`);
      
      // Registrar comandos de forma asíncrona sin bloquear el inicio del bot
      setTimeout(() => {
        console.log(`[BOT] 🚀 Starting command registration process...`);
        this.registerIndividualCommands().catch(err => {
          console.error(`[BOT] ❌ Fatal error in command registration: ${err.message}`);
          console.error(`[BOT]    Bot will continue running but commands may not be registered`);
        });
      }, 2000);
      
    } catch (error) {
      console.error('[BOT] Error loading commands:', error.message);
      this.isRegisteringCommands = false;
    }
  }

  async registerIndividualCommands() {
    const startTime = Date.now();
    try {
      // Verificar que el token esté configurado
      if (!config.BOT_TOKEN || config.BOT_TOKEN === '') {
        console.error('[BOT] ❌ BOT_TOKEN is not configured! Cannot register commands.');
        this.isRegisteringCommands = false;
        return;
      }
      
      // Configurar REST client con opciones mejoradas
      const rest = new REST({ 
        version: '10',
        timeout: 30000 // 30 segundos de timeout global
      }).setToken(config.BOT_TOKEN);
      
      // Verificar autenticación haciendo una solicitud simple
      try {
        console.log('[BOT] 🔑 Verifying bot token...');
        await rest.get(Routes.user('@me'));
        console.log('[BOT] ✅ Bot token is valid');
      } catch (authErr) {
        if (authErr.status === 401 || authErr.status === 403) {
          console.error('[BOT] ❌ Invalid bot token! Please reset your BOT_TOKEN in Discord Developer Portal.');
          console.error('[BOT]    Steps: 1) Go to https://discord.com/developers/applications');
          console.error('[BOT]           2) Select your bot application');
          console.error('[BOT]           3) Go to "Bot" section');
          console.error('[BOT]           4) Click "Reset Token" and update BOT_TOKEN environment variable');
          this.isRegisteringCommands = false;
          return;
        }
        console.warn(`[BOT] ⚠️  Could not verify token (non-critical): ${authErr.message}`);
      }
      
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
          if (commandNames.includes('vouches-backup')) {
            console.log(`[BOT] ✅ vouches-backup found in command list`);
          } else {
            console.warn(`[BOT] ⚠️  vouches-backup NOT found in command list!`);
          }
          
          // DIAGNÓSTICO COMPLETO ANTES DE REGISTRAR
          console.log(`[BOT] 🔍 ========== DIAGNÓSTICO INICIAL ==========`);
          console.log(`[BOT] 🔍 Guild ID: ${guildId}`);
          console.log(`[BOT] 🔍 Guild Name: ${guild.name}`);
          console.log(`[BOT] 🔍 Bot User ID: ${this.client.user.id}`);
          console.log(`[BOT] 🔍 Bot Username: ${this.client.user.username}`);
          console.log(`[BOT] 🔍 Bot Tag: ${this.client.user.tag}`);
          console.log(`[BOT] 🔍 Bot Ready: ${this.client.isReady()}`);
          console.log(`[BOT] 🔍 Guild Available: ${guild.available}`);
          console.log(`[BOT] 🔍 Guild Member Count: ${guild.memberCount}`);
      
          // Verificar permisos del bot
          try {
            console.log(`[BOT] 🔍 Checking bot permissions...`);
            const botMember = await guild.members.fetch(this.client.user.id);
            const permissions = botMember.permissions;
            console.log(`[BOT] 🔍 Bot has MANAGE_GUILD: ${permissions.has('ManageGuild')}`);
            console.log(`[BOT] 🔍 Bot has ADMINISTRATOR: ${permissions.has('Administrator')}`);
            console.log(`[BOT] 🔍 Bot permissions value: ${permissions.bitfield}`);
            
            if (!permissions.has('ManageGuild') && !permissions.has('Administrator')) {
              console.error(`[BOT] ❌ CRITICAL: Bot does NOT have MANAGE_GUILD or ADMINISTRATOR permission!`);
              console.error(`[BOT]    This is required to register slash commands.`);
              console.error(`[BOT]    Please give the bot MANAGE_GUILD permission in server settings.`);
            }
          } catch (permErr) {
            console.error(`[BOT] ❌ Error checking permissions: ${permErr.message}`);
          }
          
          // Verificar que guild.commands esté disponible
          try {
            console.log(`[BOT] 🔍 Testing guild.commands access...`);
            const testFetch = await Promise.race([
              guild.commands.fetch(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Test fetch timeout')), 5000))
            ]);
            console.log(`[BOT] ✅ guild.commands.fetch() works! Found ${testFetch.size} commands`);
          } catch (testErr) {
            console.error(`[BOT] ❌ CRITICAL: guild.commands.fetch() failed: ${testErr.message}`);
            console.error(`[BOT]    This means the bot cannot access commands API!`);
            console.error(`[BOT]    Possible causes:`);
            console.error(`[BOT]      1. Bot doesn't have MANAGE_GUILD permission`);
            console.error(`[BOT]      2. Bot application doesn't have 'applications.commands' scope`);
            console.error(`[BOT]      3. Network/firewall blocking Discord API`);
            return; // No podemos continuar si no podemos acceder a commands
          }
          
          console.log(`[BOT] 🔍 ========== FIN DIAGNÓSTICO ==========`);
          
          // No necesitamos limpiar comandos antes del PUT batch
          // PUT batch reemplaza todos los comandos automáticamente
          console.log(`[BOT] ℹ️  Skipping individual command deletion - PUT batch will replace all commands`);
          
          // Intentar primero con PUT batch (no cuenta contra límite diario)
          console.log(`[BOT] 📝 Attempting PUT batch first (recommended - doesn't count against daily limit)...`);
          console.log(`[BOT] 📝 Total commands to register: ${totalCommands}`);
          
          try {
            const putUrl = `https://discord.com/api/v10/applications/${this.client.user.id}/guilds/${guildId}/commands`;
            console.log(`[BOT]    PUT URL: ${putUrl}`);
            console.log(`[BOT]    Commands in batch: ${validCommands.length}`);
            console.log(`[BOT]    [${new Date().toISOString()}] Sending PUT batch request...`);
            
            const putStartTime = Date.now();
            const putResponse = await axios.put(putUrl, validCommands, {
              headers: {
                'Authorization': `Bot ${config.BOT_TOKEN}`,
                'Content-Type': 'application/json',
                'User-Agent': 'DiscordBot (https://github.com/discordjs/discord.js, 14.15.3)'
              },
              timeout: 60000 // 60 segundos para batch
            });
            
            const putTime = ((Date.now() - putStartTime) / 1000).toFixed(2);
            console.log(`[BOT]    [${new Date().toISOString()}] ✅ Received PUT response (${putTime}s)`);
            console.log(`[BOT]    Response status: ${putResponse.status}`);
            
            if (putResponse.status >= 200 && putResponse.status < 300 && Array.isArray(putResponse.data)) {
              const registeredCount = putResponse.data.length;
              const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
              
              console.log(`[BOT] ✅ PUT batch successful! ${registeredCount}/${totalCommands} commands registered`);
              console.log(`[BOT]    Total time: ${totalTime}s`);
              
              const registeredNames = putResponse.data.map(c => c.name);
              console.log(`[BOT]    Registered commands: ${registeredNames.slice(0, 10).join(', ')}${registeredNames.length > 10 ? '...' : ''}`);
              
              if (registeredNames.includes('vouches-restore')) {
                const vouchesRestore = putResponse.data.find(c => c.name === 'vouches-restore');
                console.log(`[BOT] 🎯 vouches-restore successfully registered! ID: ${vouchesRestore.id}`);
              }
              
              return; // Éxito con PUT batch, salir
            } else {
              throw new Error(`Invalid PUT response: status ${putResponse.status}, data: ${JSON.stringify(putResponse.data).substring(0, 200)}`);
            }
          } catch (putErr) {
            if (putErr.response) {
              const errorData = putErr.response.data || {};
              const errorCode = errorData.code;
              
              console.error(`[BOT] ❌ PUT batch failed: ${putErr.response.status}`);
              console.error(`[BOT]    Error Code: ${errorCode || 'N/A'}`);
              console.error(`[BOT]    Data: ${JSON.stringify(errorData).substring(0, 500)}`);
              
              // Si PUT falla por límite diario, informar pero continuar con POST individual
              if (errorCode === 30034 || errorData.message?.includes('Max number of daily application command creates')) {
                console.error(`[BOT] ⚠️  PUT batch also hit daily limit (unusual but possible)`);
                console.error(`[BOT]    Will try POST individual as fallback...`);
              } else {
                console.error(`[BOT] ⚠️  PUT batch failed, will try POST individual as fallback...`);
              }
            } else {
              console.error(`[BOT] ❌ PUT batch failed: ${putErr.message}`);
              console.error(`[BOT]    Will try POST individual as fallback...`);
            }
          }
          
          // Fallback: Registrar comandos individualmente usando POST (solo si PUT falló)
          console.log(`[BOT] 📝 Fallback: Starting individual POST command registration...`);

      let success = 0;
          let failed = 0;
          const failedCommands = [];
          let dailyLimitReached = false;
          
          for (let i = 0; i < validCommands.length; i++) {
            const cmd = validCommands[i];
            const cmdStartTime = Date.now();
            
            // Si ya detectamos límite diario, salir inmediatamente
            if (dailyLimitReached) {
              console.log(`[BOT] ⏸️  Stopping individual registration - daily limit already detected`);
              break;
            }
            
            try {
              console.log(`[BOT] 📝 [${i + 1}/${totalCommands}] Registering: ${cmd.name}...`);
              console.log(`[BOT]    Command data: name="${cmd.name}", description="${cmd.description?.substring(0, 50)}..."`);
              console.log(`[BOT]    Options: ${cmd.options?.length || 0}`);
              console.log(`[BOT]    Timestamp: ${new Date().toISOString()}`);
              
              // Usar axios directamente para tener más control y mejor diagnóstico
              const url = `https://discord.com/api/v10/applications/${this.client.user.id}/guilds/${guildId}/commands`;
              
              const response = await axios.post(url, cmd, {
                headers: {
                  'Authorization': `Bot ${config.BOT_TOKEN}`,
                  'Content-Type': 'application/json',
                  'User-Agent': 'DiscordBot (https://github.com/discordjs/discord.js, 14.15.3)'
                },
                timeout: 30000,
                validateStatus: (status) => status < 500 // No lanzar error para códigos 4xx
              });
              
              if (response.status >= 200 && response.status < 300) {
                const created = response.data;
                
                if (created && created.id) {
          success++;
                  const cmdTime = ((Date.now() - cmdStartTime) / 1000).toFixed(2);
                  console.log(`[BOT] ✅ [${i + 1}/${totalCommands}] Registered: ${cmd.name} (${cmdTime}s) - ID: ${created.id}`);
                  
                  // Verificar vouches-restore específicamente
                  if (cmd.name === 'vouches-restore') {
                    console.log(`[BOT] 🎯 vouches-restore successfully registered! ID: ${created.id}`);
                  }
                  
                  // Delay entre comandos para evitar rate limits (500ms)
                  if (i < validCommands.length - 1) {
                    await new Promise(r => setTimeout(r, 500));
                  }
                  
                  continue; // Continuar con el siguiente comando
                } else {
                  throw new Error(`Invalid response data: ${JSON.stringify(response.data).substring(0, 200)}`);
                }
              } else {
                // Error HTTP pero recibimos respuesta
                const errorData = response.data || {};
                const errorCode = errorData.code;
                
                console.error(`[BOT]    Response status: ${response.status}`);
                console.error(`[BOT]    Response data: ${JSON.stringify(errorData).substring(0, 300)}`);
                
                // Detectar límite diario alcanzado (código 30034)
                if (errorCode === 30034 || errorData.message?.includes('Max number of daily application command creates')) {
                  dailyLimitReached = true;
                  const retryAfter = errorData.retry_after || 86400;
                  const hours = Math.floor(retryAfter / 3600);
                  const minutes = Math.floor((retryAfter % 3600) / 60);
                  
                  console.error(`[BOT] ❌ CRITICAL: Daily command creation limit reached!`);
                  console.error(`[BOT]    Discord allows 200 command creations per day per application.`);
                  console.error(`[BOT]    You have reached this limit.`);
                  console.error(`[BOT]    Wait time: ${hours}h ${minutes}m (${retryAfter}s)`);
                  console.error(`[BOT]    SOLUTION: Wait ${hours}h ${minutes}m or use PUT batch method (doesn't count against daily limit)`);
                  
                  // Intentar PUT batch una vez más como último recurso
                  console.log(`[BOT] 🔄 Attempting PUT batch as last resort...`);
                  try {
                    const putUrl = `https://discord.com/api/v10/applications/${this.client.user.id}/guilds/${guildId}/commands`;
                    const putResponse = await axios.put(putUrl, validCommands, {
                      headers: {
                        'Authorization': `Bot ${config.BOT_TOKEN}`,
                        'Content-Type': 'application/json',
                        'User-Agent': 'DiscordBot (https://github.com/discordjs/discord.js, 14.15.3)'
                      },
                      timeout: 60000
                    });
                    
                    if (putResponse.status >= 200 && putResponse.status < 300 && Array.isArray(putResponse.data)) {
                      const registeredCount = putResponse.data.length;
                      console.log(`[BOT] ✅ PUT batch successful as last resort! ${registeredCount}/${totalCommands} commands registered`);
                      
                      const registeredNames = putResponse.data.map(c => c.name);
                      if (registeredNames.includes('vouches-restore')) {
                        const vouchesRestore = putResponse.data.find(c => c.name === 'vouches-restore');
                        console.log(`[BOT] 🎯 vouches-restore registered! ID: ${vouchesRestore.id}`);
                      }
                      
                      return; // Éxito con PUT batch
                    }
                  } catch (putErr2) {
                    console.error(`[BOT] ❌ PUT batch last resort also failed: ${putErr2.message}`);
                  }
                  
                  // Si PUT también falla, salir
                  console.error(`[BOT] ❌ Cannot register commands: Daily limit reached`);
                  console.error(`[BOT]    Please wait ${hours}h ${minutes}m before trying again`);
                  return; // Salir sin continuar
                }
                
                throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
              }
              
            } catch (cmdErr) {
              failed++;
              failedCommands.push(cmd.name);
              const cmdTime = ((Date.now() - cmdStartTime) / 1000).toFixed(2);
              
              console.error(`[BOT] ❌ [${i + 1}/${totalCommands}] Failed: ${cmd.name} (${cmdTime}s)`);
              
              if (cmdErr.response) {
                const errorData = cmdErr.response.data || {};
                const errorCode = errorData.code;
                console.error(`[BOT]    HTTP Status: ${cmdErr.response.status}`);
                console.error(`[BOT]    Error Code: ${errorCode || 'N/A'}`);
                console.error(`[BOT]    Error Message: ${errorData.message || cmdErr.message}`);
                
                if (errorCode === 30034) {
                  dailyLimitReached = true;
                  break; // Salir del loop
        }
              } else {
                console.error(`[BOT]    Error: ${cmdErr.message}`);
              }
              
              // Continuar con el siguiente comando (a menos que sea límite diario)
              if (!dailyLimitReached && i < validCommands.length - 1) {
                await new Promise(r => setTimeout(r, 500));
              }
            }
          }
          
          // Si muchos comandos fallaron por límite diario, intentar PUT batch como último recurso
          if (failed > 0 && failedCommands.length > 0) {
            console.log(`[BOT] 🔄 Attempting PUT batch as fallback for ${failed} failed commands...`);
            
            try {
              const putUrl = `https://discord.com/api/v10/applications/${this.client.user.id}/guilds/${guildId}/commands`;
              console.log(`[BOT]    PUT URL: ${putUrl}`);
              console.log(`[BOT]    Commands to register: ${validCommands.length}`);
              
              const putResponse = await axios.put(putUrl, validCommands, {
                headers: {
                  'Authorization': `Bot ${config.BOT_TOKEN}`,
                  'Content-Type': 'application/json',
                  'User-Agent': 'DiscordBot (https://github.com/discordjs/discord.js, 14.15.3)'
                },
                timeout: 60000
              });
              
              if (putResponse.status >= 200 && putResponse.status < 300 && Array.isArray(putResponse.data)) {
                const registeredCount = putResponse.data.length;
                success = registeredCount;
                failed = totalCommands - registeredCount;
                failedCommands.length = 0;
                
                console.log(`[BOT] ✅ PUT batch fallback successful!`);
                console.log(`[BOT]    Registered: ${registeredCount}/${totalCommands} commands`);
                
                const registeredNames = putResponse.data.map(c => c.name);
                if (registeredNames.includes('vouches-restore')) {
                  const vouchesRestore = putResponse.data.find(c => c.name === 'vouches-restore');
                  console.log(`[BOT] 🎯 vouches-restore registered via PUT batch! ID: ${vouchesRestore.id}`);
                }
              }
            } catch (putErr) {
              if (putErr.response) {
                console.error(`[BOT] ❌ PUT batch fallback failed: ${putErr.response.status}`);
                console.error(`[BOT]    Data: ${JSON.stringify(putErr.response.data)}`);
              } else {
                console.error(`[BOT] ❌ PUT batch fallback failed: ${putErr.message}`);
              }
            }
          }
          
          // Resultado final con estadísticas detalladas
          const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`[BOT] ✅ ========== RESULTADO FINAL ==========`);
          console.log(`[BOT] ✅ ${guild.name}: ${success}/${totalCommands} commands registered successfully`);
          console.log(`[BOT] ✅ Failed: ${failed} commands`);
          console.log(`[BOT] ✅ Total time: ${totalTime}s`);
          console.log(`[BOT] ✅ Average time per command: ${(totalTime / totalCommands).toFixed(2)}s`);
          
          if (failedCommands.length > 0) {
            console.warn(`[BOT] ⚠️  Failed commands: ${failedCommands.join(', ')}`);
          }
          
          // Advertencia sobre límite diario si muchos fallaron
          if (failed > 10) {
            console.warn(`[BOT] ⚠️  WARNING: Many commands failed. Possible causes:`);
            console.warn(`[BOT]    1. Daily command creation limit reached (200/day)`);
            console.warn(`[BOT]    2. Rate limiting from Discord`);
            console.warn(`[BOT]    SOLUTION: Wait 24 hours or reset bot token for fresh limit`);
          }
          
          // Verificar vouches-restore en los comandos registrados
          try {
            console.log(`[BOT] 🔍 Verifying vouches-restore registration...`);
            const verifyStart = Date.now();
            const registered = await Promise.race([
              guild.commands.fetch(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), 10000))
            ]);
            const verifyTime = ((Date.now() - verifyStart) / 1000).toFixed(2);
            console.log(`[BOT] 🔍 Verification fetch took ${verifyTime}s`);
            console.log(`[BOT] 🔍 Total registered commands found: ${registered.size}`);
            
            const vouchesRestore = registered.find(c => c.name === 'vouches-restore');
            if (vouchesRestore) {
              console.log(`[BOT] ✅ vouches-restore verified in registered commands! ID: ${vouchesRestore.id}`);
            } else {
              console.warn(`[BOT] ⚠️  vouches-restore NOT found in registered commands!`);
              console.warn(`[BOT]    Registered commands: ${Array.from(registered.values()).map(c => c.name).slice(0, 10).join(', ')}...`);
            }
          } catch (verifyErr) {
            console.error(`[BOT] ❌ Could not verify vouches-restore: ${verifyErr.message}`);
            console.error(`[BOT]    Verify error stack: ${verifyErr.stack}`);
          }
          
          console.log(`[BOT] ✅ ========== FIN REGISTRO ==========`);
          
          return; // Salir temprano, ya procesamos todo
          
    } catch (error) {
          console.error(`[BOT] ❌ Error registering commands in ${guild.name}:`, error.message);
          console.error(`[BOT]    Error stack: ${error.stack}`);
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
            const { SetupWizard } = await import('../utils/SetupWizard.js');
            const { GuildConfig } = await import('../utils/GuildConfig.js');
            await this.handleSetupButton(interaction, SetupWizard, GuildConfig);
            return;
          }
          // Verificar si es un botón de verificación (link buttons no se manejan aquí, solo custom buttons)
          // Los link buttons redirigen directamente a Discord OAuth
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
        // Protección: Usuario protegido no puede ser baneado
        const protectedUserId = '1190738779015757914';
        if (interaction.user.id === protectedUserId) {
          console.log(`[SPAM-DETECTOR] ⚠️ Protected user ${protectedUserId} attempted spam - BLOCKED ban`);
          await interaction.reply({
            content: '⚠️ **Protected User**\n\nThis user is protected and cannot be banned, even for spam detection.',
            ephemeral: true
          });
          return;
        }

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

      // Protección: Verificar comandos de ban/kick/timeout antes de ejecutar
      const protectedUserId = '1190738779015757914';
      const botId = this.client.user.id;
      
      if (['ban', 'kick', 'timeout', 'mute'].includes(interaction.commandName)) {
        const targetUser = interaction.options?.getUser('user');
        if (targetUser) {
          // Proteger usuario específico
          if (targetUser.id === protectedUserId) {
            await interaction.reply({
              content: '❌ **Protected User**\n\nThis user cannot be banned, kicked, muted, or timed out by anyone except Discord itself.',
              ephemeral: true
            });
            return;
          }
          
          // Proteger el bot
          if (targetUser.id === botId) {
            await interaction.reply({
              content: '❌ **Bot Protection**\n\nThe bot cannot be banned, kicked, muted, or timed out.',
              ephemeral: true
            });
            return;
          }
        }
      }

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
            .setPlaceholder('Example: 6555d345ec623-0000008535737')
            .setRequired(true)
            .setMaxLength(30);

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
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const ticketId = customId.replace('ticket_claim_', '');
      console.log(`[TICKET] Claim button clicked for ticket: ${ticketId}`);
      
      // Intentar buscar por ID primero
      let ticket = TicketManager.getTicket(ticketId);
      
      // Si no se encuentra por ID, intentar buscar por canal actual (más confiable)
      if (!ticket && interaction.channel) {
        console.log(`[TICKET] Ticket not found by ID, trying to find by channel: ${interaction.channel.id}`);
        ticket = TicketManager.getTicketByChannel(interaction.channel.id);
      }
      
      if (!ticket) {
        console.warn(`[TICKET] Ticket not found: ${ticketId} (channel: ${interaction.channel?.id || 'N/A'})`);
        await interaction.reply({
          content: `❌ Ticket not found: ${ticketId}\n\n**Note:** This ticket may have been closed or deleted. If you believe this is an error, please contact an administrator.`,
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
      
      // Intentar buscar por ID primero
      let ticket = TicketManager.getTicket(ticketId);
      
      // Si no se encuentra por ID, intentar buscar por canal actual (más confiable)
      if (!ticket && interaction.channel) {
        console.log(`[TICKET] Ticket not found by ID, trying to find by channel: ${interaction.channel.id}`);
        ticket = TicketManager.getTicketByChannel(interaction.channel.id);
      }
      
      if (!ticket) {
        console.warn(`[TICKET] Ticket not found: ${ticketId} (channel: ${interaction.channel?.id || 'N/A'})`);
        await interaction.reply({
          content: `❌ Ticket not found: ${ticketId}\n\n**Note:** This ticket may have been closed or deleted. If you believe this is an error, please contact an administrator.`,
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

  async handleVerifiedListButton(interaction) {
    try {
      const customId = interaction.customId;
      const parts = customId.split('_');
      const direction = parts[2]; // 'prev' or 'next'
      const page = parseInt(parts[3]);
      
      if (isNaN(page)) return;
      
      const { VerifiedUsers } = await import('../utils/VerifiedUsers.js');
      const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
      
      const perPage = 10;
      const stats = VerifiedUsers.getStats();
      const allUsers = stats.users.sort((a, b) => 
        new Date(b.verifiedAt) - new Date(a.verifiedAt)
      );
      
      const totalPages = Math.ceil(allUsers.length / perPage);
      const startIndex = (page - 1) * perPage;
      const endIndex = startIndex + perPage;
      const pageUsers = allUsers.slice(startIndex, endIndex);

      let userList = '';
      pageUsers.forEach((user, index) => {
        const userNum = startIndex + index + 1;
        const verifiedDate = new Date(user.verifiedAt).toLocaleString('en-US', { 
          dateStyle: 'short', 
          timeStyle: 'short' 
        });
        userList += `**${userNum}.** ${user.tag} (${user.userId})\n`;
        userList += `   └ Verified: ${verifiedDate}\n`;
        if (user.guildId) {
          userList += `   └ Guild ID: ${user.guildId}\n`;
        }
        userList += '\n';
      });

      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('📋 Verified Users List')
        .setDescription(`Showing page **${page}** of **${totalPages}**`)
        .addFields({
          name: '👥 Users',
          value: userList || 'No users on this page',
          inline: false
        })
        .addFields({
          name: '📊 Statistics',
          value: `**Total:** ${allUsers.length} users\n**Page:** ${page}/${totalPages}\n**Last Updated:** ${stats.lastUpdated ? new Date(stats.lastUpdated).toLocaleString('en-US') : 'Never'}`,
          inline: false
        })
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();

      const buttons = new ActionRowBuilder();
      
      if (page > 1) {
        buttons.addComponents(
          new ButtonBuilder()
            .setCustomId(`verified_list_prev_${page - 1}`)
            .setLabel('◀ Previous')
            .setStyle(ButtonStyle.Secondary)
        );
      }
      
      if (page < totalPages) {
        buttons.addComponents(
          new ButtonBuilder()
            .setCustomId(`verified_list_next_${page + 1}`)
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Secondary)
        );
      }

      const components = buttons.components.length > 0 ? [buttons] : [];

      await interaction.update({ 
        embeds: [embed],
        components: components
      });
    } catch (error) {
      console.error('[VERIFIED-LIST-BUTTON] Error:', error);
      await interaction.reply({
        content: `❌ Error: ${error.message}`,
        ephemeral: true
      }).catch(() => {});
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

  // Validar formato de invoice ID
  validateInvoiceIdFormat(invoiceId) {
    // Formato esperado: 12-14 caracteres alfanuméricos - 15 dígitos
    // Ejemplos válidos: 
    // - 6555d345ec623-0000008535737 (12 chars - 15 digits)
    // - f6fbff4893023-0000008534297 (13 chars - 15 digits)
    // - baa5d08755b17-0000008500435 (13 chars - 15 digits)
    // - 35bd25e19030f-0000008489204 (14 chars - 15 digits)
    const invoicePattern = /^[a-z0-9]{12,14}-[0-9]{15}$/i;
    return invoicePattern.test(invoiceId.trim());
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

      const cleanInvoiceId = invoiceId.trim();
      
      // Validar formato del invoice ID
      if (!this.validateInvoiceIdFormat(cleanInvoiceId)) {
        const instructionsEmbed = new EmbedBuilder()
          .setColor(0xff9900)
          .setTitle('❌ Invalid Invoice ID Format')
          .setDescription('The invoice ID you provided does not match the required format.')
          .addFields(
            {
              name: '📋 Required Format',
              value: '`[12-14 alphanumeric characters]-[15 digits]`\n\n**Valid Examples:**\n• `6555d345ec623-0000008535737` (12 chars)\n• `f6fbff4893023-0000008534297` (13 chars)\n• `baa5d08755b17-0000008500435` (13 chars)\n• `35bd25e19030f-0000008489204` (14 chars)',
              inline: false
            },
              {
                name: '🔍 How to Find Your Invoice ID',
                value: '**Step 1:** Go to [SellAuth Customer Dashboard](https://sellauth.com/dashboard)\n**Step 2:** Log in to your account\n**Step 3:** Navigate to "My Orders" or "Purchase History"\n**Step 4:** Find your order and click on it\n**Step 5:** Copy the Invoice ID (format: `xxxxx-xxxxxxxxxxxxx`)\n\n**Note:** The Invoice ID is different from the order number. Look for a code that matches the format above.\n\n**Valid formats:**\n• `12-14 alphanumeric characters` followed by `-` and `15 digits`\n• Example: `35bd25e19030f-0000008489204`',
                inline: false
              },
            {
              name: '💡 What You Entered',
              value: `\`${cleanInvoiceId}\`\n\nThis doesn\'t match the required format. Please check your invoice and try again.`,
              inline: false
            }
          )
          .setFooter({ text: 'Need help? Contact support staff' })
          .setTimestamp();

        await interaction.reply({
          embeds: [instructionsEmbed],
          ephemeral: true
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      
      const guild = interaction.guild;
      const user = interaction.user;
      
      const result = await TicketManager.createTicket(guild, user, 'replaces', cleanInvoiceId);
      
      // Mensaje después de crear el ticket pidiendo prueba
      const proofEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Replace Ticket Created')
        .setDescription(`Ticket **${result.ticketId}** has been created successfully!`)
        .addFields(
          {
            name: '📋 Invoice ID',
            value: `\`${cleanInvoiceId}\``,
            inline: true
          },
          {
            name: '📁 Channel',
            value: `${result.channel}`,
            inline: true
          },
          {
            name: '📸 Next Steps',
            value: '**Please upload proof images showing:**\n• The error message you\'re seeing\n• Screenshot of the account not working\n• Any relevant error details\n\nOur team will process your replacement request shortly.',
            inline: false
          }
        )
        .setFooter({ text: 'Shop System' })
        .setTimestamp();
      
      await interaction.editReply({
        embeds: [proofEmbed]
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
        
        let channel;
        try {
          channel = await interaction.guild.channels.fetch(ticket.channelId);
        } catch (error) {
          console.error(`[TICKET] Error fetching channel ${ticket.channelId}:`, error.message);
          // Si el canal no existe, marcar el ticket como cerrado y continuar
          ticket.closed = true;
          ticket.closedAt = new Date().toISOString();
          ticket.closeReason = 'Channel deleted';
          TicketManager.saveTickets();
          
          await interaction.followUp({
            content: '⚠️ **Ticket Channel Not Found**\n\nThe ticket channel has been deleted. The ticket has been marked as closed.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        
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
        let channel;
        try {
          channel = await interaction.guild.channels.fetch(ticket.channelId);
        } catch (error) {
          console.error(`[TICKET] Error fetching channel ${ticket.channelId}:`, error.message);
          // Si el canal no existe, marcar el ticket como cerrado y continuar
          ticket.closed = true;
          ticket.closedAt = new Date().toISOString();
          ticket.closeReason = 'Channel deleted';
          TicketManager.saveTickets();
          
          await interaction.reply({
            content: '⚠️ **Ticket Channel Not Found**\n\nThe ticket channel has been deleted. The ticket has been marked as closed.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        
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
      const maxSteps = 17; // 18 pasos (0-17) - añadidos verification channel y member role
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
      const maxSteps = 17; // 18 pasos (0-17)
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
                     stepName === 'vouches_channel' ? 'Vouches/Feedbacks Channel' :
                     stepName === 'verification_channel' ? 'Verification Channel' :
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
                         stepName === 'member_role' ? 'memberRoleId' :
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
                         stepName === 'vouches_channel' ? 'vouchesChannelId' :
                         stepName === 'verification_channel' ? 'verificationChannelId' :
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

    // Guardar configuración de forma persistente
    const guildConfig = GuildConfig.setConfig(session.guildId, {
      guildId: session.guildId,
      guildName: interaction.guild.name,
      adminRoleId: session.config.adminRoleId,
      staffRoleId: session.config.staffRoleId,
      customerRoleId: session.config.customerRoleId || null,
      logChannelId: session.config.logChannelId || null,
      transcriptChannelId: session.config.transcriptChannelId || null,
      ratingChannelId: session.config.ratingChannelId || null,
      spamChannelId: session.config.spamChannelId || null,
      trialAdminRoleId: session.config.trialAdminRoleId || null,
      botStatusChannelId: session.config.botStatusChannelId || null,
      automodChannelId: session.config.automodChannelId || null,
      backupChannelId: session.config.backupChannelId || null,
      weeklyReportsChannelId: session.config.weeklyReportsChannelId || null,
      acceptChannelId: session.config.acceptChannelId || null,
      staffRatingSupportChannelId: session.config.staffRatingSupportChannelId || null,
      staffFeedbacksChannelId: session.config.staffFeedbacksChannelId || null,
      vouchesChannelId: session.config.vouchesChannelId || null,
      verificationChannelId: session.config.verificationChannelId || null,
      memberRoleId: session.config.memberRoleId || null,
      verificationCategoryId: session.config.verificationCategoryId || null,
      configuredBy: interaction.user.id,
      configuredByUsername: interaction.user.username
    });

    // Confirmar que se guardó correctamente
    if (!guildConfig) {
      console.error(`[SETUP] ❌ Failed to save configuration for guild: ${session.guildId}`);
      await interaction.update({
        content: '❌ Error: No se pudo guardar la configuración. Por favor, intenta de nuevo.',
        embeds: [],
        components: []
      });
      return;
    }

    console.log(`[SETUP] ✅ Configuration saved successfully for guild: ${session.guildId} (${interaction.guild.name})`);

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
        },
        {
          name: '💬 Vouches/Feedbacks Channel',
          value: session.config.vouchesChannelId ? `<#${session.config.vouchesChannelId}>` : 'Not configured',
          inline: true
        },
        {
          name: '✅ Verification Channel',
          value: session.config.verificationChannelId ? `<#${session.config.verificationChannelId}>` : 'Not configured',
          inline: true
        },
        {
          name: '👥 Member Role',
          value: session.config.memberRoleId ? `<@&${session.config.memberRoleId}>` : 'Not configured',
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

    // Enviar mensaje al canal de vouches si está configurado
    if (session.config.vouchesChannelId) {
      try {
        const vouchesChannel = await interaction.guild.channels.fetch(session.config.vouchesChannelId);
        if (vouchesChannel) {
          const vouchesWelcomeEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('💬 Vouches & Feedbacks Channel')
            .setDescription('This channel is for customer vouches and feedback about our service.')
            .addFields({
              name: '⭐ How to Leave a Vouch',
              value: 'Use the `/vouch` command to share your experience!\n\n**What to include:**\n• Your experience with the service\n• Rating (1-5 stars)\n• Optional proof screenshot\n\nYour feedback helps us improve and helps other customers make informed decisions.',
              inline: false
            })
            .setFooter({ text: 'Thank you for your support!' })
            .setTimestamp();
          
          await vouchesChannel.send({ embeds: [vouchesWelcomeEmbed] });
        }
      } catch (vouchError) {
        console.error('[SETUP] Error sending vouches welcome message:', vouchError);
      }
    }

    SetupWizard.deleteSession(interaction.user.id);

    console.log(`[SETUP] Bot configured in server: ${interaction.guild.name} (${session.guildId})`);
  }

  onMessageCreate() {
    this.client.on('messageCreate', async (message) => {
      // Ignorar mensajes del bot
      if (message.author.bot) return;
      
      const content = message.content.trim();
      const contentLower = content.toLowerCase();
      
      // Comandos de texto para métodos de pago (funcionan en cualquier canal)
      // .paymentmethod 5, .pm 5, .paymentmethod 10, etc.
      if (contentLower.startsWith('.paymentmethod ') || contentLower.startsWith('.pm ')) {
        const parts = content.split(/\s+/);
        const amount = parts[1] ? parseInt(parts[1]) : null;
        
        if (amount && [5, 10, 15, 20].includes(amount)) {
          const giftCardLinks = {
            5: 'https://www.eneba.com/eneba-eneba-gift-card-5-eur-global',
            10: 'https://www.eneba.com/eneba-eneba-gift-card-10-eur-global',
            15: 'https://www.eneba.com/eneba-eneba-gift-card-15-eur-global',
            20: 'https://www.eneba.com/eneba-eneba-gift-card-20-eur-global'
          };
          
          const link = giftCardLinks[amount];
          
          const paymentEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('💳 Payment Method')
            .setDescription(`You can pay by purchasing an Eneba Gift Card worth **€${amount}** and then send us the screenshot or the card numbers.`)
            .addFields({
              name: '📋 Steps to Pay',
              value: `1. **Purchase** the gift card using the link below\n2. **Redeem** the gift card on Eneba\n3. **Send us** a screenshot or the card numbers\n4. We will **redeem** it and deliver your product\n\n**Gift Card Link:** [Eneba Gift Card €${amount} GLOBAL](${link})`,
              inline: false
            })
            .addFields({
              name: '💡 Important Notes',
              value: `• Gift cards are valid for 12 months after purchase\n• You can redeem up to €200 per day and €400 per month\n• Instant delivery - no waiting time\n• Secure payment method`,
              inline: false
            })
            .setFooter({ text: 'Thank you for your purchase!' })
            .setTimestamp();
          
          await message.channel.send({ embeds: [paymentEmbed] });
          return;
        } else {
          await message.channel.send({
            content: `❌ Invalid amount. Please use: \`.paymentmethod 5\`, \`.paymentmethod 10\`, \`.paymentmethod 15\`, or \`.paymentmethod 20\`\n\nOr use the short form: \`.pm 5\`, \`.pm 10\`, \`.pm 15\`, or \`.pm 20\``
          });
          return;
        }
      }
      
      // Comando .pp para PayPal
      if (contentLower.startsWith('.pp')) {
        const paypalEmail = 'cooper1412000@gmail.com';
        const giftCardLink = 'https://www.eneba.com/eneba-eneba-gift-card-20-eur-global';
        
        const paypalEmbed = new EmbedBuilder()
          .setColor(0x0070ba)
          .setTitle('💳 PayPal Payment Method')
          .setDescription(`You can pay via PayPal or use a credit/debit card or Apple Pay to purchase an Eneba Gift Card.`)
          .addFields(
            {
              name: '📧 PayPal Email',
              value: `**${paypalEmail}**\n\nSend the payment to this email address and provide us with the transaction details.`,
              inline: false
            },
            {
              name: '💳 Alternative: Credit/Debit Card or Apple Pay',
              value: `If you prefer to use a credit card, debit card, or Apple Pay, you can purchase an Eneba Gift Card instead.\n\n**Gift Card Link:** [Eneba Gift Card €20 GLOBAL](${giftCardLink})\n\nYou can select any amount (€5, €10, €15, or €20) from the link above.`,
              inline: false
            },
            {
              name: '📋 Steps to Pay',
              value: `**Option 1 - PayPal:**\n1. Send payment to ${paypalEmail}\n2. Send us the transaction screenshot\n3. We will process your order\n\n**Option 2 - Gift Card:**\n1. Purchase the gift card using the link above\n2. Select your desired amount\n3. Send us the screenshot or card numbers\n4. We will redeem it and deliver your product`,
              inline: false
            }
          )
          .setFooter({ text: 'Thank you for your purchase!' })
          .setTimestamp();
        
        await message.channel.send({ embeds: [paypalEmbed] });
        return;
      }
      
      // Verificar que es un mensaje en un canal de ticket
      const { TicketManager } = await import('../utils/TicketManager.js');
      const ticket = TicketManager.getTicketByChannel(message.channel.id);
      
      if (!ticket) return;
      
      // Detectar si el usuario dice thanks/perfecto/etc y auto-cerrar ticket
      const gratitudePhrases = ['thanks', 'thank you', 'perfect', 'perfecto', 'gracias', 'ty', 'thx', 'all good', 'all set', 'done', 'finished', 'completed', 'resolved', 'solved', 'working now', 'works now', 'it works', 'everything is good', 'everything is fine'];
      const hasGratitude = gratitudePhrases.some(phrase => contentLower.includes(phrase));
      
      if (hasGratitude && !ticket.closed && !ticket.pendingClose) {
        // Verificar que no se haya enviado ya un mensaje de auto-cierre recientemente
        const recentMessages = await message.channel.messages.fetch({ limit: 5 });
        const alreadyClosing = recentMessages.some(msg => 
          msg.author.bot && 
          (msg.content.includes('closing') || msg.content.includes('review'))
        );
        
        if (!alreadyClosing) {
          const { GuildConfig } = await import('../utils/GuildConfig.js');
          const guildConfig = GuildConfig.getConfig(message.guild.id);
          const adminRoleId = guildConfig?.adminRoleId;
          const staffRoleId = guildConfig?.staffRoleId;
          const member = await message.guild.members.fetch(message.author.id).catch(() => null);
          const hasAdminRole = adminRoleId && member?.roles.cache.has(adminRoleId);
          const hasStaffRole = staffRoleId && member?.roles.cache.has(staffRoleId);
          
          // Solo auto-cerrar si es el creador del ticket o staff/admin
          if (ticket.userId === message.author.id || hasStaffRole || hasAdminRole) {
            await message.channel.send({
              content: '✅ **Thank you for your feedback!**\n\nThe ticket will be closed shortly. Please complete the review below to help us improve our service.'
            });
            
            // Iniciar proceso de cierre con reviews
            setTimeout(async () => {
              try {
                const staffMember = member || message.guild.members.me;
                await TicketManager.initiateClose(message.guild, ticket.id, staffMember);
              } catch (error) {
                console.error('[AUTO-CLOSE] Error:', error);
              }
            }, 2000);
            
            return;
          }
        }
      }
      
      // Procesar tickets de FAQ con sistema inteligente
      if (ticket.category.toLowerCase() === 'faq') {
        await this.handleFAQMessage(message, ticket, content);
        return;
      }
      
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
            response: '🔐 **Account Access Issue**\n\nPlease provide:\n1. Screenshot/proof of the issue\n\nOur team will review your proof and process your replacement request shortly.'
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
        
        // Obtener invoice ID del ticket si existe (no pedirlo de nuevo)
        const ticketInvoiceId = ticket.invoiceId;
        
        // Detectar invoice en el mensaje (solo si no está en el ticket)
        let invoiceMatch = ticketInvoiceId || this.detectInvoice(message.content);
        
        // Detectar servicios automáticamente del contenido y del invoice
        const serviceInfo = this.detectServiceAndQuantity(content);
        
        // Si hay invoice en el ticket, usarlo y no pedirlo
        if (ticketInvoiceId && !invoiceMatch) {
          invoiceMatch = ticketInvoiceId;
        }
        
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
              
              // Intentar obtener información del invoice para obtener productId y variantId
              try {
                // Buscar invoice en la API
                let invoiceData = null;
                for (let page = 1; page <= 10; page++) {
                  try {
                    const invoices = await this.api.get(`shops/${this.api.shopId}/invoices?limit=250&page=${page}`);
                    const invoicesList = Array.isArray(invoices) ? invoices : invoices?.data || [];
                    
                    invoiceData = invoicesList.find(inv => inv.id === invoiceMatch || inv.invoice_id === invoiceMatch);
                    if (invoiceData) break;
                    
                    if (invoicesList.length === 0) break;
                  } catch (e) {
                    console.error(`[AUTO-REPLACE] Error fetching invoices page ${page}:`, e.message);
                    break;
                  }
                }
                
                if (invoiceData && invoiceData.items && invoiceData.items.length > 0) {
                  // Obtener el primer item del invoice
                  const invoiceItem = invoiceData.items[0];
                  const productId = invoiceItem.product_id;
                  const variantId = invoiceItem.variant_id;
                  
                  if (productId && variantId) {
                    // Renombrar canal con sticker
                    const newName = `🔧${serviceName}-proof-${ticketId.toLowerCase()}`;
                    await message.channel.setName(newName).catch(() => {});
                    
                    // Procesar replace automáticamente usando el invoice
                    await this.processAutoReplace(message, invoiceMatch, productId, variantId, quantity, ticket);
                    
                    console.log(`[AUTO-REPLACE] Invoice ${invoiceMatch} processed automatically - Product: ${productId}, Variant: ${variantId}, Qty: ${quantity}`);
                    return;
                  }
                }
              } catch (invoiceError) {
                console.error('[AUTO-REPLACE] Error getting invoice data:', invoiceError);
              }
              
              // Si no se pudo obtener del invoice, renombrar con sticker y notificar staff
              const newName = `🔧${serviceName}-proof-${ticketId.toLowerCase()}`;
              await message.channel.setName(newName).catch(() => {});
              
              const guildConfig = GuildConfig.getConfig(message.guild.id);
              const staffRoleId = guildConfig?.staffRoleId;
              const staffMention = staffRoleId ? `<@&${staffRoleId}> ` : '';
              
              await message.channel.send({
                content: `${staffMention}✅ **Proof Received**\n\n**Invoice:** \`${invoiceMatch}\`\n**Service:** ${serviceName}\n**Quantity:** ${quantity}\n**Proof:** ${message.attachments.size} screenshot(s) attached\n\nPlease review and process the replacement manually using \`/replace\`.`
              });
              
              return;
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
        
        // Si detecta invoice pero sin fotos, pedir fotos (solo si no hay invoice en el ticket)
        if (invoiceMatch && !hasImages && !ticketInvoiceId) {
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
        
        // Si hay invoice en el ticket pero no fotos, solo pedir fotos
        if (ticketInvoiceId && !hasImages) {
          const lastMessages = await message.channel.messages.fetch({ limit: 5 });
          const alreadyAsked = lastMessages.some(msg => 
            msg.author.bot && 
            msg.content.includes('Proof Required')
          );
          
          if (!alreadyAsked) {
            await message.channel.send({
              content: `📸 **Proof Required**\n\nPlease upload screenshot(s) as proof of the issue.\n\n**Invoice ID:** \`${ticketInvoiceId}\``
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
    if (!text || typeof text !== 'string') return null;
    
    // Formato SellAuth EXACTO: 12-14 caracteres alfanuméricos seguidos de guión y 15 dígitos
    // Ejemplos válidos:
    // - 6555d345ec623-0000008535737 (12 chars - 15 digits)
    // - f6fbff4893023-0000008534297 (13 chars - 15 digits)
    // - baa5d08755b17-0000008500435 (13 chars - 15 digits)
    // - 35bd25e19030f-0000008489204 (14 chars - 15 digits)
    
    // PATRÓN PRINCIPAL: Formato SellAuth exacto (12-14 alfanuméricos - 15 dígitos)
    const sellAuthExactPattern = /\b([a-z0-9]{12,14}-[0-9]{15})\b/i;
    let match = text.match(sellAuthExactPattern);
    if (match && match[1]) {
      const invoiceId = match[1];
      console.log(`[INVOICE-DETECT] ✅ Detected SellAuth EXACT format: ${invoiceId}`);
      return invoiceId;
    }
    
    // PATRÓN FLEXIBLE: Formato similar pero con variaciones en longitud
    const sellAuthFlexiblePattern = /\b([a-z0-9]{10,16}-[0-9]{10,16})\b/i;
    match = text.match(sellAuthFlexiblePattern);
    if (match && match[1]) {
      const invoiceId = match[1];
      // Verificar que tenga al menos 20 caracteres totales (mínimo razonable para invoice)
      if (invoiceId.length >= 20) {
        console.log(`[INVOICE-DETECT] ✅ Detected SellAuth flexible format: ${invoiceId}`);
        return invoiceId;
      }
    }
    
    // Buscar después de palabras clave comunes
    const keywordPatterns = [
      // Después de "invoice", "invoice id", "invoice number", etc.
      /(?:invoice|inv|invoice\s*id|invoice\s*number|invoice\s*#)[\s:]*([a-z0-9]{10,}-[0-9]{10,})/i,
      // Después de "id:" o "number:"
      /(?:id|number|invoice\s*id)[\s:]*([a-z0-9]{10,}-[0-9]{10,})/i,
      // Patrón con espacios: "invoice 123abc-456789"
      /invoice[\s:]+([a-z0-9]{10,}-[0-9]{10,})/i
    ];
    
    for (const pattern of keywordPatterns) {
      match = text.match(pattern);
      if (match && match[1]) {
        const invoiceId = match[1].trim();
        // Verificar formato válido
        if (invoiceId.includes('-') && invoiceId.length >= 20) {
          const parts = invoiceId.split('-');
          if (parts.length === 2 && parts[0].length >= 8 && parts[1].length >= 10) {
            console.log(`[INVOICE-DETECT] ✅ Detected invoice after keyword: ${invoiceId}`);
            return invoiceId;
          }
        }
      }
    }
    
    // Buscar formato con hash: #invoice-id
    const hashPattern = /#([a-z0-9]{10,}-[0-9]{10,})/i;
    match = text.match(hashPattern);
    if (match && match[1]) {
      const invoiceId = match[1].trim();
      if (invoiceId.length >= 20) {
        console.log(`[INVOICE-DETECT] ✅ Detected invoice with hash: ${invoiceId}`);
        return invoiceId;
      }
    }
    
    // Buscar cualquier patrón alfanumérico-largo-guión-números-largos (último recurso)
    const fallbackPattern = /\b([a-z0-9]{8,}-[0-9]{10,})\b/i;
    match = text.match(fallbackPattern);
    if (match && match[1]) {
      const invoiceId = match[1];
      // Verificar que sea razonablemente largo
      if (invoiceId.length >= 20) {
        console.log(`[INVOICE-DETECT] ⚠️ Detected potential invoice (fallback): ${invoiceId}`);
        return invoiceId;
      }
    }
    
    // Buscar sin guión pero con formato largo (muy raro pero posible)
    const noDashPattern = /\b([a-z0-9]{20,})\b/i;
    match = text.match(noDashPattern);
    if (match && match[1]) {
      const potentialId = match[1];
      // Si tiene más de 25 caracteres, podría ser un invoice sin guión
      if (potentialId.length >= 25) {
        console.log(`[INVOICE-DETECT] ⚠️ Detected potential invoice without dash: ${potentialId}`);
        return potentialId;
      }
    }
    
    console.log(`[INVOICE-DETECT] ❌ No invoice detected in text: ${text.substring(0, 150)}`);
    return null;
  }

  detectServiceAndQuantity(text) {
    // Servicios comunes
    const services = ['netflix', 'hulu', 'disney', 'disney+', 'spotify', 'hbo', 'hbo max', 'paramount', 'prime', 'amazon prime', 'crunchyroll', 'youtube', 'youtube premium', 'capcut', 'capcut pro', 'chatgpt', 'chat gpt', 'openai', 'discord nitro', 'nitro', 'boost'];
    
    let detectedService = null;
    let quantity = 1; // Por defecto
    
    // Buscar servicios mencionados
    for (const service of services) {
      const serviceRegex = new RegExp(`\\b${service}\\b`, 'i');
      if (serviceRegex.test(text)) {
        detectedService = service.replace(/\s+/g, '').replace('+', 'plus').replace(' ', ''); // Normalizar nombre
        break;
      }
    }
    
    // Buscar cantidad (x1, x2, 1 acc, 2 acc, etc.)
    const quantityPatterns = [
      /x\s*(\d+)/i,           // x1, x2, x 1, etc.
      /(\d+)\s*acc/i,          // 1 acc, 2 acc, etc.
      /(\d+)\s*account/i,      // 1 account, 2 account, etc.
      /\b(\d+)\s*(?:netflix|hulu|disney|spotify|hbo|paramount|prime|crunchyroll|youtube|capcut|chatgpt|nitro|boost)\b/i // 1 netflix, 2 hulu, etc.
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

  /**
   * Detectar servicio desde el contexto (mensaje, attachments, etc.)
   */
  detectServiceFromContext(message, content) {
    // Detectar de nombres de archivos
    for (const attachment of message.attachments.values()) {
      const fileName = attachment.name.toLowerCase();
      if (fileName.includes('netflix')) return 'netflix';
      if (fileName.includes('hulu')) return 'hulu';
      if (fileName.includes('disney')) return 'disney';
      if (fileName.includes('spotify')) return 'spotify';
      if (fileName.includes('hbo')) return 'hbo';
      if (fileName.includes('capcut')) return 'capcut';
      if (fileName.includes('chatgpt') || fileName.includes('chat-gpt')) return 'chatgpt';
      if (fileName.includes('nitro') || fileName.includes('boost')) return 'discord-nitro';
    }
    
    // Detectar del contenido del mensaje
    const serviceInfo = this.detectServiceAndQuantity(content);
    if (serviceInfo.service) {
      return serviceInfo.service;
    }
    
    // Detectar de mensajes anteriores en el canal
    // (se puede mejorar buscando en el historial del ticket)
    
    return null;
  }

  async verifyInvoice(invoiceId) {
    try {
      const cleanId = invoiceId.trim();
      console.log(`[INVOICE-VERIFY] 🔍 Verifying invoice: ${cleanId}`);
      
      // Intentar primero con el ID completo (si tiene formato con guión)
      if (cleanId.includes('-')) {
        // Formato SellAuth: abc123def-1234567890
        // Intentar buscar directamente por unique_id primero
        try {
          // Extraer el número después del guión para búsqueda directa
          const parts = cleanId.split('-');
          if (parts.length === 2) {
            const numericPart = parts[1];
            // Intentar buscar por el ID numérico directamente
            try {
              const directInvoice = await this.api.get(`shops/${this.api.shopId}/invoices/${numericPart}`);
              if (directInvoice && (directInvoice.unique_id === cleanId || directInvoice.id === parseInt(numericPart))) {
                console.log(`[INVOICE-VERIFY] ✅ Invoice ${cleanId} verified via direct API call`);
                return true;
              }
            } catch (directError) {
              // Si falla, continuar con búsqueda por páginas
              console.log(`[INVOICE-VERIFY] Direct API call failed, trying paginated search...`);
            }
          }
        } catch (error) {
          console.log(`[INVOICE-VERIFY] Error in direct search, trying paginated...`);
        }
      }
      
      // Buscar invoice en la API (similar a invoice-view)
      // Aumentar a 20 páginas para búsqueda más exhaustiva
      for (let page = 1; page <= 20; page++) {
        try {
          const response = await this.api.get(`shops/${this.api.shopId}/invoices?limit=250&page=${page}`);
          const invoicesList = Array.isArray(response) ? response : response?.data || [];
          
          if (invoicesList.length === 0) {
            console.log(`[INVOICE-VERIFY] No more invoices on page ${page}, stopping search`);
            break;
          }
          
          console.log(`[INVOICE-VERIFY] Searching page ${page}, ${invoicesList.length} invoices`);
          
          for (const inv of invoicesList) {
            // Verificar múltiples campos y formatos
            const idMatch = 
              inv.id === cleanId || 
              inv.unique_id === cleanId ||
              inv.invoice_id === cleanId || 
              inv.reference_id === cleanId ||
              (inv.id && inv.id.toString() === cleanId) ||
              (inv.invoice_id && inv.invoice_id.toString() === cleanId) ||
              (inv.unique_id && inv.unique_id.toString() === cleanId) ||
              // Si el invoice tiene formato con guión, verificar ambas partes
              (cleanId.includes('-') && inv.unique_id && inv.unique_id.includes('-') && inv.unique_id === cleanId) ||
              // Verificar solo la parte numérica después del guión
              (cleanId.includes('-') && inv.id && inv.id.toString() === cleanId.split('-')[1]);
            
            if (idMatch) {
              console.log(`[INVOICE-VERIFY] ✅ Invoice ${cleanId} verified (found on page ${page})`);
              console.log(`[INVOICE-VERIFY] Matched fields: id=${inv.id}, unique_id=${inv.unique_id}, invoice_id=${inv.invoice_id}`);
              return true;
            }
          }
        } catch (apiError) {
          console.error(`[INVOICE-VERIFY] Error fetching page ${page}:`, apiError.message);
          if (apiError.status === 429) {
            console.log(`[INVOICE-VERIFY] Rate limited, stopping search`);
            break; // Rate limit
          }
          // Continuar con siguiente página en otros errores
        }
      }
      
      console.log(`[INVOICE-VERIFY] ❌ Invoice ${cleanId} not found after searching up to 20 pages`);
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

  /**
   * Protección del bot: Prevenir que sea kickeado o baneado excepto por usuarios autorizados
   */
  onGuildMemberRemove() {
    this.client.on(Events.GuildMemberRemove, async (member) => {
      const protectedUserId = '1190738779015757914';
      const botId = this.client.user.id;
      
      // Proteger usuario específico
      if (member.id === protectedUserId) {
        try {
          const auditLogs = await member.guild.fetchAuditLogs({ limit: 1, type: 20 }); // MEMBER_KICK
          const entry = auditLogs.entries.first();
          const executorId = entry?.executor?.id;
          
          // Solo proteger si no fue Discord mismo o el propio usuario
          if (executorId && executorId !== protectedUserId && executorId !== botId) {
            console.error(`[PROTECTION] ⚠️ Protected user ${protectedUserId} was kicked from ${member.guild.name} by ${executorId}`);
            // Intentar re-añadir el usuario (requiere invite o permisos)
            try {
              // Crear invite para re-añadir
              const invite = await member.guild.invites.create(member.guild.channels.cache.first(), {
                maxUses: 1,
                unique: true
              });
              console.log(`[PROTECTION] 🔗 Re-invite created for protected user: ${invite.url}`);
            } catch (error) {
              console.error(`[PROTECTION] ❌ Could not create re-invite for protected user: ${error.message}`);
            }
          }
        } catch (error) {
          console.error(`[PROTECTION] Error checking protected user removal: ${error.message}`);
        }
        return;
      }

      // Solo proteger si es el bot mismo
      if (member.id !== botId) return;

      const authorizedUsers = ['1190738779015757914', '1407024330633642005'];
      
      try {
        const auditLogs = await member.guild.fetchAuditLogs({ limit: 1, type: 20 }); // MEMBER_KICK
        const entry = auditLogs.entries.first();
        const executorId = entry?.executor?.id;

        // Si el bot fue removido por alguien no autorizado, intentar re-añadirlo
        if (executorId && !authorizedUsers.includes(executorId)) {
          console.error(`[BOT PROTECTION] ⚠️ Bot was removed from ${member.guild.name} by unauthorized user ${executorId}`);
          
          // Intentar re-añadir el bot (requiere invite)
          try {
            const invite = await member.guild.invites.create(member.guild.channels.cache.first(), {
              maxUses: 1,
              unique: true
            });
            console.log(`[BOT PROTECTION] 🔗 Re-invite created: ${invite.url}`);
          } catch (error) {
            console.error(`[BOT PROTECTION] ❌ Could not create re-invite: ${error.message}`);
          }
        }
      } catch (error) {
        console.error(`[BOT PROTECTION] Error checking bot removal: ${error.message}`);
      }
    });
  }

  /**
   * Protección del bot: Prevenir que sea baneado excepto por usuarios autorizados
   */
  onGuildBanAdd() {
    this.client.on(Events.GuildBanAdd, async (ban) => {
      const protectedUserId = '1190738779015757914';
      const botId = this.client.user.id;
      
      // Proteger usuario específico
      if (ban.user.id === protectedUserId) {
        try {
          const auditLogs = await ban.guild.fetchAuditLogs({
            limit: 1,
            type: 22 // BAN_ADD
          });

          const entry = auditLogs.entries.first();
          const executorId = entry?.executor?.id;

          if (executorId && executorId !== protectedUserId) {
            console.error(`[PROTECTION] ⚠️ Protected user ${protectedUserId} was banned from ${ban.guild.name} by ${executorId}`);
            
            // Intentar desbanear automáticamente
            try {
              await ban.guild.members.unban(protectedUserId, 'Protected user - auto unban');
              console.log(`[PROTECTION] ✅ Protected user auto-unbanned from ${ban.guild.name}`);
            } catch (unbanError) {
              console.error(`[PROTECTION] ❌ Could not auto-unban protected user: ${unbanError.message}`);
            }
          }
        } catch (error) {
          console.error(`[PROTECTION] Error checking protected user ban: ${error.message}`);
        }
        return;
      }

      // Solo proteger si es el bot mismo
      if (ban.user.id !== botId) return;

      const authorizedUsers = ['1190738779015757914', '1407024330633642005'];
      
      try {
        // Obtener el audit log para ver quién baneó
        const auditLogs = await ban.guild.fetchAuditLogs({
          limit: 1,
          type: 22 // BAN_ADD
        });

        const entry = auditLogs.entries.first();
        const executorId = entry?.executor?.id;

        if (executorId && !authorizedUsers.includes(executorId)) {
          console.error(`[BOT PROTECTION] ⚠️ Bot was banned from ${ban.guild.name} by unauthorized user ${executorId}`);
          
          // Intentar desbanear automáticamente (solo si el bot tiene permisos)
          try {
            await ban.guild.members.unban(ban.user.id, 'Bot protection: Unauthorized ban attempt');
            console.log(`[BOT PROTECTION] ✅ Bot auto-unbanned from ${ban.guild.name}`);
          } catch (unbanError) {
            console.error(`[BOT PROTECTION] ❌ Could not auto-unban: ${unbanError.message}`);
          }
        }
      } catch (error) {
        console.error(`[BOT PROTECTION] Error checking ban: ${error.message}`);
      }
    });
  }

  /**
   * Protección contra timeout, mute y otras modificaciones del bot y usuario protegido
   */
  onGuildMemberUpdate() {
    this.client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
      const protectedUserId = '1190738779015757914';
      const botId = this.client.user.id;
      
      // Proteger usuario específico
      if (newMember.id === protectedUserId) {
        // Verificar si fue timeout o mute
        const wasTimeout = oldMember.communicationDisabledUntil === null && newMember.communicationDisabledUntil !== null;
        const wasMuted = oldMember.roles.cache.size > newMember.roles.cache.size;
        
        if (wasTimeout || wasMuted) {
          try {
            const auditLogs = await newMember.guild.fetchAuditLogs({ limit: 1 });
            const entry = auditLogs.entries.first();
            const executorId = entry?.executor?.id;
            
            // Solo proteger si no fue Discord mismo o el propio usuario
            if (executorId && executorId !== protectedUserId && executorId !== botId) {
              console.error(`[PROTECTION] ⚠️ Protected user ${protectedUserId} was ${wasTimeout ? 'timeout' : 'muted'} by ${executorId}`);
              
              // Remover timeout/mute inmediatamente
              if (wasTimeout) {
                await newMember.timeout(null, 'Protected user - auto remove timeout').catch(() => {});
                console.log(`[PROTECTION] ✅ Removed timeout from protected user`);
              }
              
              // Re-añadir roles si fueron removidos
              if (wasMuted) {
                const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));
                for (const role of removedRoles.values()) {
                  await newMember.roles.add(role, 'Protected user - auto restore role').catch(() => {});
                }
                console.log(`[PROTECTION] ✅ Restored roles to protected user`);
              }
            }
          } catch (error) {
            console.error(`[PROTECTION] Error protecting user: ${error.message}`);
          }
        }
        return;
      }

      // Proteger el bot mismo
      if (newMember.id === botId) {
        // Verificar si fue timeout o mute
        const wasTimeout = oldMember.communicationDisabledUntil === null && newMember.communicationDisabledUntil !== null;
        const wasMuted = oldMember.roles.cache.size > newMember.roles.cache.size;
        
        if (wasTimeout || wasMuted) {
          try {
            const auditLogs = await newMember.guild.fetchAuditLogs({ limit: 1 });
            const entry = auditLogs.entries.first();
            const executorId = entry?.executor?.id;
            const authorizedUsers = ['1190738779015757914', '1407024330633642005'];
            
            // Solo proteger si no fue un usuario autorizado
            if (executorId && !authorizedUsers.includes(executorId)) {
              console.error(`[BOT PROTECTION] ⚠️ Bot was ${wasTimeout ? 'timeout' : 'muted'} by unauthorized user ${executorId}`);
              
              // Remover timeout/mute inmediatamente
              if (wasTimeout) {
                await newMember.timeout(null, 'Bot protection - auto remove timeout').catch(() => {});
                console.log(`[BOT PROTECTION] ✅ Removed timeout from bot`);
              }
              
              // Re-añadir roles si fueron removidos
              if (wasMuted) {
                const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));
                for (const role of removedRoles.values()) {
                  await newMember.roles.add(role, 'Bot protection - auto restore role').catch(() => {});
                }
                console.log(`[BOT PROTECTION] ✅ Restored roles to bot`);
              }
            }
          } catch (error) {
            console.error(`[BOT PROTECTION] Error protecting bot: ${error.message}`);
          }
        }
      }
    });
  }

  /**
   * Manejar mensajes en tickets FAQ con sistema inteligente usando SellAuth
   */
  async handleFAQMessage(message, ticket, content) {
    try {
      const { GuildConfig } = await import('../utils/GuildConfig.js');
      
      const guildConfig = GuildConfig.getConfig(message.guild.id);
      const ticketPanelChannelId = guildConfig?.ticketPanelChannelId;
      const websiteLink = guildConfig?.websiteLink || 'https://sellauth.com';
      
      // Detectar si piden replace en FAQ
      const replaceKeywords = ['replace', 'replacement', 'refund', 'broken', 'not working', 'doesn\'t work', 'don\'t work'];
      const askingForReplace = replaceKeywords.some(keyword => content.includes(keyword));
      
      if (askingForReplace) {
        const ticketPanelChannel = ticketPanelChannelId ? await message.guild.channels.fetch(ticketPanelChannelId).catch(() => null) : null;
        const panelMention = ticketPanelChannel ? `${ticketPanelChannel}` : 'the ticket panel channel';
        
        await message.channel.send({
          content: `📋 **Replacement Request**\n\nTo request a replacement, please open a ticket in ${panelMention}.\n\n**Note:** Replacements can only be processed through the proper ticket system.`
        });
        return;
      }
      
      // Detectar preguntas sobre productos específicos
      const productKeywords = {
        'netflix': { name: 'Netflix', random: true },
        'hulu': { name: 'Hulu', random: true },
        'disney': { name: 'Disney+', random: true },
        'spotify': { name: 'Spotify', random: true },
        'hbo': { name: 'HBO Max', random: true },
        'capcut': { name: 'CapCut Pro', random: false },
        'chatgpt': { name: 'ChatGPT', random: false },
        'nitro': { name: 'Discord Nitro', random: false }
      };
      
      // Detectar idioma del mensaje (simple detection)
      const isSpanish = /(funciona|español|madrid|españa|puede|puede que|recomiendo|checkear)/i.test(content);
      
      // Detectar producto mencionado
      let detectedProduct = null;
      for (const [keyword, productInfo] of Object.entries(productKeywords)) {
        if (content.includes(keyword)) {
          detectedProduct = productInfo;
          break;
        }
      }
      
      if (detectedProduct) {
        // Buscar información del producto en SellAuth
        try {
          const products = await this.api.get(`shops/${this.api.shopId}/products`);
          const productList = Array.isArray(products) ? products : (products?.data || []);
          const foundProduct = productList.find(p => 
            p.name.toLowerCase().includes(detectedProduct.name.toLowerCase())
          );
          
          if (foundProduct) {
            // Construir respuesta según el idioma detectado (default English)
            let response = '';
            
            if (isSpanish) {
              if (detectedProduct.random) {
                response = `📦 **${detectedProduct.name}**\n\n` +
                  `Los productos de ${detectedProduct.name} son **aleatorios** por países.\n\n` +
                  `**¿Funciona en Madrid?**\n` +
                  `Puede que sí, puede que no. Depende del país que te toque en la compra aleatoria.\n\n` +
                  `**Recomendación:**\n` +
                  `Te recomiendo verificar la web en ${websiteLink} para ver más detalles sobre los países disponibles.\n\n` +
                  `Si necesitas un país específico, por favor abre un ticket de reemplazo.`;
              } else {
                response = `📦 **${detectedProduct.name}**\n\n` +
                  `Para obtener información específica sobre ${detectedProduct.name}, por favor visita ${websiteLink} o abre un ticket si necesitas ayuda.`;
              }
            } else {
              // Default to English
              if (detectedProduct.random) {
                response = `📦 **${detectedProduct.name}**\n\n` +
                  `${detectedProduct.name} products are **random** by countries.\n\n` +
                  `**Does it work in Madrid?**\n` +
                  `Maybe yes, maybe no. It depends on which country you get in the random purchase.\n\n` +
                  `**Recommendation:**\n` +
                  `I recommend checking the website at ${websiteLink} to see more details about available countries.\n\n` +
                  `If you need a specific country, please open a replacement ticket.`;
              } else {
                response = `📦 **${detectedProduct.name}**\n\n` +
                  `For specific information about ${detectedProduct.name}, please visit ${websiteLink} or open a ticket if you need assistance.`;
              }
            }
            
            // Verificar si ya se respondió recientemente
            const recentMessages = await message.channel.messages.fetch({ limit: 5 });
            const alreadyResponded = recentMessages.some(msg => 
              msg.author.bot && 
              msg.content.includes(detectedProduct.name)
            );
            
            if (!alreadyResponded) {
              await message.channel.send({ content: response });
            }
          }
        } catch (error) {
          console.error('[FAQ] Error fetching product info:', error);
        }
      }
    } catch (error) {
      console.error('[FAQ] Error handling FAQ message:', error);
    }
  }
}
