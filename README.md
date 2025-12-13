# SellAuth Discord Bot

**A professional Discord bot for managing SellAuth e-commerce shops with real-time product variants, accurate stock management, and role-based access control.**

---

## ✨ Features

- **Slash Commands** with auto-complete
- **Real-time Stock Management** - `/replace`, `/unreplace`, `/claim`
- **Product Variants** - Display with live inventory counts
- **Role-Based Access** - Owner (admin) and Staff (limited) tiers
- **Invoice Management** - View and claim invoices with automatic customer role assignment
- **Automatic Synchronization** - Background sync every 30 seconds
- **24/7 Hosting** - Deploy to Railway for always-on availability
- **GitHub Integration** - Auto-sync code changes to Railway deployments

---

## 🚀 Quick Start - Local Development

### Prerequisites
- Node.js 18+ and npm
- Discord bot token
- SellAuth API credentials

### Installation

1. **Clone and install dependencies**
```bash
npm install
```

2. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env and add your credentials
```

3. **Run the bot**
```bash
npm start
```

---

## 🌐 Production Deployment - Railway

For 24/7 hosting, deploy to Railway in 3 steps:

### 1. Connect GitHub
- Visit [railway.app](https://railway.app)
- Click **New Project** → **Deploy from GitHub**
- Select your `sell-auth-bot-test` repository

### 2. Set Environment Variables
After initial build failure, add these 8 variables in Railway Settings:

```
BOT_TOKEN=<your_discord_bot_token>
BOT_GUILD_ID=1440385098724675818
BOT_ADMIN_ROLE_ID=1440390894430982224
BOT_STAFF_ROLE_ID=1440390892900061336
BOT_CUSTOMER_ROLE_ID=1440390895462645771
BOT_USER_ID_WHITELIST=
SA_API_KEY=<your_sellauth_api_key>
SA_SHOP_ID=112723
```

### 3. Redeploy
Click **Redeploy** and wait 2-3 minutes. Check logs for:
```
✅ All environment variables loaded successfully
Snake Support ready!
```

**See [RAILWAY_SETUP.md](./RAILWAY_SETUP.md) for detailed deployment guide.**

---

## 👥 Role Permissions

| Role | Access Level | Commands |
|------|--------------|----------|
| **Owner** (`BOT_ADMIN_ROLE_ID`) | Full Admin | All commands, full control |
| **Staff** (`BOT_STAFF_ROLE_ID`) | Limited | `/replace`, `/unreplace`, `/claim`, `/invoice-view` |
| **Customer** (`BOT_CUSTOMER_ROLE_ID`) | View Only | Auto-assigned when claiming invoices |

---

## 🛠️ Available Commands

| Command | Permission | Purpose |
|---------|-----------|---------|
| `/replace` | Staff+ | Remove items from stock and send to user |
| `/unreplace` | Staff+ | Restore previously removed items |
| `/claim` | All | Claim invoice and get customer role |
| `/invoice-view` | Staff+ | View invoice details |
| `/sync-variants` | Admin | Manually sync product variants from SellAuth |
| `/stats` | Admin | View shop statistics |

---

## 🏗️ Architecture

### Command System
- Modular command loading from `/commands` directory
- Each command is a standalone ES6 module
- Auto-registers as Discord slash commands
- Supports autocomplete for product selection

### Permission Model
- **Role-based**: Discord roles determine access level
- **Whitelist**: Optional fallback for specific user IDs
- **Three-tier system**: Admin > Staff > Customer

### Stock Management
- **Real-time sync**: Fetches from SellAuth `/deliverables` endpoint
- **Batch processing**: 5 concurrent API calls (prevents overload)
- **Background sync**: Runs every 30 seconds without blocking commands
- **Instant autocomplete**: Uses cached data for instant suggestions

### API Communication
- **axios**: HTTP client for SellAuth REST API
- **Centralized**: Single `Api` class handles all requests
- **Error handling**: Graceful degradation on API failures
- **Retry logic**: Automatic recovery on network issues

---

## 📦 Tech Stack

| Component | Library | Version |
|-----------|---------|---------|
| Discord Integration | discord.js | 14.15.3 |
| HTTP Client | axios | 1.7.7 |
| File Watching | chokidar | 4.0.3 |
| GitHub API | @octokit/rest | 22.0.1 |
| Environment | dotenv | 16.4.5 |
| Development | nodemon | 2.0.22 |

---

## 🔄 Development Workflow

### Local Changes
1. Edit code in `/commands`, `/classes`, or `/utils`
2. Changes auto-sync to GitHub (via Replit integration)
3. Railway automatically redeploys on new commits

### Testing
```bash
npm run dev              # Development mode with auto-reload
npm run format          # Format code with prettier
```

---

## 🐛 Troubleshooting

### Common Issues

**Bot offline after deployment:**
- Check Railway logs for errors
- Verify all 8 environment variables are set
- Click **Redeploy** to force restart

**Slash commands not appearing:**
- Ensure bot has `applications.commands` scope
- Reinvite bot with correct permissions
- Wait 1 minute for Discord to sync

**Slow autocomplete:**
- Expected: ~1-3 seconds first time
- Uses cached data for instant results after initial load

**Stock count incorrect:**
- Bot fetches real stock from SellAuth deliverables
- Updates every 30 seconds automatically
- Use `/sync-variants` to force immediate sync

---

## 📚 Documentation

- [Railway Deployment Guide](./RAILWAY_SETUP.md) - Step-by-step production setup
- [Architecture Details](./replit.md) - Technical deep-dive

---

## 📄 License

MIT License - See LICENSE file for details

---

**🚀 Ready to go live?** [Deploy to Railway now →](./RAILWAY_SETUP.md)
