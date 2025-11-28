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
    });

    this.client.on('warn', (info) => console.log(info));
    this.client.on('error', (error) => {
      console.error('[BOT ERROR]', error.message);
    });

    this.onInteractionCreate();

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
      const guild = await this.client.guilds.fetch(config.BOT_GUILD_ID);
      
      console.log(`[BOT] 📋 Using guild.commands.create() individually...`);
      
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
          console.log(`[BOT] ✅ Created: ${cmd.name}`);
          await new Promise(r => setTimeout(r, 300));
        } catch (err) {
          console.warn(`[BOT] ⚠️  Failed: ${cmd.name} - ${err.message}`);
        }
      }
      
      console.log(`[BOT] ✅ REGISTRATION COMPLETE: ${success}/${this.slashCommands.length} commands`);
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
          interaction.reply({ content: 'An error occurred while executing the command.', ephemeral: true }).catch(console.error);
        }
      }
    });
  }
}
