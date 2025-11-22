import { Collection, Events, REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { join, dirname } from 'path';
import { checkUserIdWhitelist } from '../utils/checkUserIdWhitelist.js';
import { config } from '../utils/config.js';
import { NotWhitelistedException } from '../utils/NotWhitelistedException.js';
import { startAutoSync } from '../utils/autoSync.js';

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

    // Login with retry logic for Discord rate limits
    this.loginWithRetry();

    this.client.on('ready', () => {
      console.log(`${this.client.user.username} ready!`);
      this.registerSlashCommands();
      startAutoSync(this.api);
    });

    this.client.on('warn', (info) => console.log(info));
    this.client.on('error', (error) => {
      console.error('[BOT ERROR]', error.message);
      if (error.message && error.message.includes('Not enough sessions')) {
        console.warn('[BOT] Discord session limit reached. Retrying in 30 seconds...');
        setTimeout(() => this.loginWithRetry(), 30000);
      }
    });

    this.onInteractionCreate();
  }

  async loginWithRetry(attempt = 1) {
    const maxAttempts = 5;
    try {
      console.log(`[BOT LOGIN] Attempt ${attempt}/${maxAttempts}`);
      await this.client.login(config.BOT_TOKEN);
    } catch (error) {
      console.error(`[BOT LOGIN ERROR] ${error.message}`);
      if (attempt < maxAttempts && error.message && error.message.includes('Not enough sessions')) {
        const delay = Math.min(30000 * attempt, 120000); // Max 2 minutes
        console.log(`[BOT LOGIN] Retrying in ${delay / 1000} seconds...`);
        setTimeout(() => this.loginWithRetry(attempt + 1), delay);
      } else if (attempt >= maxAttempts) {
        console.error(`[BOT LOGIN] Max retries reached. Please check Discord API status or wait for session reset.`);
      }
    }
  }

  async registerSlashCommands() {
    const rest = new REST({ version: '9' }).setToken(config.BOT_TOKEN);

    const commandFiles = readdirSync(join(__dirname, '..', 'commands')).filter((file) => !file.endsWith('.map'));

    for (const file of commandFiles) {
      const commandPath = pathToFileURL(join(__dirname, '..', 'commands', `${file}`)).href; // Convert to file:// URL
      const command = await import(commandPath);

      this.slashCommands.push(command.default.data);
      this.slashCommandsMap.set(command.default.data.name, command.default);
    }

    if (config.BOT_GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(this.client.user.id, config.BOT_GUILD_ID), {
        body: this.slashCommands
      });
    } else {
      await rest.put(Routes.applicationCommands(this.client.user.id), { body: this.slashCommands });
    }
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
          command.execute(interaction, this.api);
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