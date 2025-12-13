import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!'),
  cooldown: 10,
  execute(interaction) {
    interaction
      .reply({ content: `Pong! ${Math.round(interaction.client.ws.ping)}ms`, ephemeral: true })
      .catch(console.error);
  }
};
