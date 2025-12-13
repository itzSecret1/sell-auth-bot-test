# Railway Deployment Guide

**Professional 24/7 hosting setup for SellAuth Discord Bot**

---

## 🚀 Step 1: Connect GitHub Repository

1. Visit [Railway.app](https://railway.app) and sign in
2. Click **New Project**
3. Select **Deploy from GitHub repo**
4. Authorize Railway with your GitHub account
5. Search for and select: `sell-auth-bot-test`
6. Click **Create Project**

Railway will automatically detect the `nixpacks.toml` and start building.

---

## ⚙️ Step 2: Configure Environment Variables

The first deployment will fail (no env vars yet). Configure them now:

1. Navigate to your Railway project
2. Click the **Discord Bot** service
3. Go to **Settings** → **Environment**
4. Add these 8 variables exactly:

| Variable | Value |
|----------|-------|
| `BOT_TOKEN` | Your Discord bot token |
| `BOT_GUILD_ID` | `1440385098724675818` |
| `BOT_ADMIN_ROLE_ID` | `1440390894430982224` |
| `BOT_STAFF_ROLE_ID` | `1440390892900061336` |
| `BOT_CUSTOMER_ROLE_ID` | `1440390895462645771` |
| `BOT_USER_ID_WHITELIST` | *(leave empty)* |
| `SA_API_KEY` | Your SellAuth API key |
| `SA_SHOP_ID` | `112723` |

**⚠️ Important:**
- **No quotes** around values
- **No spaces** before or after values
- `BOT_USER_ID_WHITELIST` must be completely **empty**

---

## 🔄 Step 3: Trigger Deployment

1. Click the **Redeploy** button (top-right)
2. **Wait 2-3 minutes** for the build to complete
3. Progress indicator will show when deployment is ready

---

## ✅ Step 4: Verify Deployment Success

Click **View Logs** and look for these messages:

```
✅ All environment variables loaded successfully
Snake Support ready!
[AUTO-SYNC] Auto-sync started - updating every 30 seconds
```

If you see these, your bot is **running successfully**! 🎉

---

## 🔧 Troubleshooting

### Build Fails with "Cannot find module"
- **Cause**: Dependencies not installed
- **Fix**: Railway will automatically run `npm ci`; wait for build to complete

### Environment Variables Not Loading
- **Cause**: Missing or incorrectly named variables
- **Fix**: 
  1. Go to Settings → Environment
  2. Verify all 8 variables match the table above exactly
  3. Click Redeploy

### Bot Offline / Crashes
- **Cause**: Invalid token or missing permissions
- **Fix**:
  1. Verify BOT_TOKEN is valid and not expired
  2. Check bot permissions in Discord server settings
  3. Bot needs: `applications.commands` and `bot` scope

### Slow Command Responses
- **Expected**: Bot processes 5 API requests at a time (batch limit)
- **Auto-sync**: Runs every 30 seconds in background
- **Normal**: Initial responses take 3-10 seconds on first command

---

## 🔗 Enable Auto-Deploy from GitHub

For automatic redeployment when pushing code:

1. Go to **Settings** → **Deployments**
2. Toggle **"Automatic deploys"** ON
3. Select branch: `main`

Now every code update automatically redeploys! 🚀

---

## 📊 Monitoring

### View Logs
- Go to **View Logs** for real-time output
- Shows bot status, command execution, and errors

### Manual Restart
- Click **Redeploy** to force restart
- Service will restart within 1 minute

### Resource Usage
- Go to **Settings** → **Resources** to check CPU/memory
- Free tier provides generous resources

---

## 🛟 Discord Bot Setup

Ensure your Discord bot has required permissions:

1. Go to Discord Developer Portal
2. Select your bot application
3. Go to **OAuth2** → **URL Generator**
4. Select scopes:
   - ✅ `bot`
   - ✅ `applications.commands`
5. Select permissions:
   - ✅ `Send Messages`
   - ✅ `Embed Links`
   - ✅ `Use Slash Commands`
6. Copy the generated URL and invite bot to your server

---

## ✨ Your Bot is Live!

Your SellAuth Discord bot is now running **24/7** on Railway!

- ✅ Auto-reconnects on crashes
- ✅ Auto-syncs with GitHub changes
- ✅ Real-time stock management
- ✅ Role-based command access

**Next**: Test `/replace`, `/claim`, and `/sync-variants` commands in Discord.
