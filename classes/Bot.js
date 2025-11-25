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
      this.registerSlashCommands();
      
      // Initialize all automated systems
      this.initializeAutomatedSystems();
    });

    this.client.on('warn', (info) => console.log(info));
    this.client.on('error', (error) => {
      console.error('[BOT ERROR]', error.message);
    });

    this.onInteractionCreate();
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
    try {
      const rest = new REST({ version: '9' }).setToken(config.BOT_TOKEN);

      const commandFiles = readdirSync(join(__dirname, '..', 'commands'))
        .filter((file) => file.endsWith('.js') && !file.endsWith('.map'));

      for (const file of commandFiles) {
        try {
          const commandPath = pathToFileURL(join(__dirname, '..', 'commands', `${file}`)).href;
          const command = await import(commandPath);

          if (command.default && command.default.data) {
            this.slashCommands.push(command.default.data.toJSON());
            this.slashCommandsMap.set(command.default.data.name, command.default);
          }
        } catch (err) {
          console.error(`[BOT] Error loading command ${file}:`, err.message);
        }
      }

      console.log(`[BOT] 📤 Registering ${this.slashCommands.length} slash commands...`);

      // First clear old commands to avoid conflicts
      if (config.BOT_GUILD_ID) {
        try {
          console.log('[BOT] 🧹 Clearing old commands...');
          await rest.put(Routes.applicationGuildCommands(this.client.user.id, config.BOT_GUILD_ID), {
            body: []
          });
          console.log('[BOT] ✅ Old commands cleared');
        } catch (e) {
          console.warn('[BOT] ⚠️ Could not clear old commands:', e.message);
        }

        // Register new commands
        await rest.put(Routes.applicationGuildCommands(this.client.user.id, config.BOT_GUILD_ID), {
          body: this.slashCommands
        });
      } else {
        try {
          console.log('[BOT] 🧹 Clearing old commands...');
          await rest.put(Routes.applicationCommands(this.client.user.id), { body: [] });
          console.log('[BOT] ✅ Old commands cleared');
        } catch (e) {
          console.warn('[BOT] ⚠️ Could not clear old commands:', e.message);
        }

        // Register new commands
        await rest.put(Routes.applicationCommands(this.client.user.id), { body: this.slashCommands });
      }

      console.log(`[BOT] ✅ All ${this.slashCommands.length} slash commands registered successfully`);
    } catch (error) {
      console.error('[BOT] Error registering slash commands:', error.message);
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
