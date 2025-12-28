# OAuth2 Setup Guide (Restorecord-style)

This guide explains how to configure OAuth2 for automatic user restoration.

## Required Environment Variables

Add these to your `.env` file or Railway environment variables:

```env
BOT_CLIENT_ID=your_bot_client_id
BOT_CLIENT_SECRET=your_bot_client_secret
OAUTH_REDIRECT_URI=http://localhost:3000/oauth/callback
OAUTH_PORT=3000
```

## How to Get OAuth2 Credentials

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your bot application
3. Go to **OAuth2** section
4. Copy your **Client ID** (this is `BOT_CLIENT_ID`)
5. Click **Reset Secret** to get your **Client Secret** (this is `BOT_CLIENT_SECRET`)
6. Add redirect URI: `http://localhost:3000/oauth/callback` (or your production URL)

## OAuth2 Scopes Required

The bot uses these OAuth2 scopes:
- `guilds.join` - To add users to guilds
- `identify` - To identify users

## How It Works

1. **User Verification**: When a user clicks "Verify & Authorize", they are redirected to Discord OAuth2
2. **Token Storage**: The bot stores the OAuth2 access token and refresh token
3. **Automatic Restoration**: If a verified user leaves the server, the bot automatically adds them back using OAuth2
4. **Auto-Reauthorization**: If a user revokes access, the bot automatically requests reauthorization

## Security Features

- **Cannot be disabled**: Users cannot permanently revoke authorization - the bot will automatically request reauthorization
- **Token refresh**: Tokens are automatically refreshed when they expire
- **Direct server addition**: Users are added directly to the server without needing to click invites

## Production Setup

For production, update `OAUTH_REDIRECT_URI` to your production URL:
```env
OAUTH_REDIRECT_URI=https://your-domain.com/oauth/callback
```

Make sure your server is accessible on the internet and the callback URL matches exactly.

