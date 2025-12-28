import express from 'express';
import { OAuth2Manager } from '../utils/OAuth2Manager.js';
import { VerifiedUsers } from '../utils/VerifiedUsers.js';
import { GuildConfig } from '../utils/GuildConfig.js';
import { config } from '../utils/config.js';

const router = express.Router();

/**
 * OAuth2 Callback Handler - Processes OAuth2 authorization
 * This endpoint receives the authorization code from Discord and exchanges it for tokens
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code) {
      return res.status(400).send('Missing authorization code');
    }
    
    if (!state) {
      return res.status(400).send('Missing state parameter');
    }
    
    // Decode state to get userId and guildId
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (error) {
      return res.status(400).send('Invalid state parameter');
    }
    
    const { userId, guildId } = stateData;
    const redirectUri = config.OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth/callback';
    
    // Exchange code for access token
    const tokenData = await OAuth2Manager.exchangeCodeForToken(code, redirectUri);
    
    // Store token
    OAuth2Manager.storeToken(
      userId,
      tokenData.accessToken,
      tokenData.refreshToken,
      tokenData.expiresAt
    );
    
    // Add user to verified users list
    try {
      // Get user info from Discord API
      const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
        headers: {
          'Authorization': `Bearer ${tokenData.accessToken}`
        }
      });
      
      if (userResponse.ok) {
        const userData = await userResponse.json();
        
        VerifiedUsers.addVerifiedUser(
          userId,
          userData.username,
          userData.discriminator,
          `${userData.username}#${userData.discriminator}`,
          guildId
        );
      }
    } catch (userError) {
      console.error('[OAUTH2] Error fetching user info:', userError);
    }
    
    // Try to add user to guild immediately
    try {
      await OAuth2Manager.addUserToGuild(userId, guildId, config.BOT_TOKEN);
      
      // Add member role if configured
      const guildConfig = GuildConfig.getConfig(guildId);
      if (guildConfig?.memberRoleId) {
        // Role will be added by GuildMemberAdd event handler
      }
    } catch (addError) {
      console.error('[OAUTH2] Error adding user to guild:', addError);
      // User will be added when they join via invite
    }
    
    // Send success page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authorization Successful</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: rgba(0,0,0,0.3);
            border-radius: 20px;
            backdrop-filter: blur(10px);
          }
          h1 { margin: 0 0 20px 0; }
          p { font-size: 18px; margin: 10px 0; }
          .success { color: #4ade80; font-size: 48px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✅</div>
          <h1>Authorization Successful!</h1>
          <p>You have been successfully authorized and verified.</p>
          <p>You can now close this window and return to Discord.</p>
          <p><small>This window will close automatically in 5 seconds...</small></p>
        </div>
        <script>
          setTimeout(() => window.close(), 5000);
        </script>
      </body>
      </html>
    `);
    
    console.log(`[OAUTH2] ✅ User ${userId} authorized successfully for guild ${guildId}`);
    
  } catch (error) {
    console.error('[OAUTH2] Error in callback:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authorization Error</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: rgba(0,0,0,0.3);
            border-radius: 20px;
          }
          .error { color: #fbbf24; font-size: 48px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error">⚠️</div>
          <h1>Authorization Error</h1>
          <p>An error occurred during authorization.</p>
          <p>Please try again or contact support.</p>
        </div>
      </body>
      </html>
    `);
  }
});

export default router;

