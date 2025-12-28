import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { GuildConfig } from '../utils/GuildConfig.js';
import { config } from '../utils/config.js';

const AUTHORIZED_USER_IDS = ['1190738779015757914', '1407024330633642005'];

export default {
  data: new SlashCommandBuilder()
    .setName('reload-commands')
    .setDescription('Force re-register all commands on this server (Authorized users only)'),

  async execute(interaction) {
    try {
      // Verificar que el usuario esté autorizado
      if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
        await interaction.reply({
          content: '❌ You do not have permission to use this command. Only authorized users can reload commands.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const guild = interaction.guild;
      const bot = interaction.client;

      // Obtener la instancia del bot desde el cliente
      // Necesitamos acceder al método registerIndividualCommands
      // Como no tenemos acceso directo, vamos a registrar manualmente

      const { REST } = await import('discord.js');
      const rest = new REST({ version: '9' }).setToken(config.BOT_TOKEN);

      // Cargar todos los comandos
      const { readdirSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath, pathToFileURL } = await import('url');

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const commandsPath = join(__dirname, '..', 'commands');

      const commandFiles = readdirSync(commandsPath)
        .filter((file) => file.endsWith('.js') && !file.endsWith('.map'));

      const slashCommands = [];

      for (const file of commandFiles) {
        try {
          const commandPath = pathToFileURL(join(commandsPath, file)).href;
          const command = await import(commandPath);
          if (command.default && command.default.data) {
            slashCommands.push(command.default.data.toJSON());
          }
        } catch (err) {
          console.error(`[RELOAD] Error loading ${file}:`, err.message);
        }
      }

      // Limpiar comandos existentes
      try {
        const existing = await guild.commands.fetch();
        for (const cmd of existing.values()) {
          await guild.commands.delete(cmd.id).catch(() => {});
        }
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        console.error('[RELOAD] Error clearing commands:', e);
      }

      // Registrar nuevos comandos
      let success = 0;
      let failed = 0;

      for (const cmd of slashCommands) {
        try {
          await guild.commands.create(cmd);
          success++;
          await new Promise(r => setTimeout(r, 300)); // Rate limit protection
        } catch (err) {
          console.warn(`[RELOAD] ⚠️  Failed to create ${cmd.name}: ${err.message}`);
          failed++;
        }
      }

      const embed = new EmbedBuilder()
        .setColor(success > 0 ? 0x00ff00 : 0xff0000)
        .setTitle(success > 0 ? '✅ Commands Reloaded' : '❌ Error Reloading')
        .setDescription(
          success > 0
            ? `**${success}** commands have been registered on this server.\n\n` +
              `Commands should appear in a few seconds. If they don't appear, try typing \`/\` in Discord to refresh the list.`
            : `Error reloading commands. Check the bot logs.`
        )
        .addFields(
          {
            name: '📊 Statistics',
            value: `✅ Successful: ${success}\n❌ Failed: ${failed}\n📝 Total: ${slashCommands.length}`,
            inline: true
          },
          {
            name: '💡 Tip',
            value: 'If commands don\'t appear, wait 1-2 minutes or restart Discord.',
            inline: false
          }
        )
        .setFooter({ text: `Server: ${guild.name}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      console.log(`[RELOAD-COMMANDS] ✅ ${success}/${slashCommands.length} commands registered in ${guild.name} by ${interaction.user.tag}`);

    } catch (error) {
      console.error('[RELOAD-COMMANDS] Error:', error);
      await interaction.editReply({
        content: `❌ Error reloading commands: ${error.message}`
      }).catch(() => {});
    }
  }
};

