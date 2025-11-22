import { Client, GatewayIntentBits } from 'discord.js';
import { Bot } from './classes/Bot.js';
import { Api } from './classes/Api.js';

const api = new Api();

export const bot = new Bot(
  new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
  }),
  api
);
