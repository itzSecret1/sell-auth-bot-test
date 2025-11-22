import dotenv from 'dotenv';
dotenv.config();

import { Client, GatewayIntentBits } from 'discord.js';
import { Bot } from './classes/Bot.js';
import { Api } from './classes/Api.js';
import { config } from './utils/config.js';

// Validate required environment variables
const requiredVars = ['BOT_TOKEN', 'BOT_GUILD_ID', 'SA_API_KEY', 'SA_SHOP_ID'];
const missingVars = requiredVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
  console.error(`\n❌ ERROR: Missing required environment variables:\n${missingVars.map(v => `   - ${v}`).join('\n')}\n`);
  console.error('Please ensure these variables are set in your environment or .env file');
  process.exit(1);
}

console.log('✅ All environment variables loaded successfully');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ]
});

const api = new Api();
const bot = new Bot(client, api);

export { bot, client };
