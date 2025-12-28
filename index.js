// Version: 2025-11-25T19:07:26.405Z
import dotenv from 'dotenv';
import express from 'express';
import { Client, GatewayIntentBits } from 'discord.js';
import { Bot } from './classes/Bot.js';
import { Api } from './classes/Api.js';
import { config } from './utils/config.js';
import oauthRouter from './routes/oauth.js';

dotenv.config();

// Setup OAuth2 callback server (for Restorecord-style authorization)
const oauthApp = express();
oauthApp.use(express.json());
oauthApp.use(express.urlencoded({ extended: true }));

// Import OAuth2 routes
oauthApp.use('/oauth', oauthRouter);

// Start OAuth2 callback server
// Railway provides PORT automatically, use it if available, otherwise use OAUTH_PORT or default to 3000
const OAUTH_PORT = process.env.PORT || process.env.OAUTH_PORT || 3000;
oauthApp.listen(OAUTH_PORT, '0.0.0.0', () => {
  console.log(`[OAUTH2] ✅ OAuth2 callback server running on port ${OAUTH_PORT}`);
  const redirectUri = process.env.OAUTH_REDIRECT_URI || `http://localhost:${OAUTH_PORT}/oauth/callback`;
  console.log(`[OAUTH2] Callback URL: ${redirectUri}`);
  if (!process.env.OAUTH_REDIRECT_URI) {
    console.log(`[OAUTH2] ⚠️  OAUTH_REDIRECT_URI not set. Using default: ${redirectUri}`);
    console.log(`[OAUTH2] ⚠️  For production, set OAUTH_REDIRECT_URI to your KMV public URL`);
  }
});

// Suppress punycode deprecation warning (comes from dependencies, not our code)
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' && warning.message.includes('punycode')) {
    // Silently ignore punycode deprecation warnings
    return;
  }
  // Show other warnings
  console.warn(warning.name, warning.message);
});

// Validate required environment variables
const requiredVars = ['BOT_TOKEN', 'SA_API_KEY', 'SA_SHOP_ID'];
const missingVars = requiredVars.filter((v) => !process.env[v]);

if (missingVars.length > 0) {
  console.error(
    `\n❌ ERROR: Missing required environment variables:\n${missingVars.map((v) => `   - ${v}`).join('\n')}\n`
  );
  console.error('Please ensure these variables are set in your environment or .env file');
  process.exit(1);
}

// BOT_GUILD_ID es opcional ahora (multi-servidor)
if (process.env.BOT_GUILD_ID) {
  console.log('ℹ️  BOT_GUILD_ID configurado (modo servidor único)');
} else {
  console.log('ℹ️  Modo multi-servidor activado - Usa /setup para configurar servidores');
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
