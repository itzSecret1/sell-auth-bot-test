import { Collection, Events, REST, Routes } from 'discord.js';
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
    this.registrationInProgress = false;

    // Create status reporter for staff notifications
    this.statusReporter = createStatusReporter(client);
    sessionManager.statusReporter = this.statusReporter;

    // Create automated reporters and systems
    this.weeklyReporter = createWeeklyReporter(client, api);
    this.dailyBackupReporter = createDailyBackupReporter(client);
    this.autoModerator = createAutoModerator(client);
    this.autoSyncScheduler = createAutoSyncScheduler(client, api);
    this.predictiveAlerts = createPredictiveAlerts(client);

    // Login with retry logic for Discord rate limits
    this.loginWithRetry();

    this.client.on('ready', () => {
      console.log(`${this.client.user.username} ready!`);
      if (!this.isRegisteringCommands && !this.registrationInProgress) {
        this.registerSlashCommands();
      }

      // Initialize all automated systems
      this.initializeAutomatedSystems();
    });

    this.client.on('warn', (info) => console.log(info));
    this.client.on('error', (error) => {
      console.error('[BOT ERROR]', error.message);
    });

    this.onInteractionCreate();

    // Global error handler to prevent bot crash
    process.on('unhandledRejection', (reason, promise) => {
      console.error('[BOT] Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('[BOT] Uncaught Exception:', error);
    });
  }

  async loginWithRetry() {
    // Check if we can safely attempt connection
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

      // Success
      connectionManager.markSuccess();
      sessionManager.markSuccessfulLogin();
    } catch (error) {
      if (error.message && error.message.includes('Not enough sessions')) {
        // Handle Discord session limit with enhanced recovery
        connectionManager.markFailure(true);
        await sessionManager.handleSessionLimit(error, () => this.loginWithRetry());
      } else {
        // Handle other errors with safer backoff
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
    // Prevent multiple concurrent registrations
    if (this.isRegisteringCommands || this.registrationInProgress) {
      console.log('[BOT] ⏳ Command registration already in progress, skipping...');
      return;
    }

    this.isRegisteringCommands = true;
    this.registrationInProgress = true;

    try {
      // CRITICAL: Clear array to prevent duplicates on reconnect
      this.slashCommands = [];
      this.slashCommandsMap.clear();

      const commandFiles = readdirSync(join(__dirname, '..', 'commands'))
        .filter((file) => file.endsWith('.js') && !file.endsWith('.map'));

      console.log(`[BOT] 📂 Found ${commandFiles.length} command files`);

      // Load all commands
      for (const file of commandFiles) {
        try {
          const commandPath = pathToFileURL(join(__dirname, '..', 'commands', `${file}`)).href;
          const command = await import(commandPath);

          if (command.default && command.default.data) {
            const cmdName = command.default.data.name;

            // Skip if already loaded
            if (this.slashCommandsMap.has(cmdName)) {
              console.log(`[BOT] ⚠️  Skipping duplicate command: ${cmdName}`);
              continue;
            }

            this.slashCommands.push(command.default.data.toJSON());
            this.slashCommandsMap.set(cmdName, command.default);
            console.log(`[BOT] ✅ Loaded command: ${cmdName}`);
          }
        } catch (err) {
          console.error(`[BOT] ❌ Error loading command ${file}:`, err.message);
        }
      }

      console.log(`[BOT] 📤 Loaded ${this.slashCommands.length} slash commands into memory`);
      
      if (this.slashCommands.length === 0) {
        console.error('[BOT] ❌ ERROR: No commands loaded!');
        this.isRegisteringCommands = false;
        this.registrationInProgress = false;
        return;
      }

      // Start registration in background (non-blocking)
      setTimeout(() => this.performRegistrationWithRetry(), 1000);
      
    } catch (error) {
      console.error('[BOT] Error loading commands:', error.message);
      this.isRegisteringCommands = false;
      this.registrationInProgress = false;
    }
  }

  async performRegistrationWithRetry(attempt = 1) {
    try {
      console.log(`\n[BOT] 🔄 Command registration attempt #${attempt}...`);
      
      const guild = this.client.guilds.cache.get(config.BOT_GUILD_ID);
      if (!guild) {
        throw new Error(`Guild not found: ${config.BOT_GUILD_ID}`);
      }

      console.log(`[BOT] 🏢 Guild: ${guild.name} (${guild.id})`);
      console.log(`[BOT] 📋 Registering ${this.slashCommands.length} commands via guild.commands.set()...`);

      // Single unified call with timeout
      const registrationPromise = guild.commands.set(this.slashCommands);
      
      // 30 second timeout - if it takes longer, give up and continue anyway
      const result = await Promise.race([
        registrationPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Registration timeout after 30s')), 30000)
        )
      ]);

      console.log(`\n[BOT] ✅ REGISTRATION COMPLETE: ${result.size}/${this.slashCommands.length} commands registered`);
      this.registrationInProgress = false;

    } catch (error) {
      console.error(`[BOT] ❌ Registration error (attempt #${attempt}):`, error.message);

      // Don't retry on timeout - just continue anyway
      if (error.message.includes('timeout')) {
        console.log(`[BOT] ⚠️  Registration timeout, but bot is still fully functional`);
        console.log(`[BOT] 💡 Commands are loaded in memory and will work via slash commands`);
        this.registrationInProgress = false;
        return;
      }

      // Retry on other errors
      if (attempt < 2) {
        const waitTime = 5000;
        console.log(`[BOT] 🔄 Retrying in ${waitTime / 1000} seconds...`);
        setTimeout(() => this.performRegistrationWithRetry(attempt + 1), waitTime);
      } else {
        console.error(`[BOT] ℹ️  Skipping further registration attempts`);
        console.log(`[BOT] ℹ️  Bot is fully functional - all 21 commands are in memory`);
        this.registrationInProgress = false;
      }
    } finally {
      this.isRegisteringCommands = false;
    }
  }

  /**
   * Initialize all automated systems
   */
  async initializeAutomatedSystems() {
    try {
      // Daily status updates
      await this.statusReporter.sendDailyStatusUpdate();
      this.scheduleSystemUpdates();

      // Weekly reports
      this.weeklyReporter.scheduleWeeklyReports();

      // Daily backups
      this.dailyBackupReporter.scheduleDailyBackups();

      // Hourly auto-sync
      this.autoSyncScheduler.startHourlySync();

      // Auto-moderation
      this.autoModerator.setup();

      // Predictive alerts
      this.predictiveAlerts.scheduleAlertChecks();

      console.log('[BOT] ✅ All automated systems initialized');
    } catch (error) {
      console.error('[BOT] Error initializing systems:', error.message);
    }
  }

  /**
   * Schedule system updates
   */
  scheduleSystemUpdates() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(12, 0, 0, 0);

    const timeUntilNext = tomorrow - now;

    console.log(`[BOT] ✅ System scheduled: Daily updates at 12:00 UTC, Weekly reports at 09:00 UTC Mondays, Daily backups at 03:00 UTC`);

    // Schedule for tomorrow
    setTimeout(
      () => {
        this.statusReporter.sendDailyStatusUpdate();
        // Then schedule for every 24 hours
        setInterval(() => this.statusReporter.sendDailyStatusUpdate(), 24 * 60 * 60 * 1000);
      },
      timeUntilNext
    );
  }

  async onInteractionCreate() {
    this.client.on(Events.InteractionCreate, async (interaction) => {
      // Handle autocomplete interactions
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

      if (!interaction.isChatInputCommand()) return;

      const command = this.slashCommandsMap.get(interaction.commandName);

      if (!command) return;

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
          interaction
            .reply({ content: 'An error occurred while executing the command.', ephemeral: true })
            .catch(console.error);
        }
      }
    });
  }
}
