# SellAuth Discord Bot

## Overview
The SellAuth Discord Bot is a production-ready, highly stable Discord bot with **AI-powered analytics and predictive intelligence**. It manages product stock, automates item replacement, synchronizes product variants with SellAuth, and provides comprehensive automation with intelligent monitoring, professional staff notifications, and advanced moderation. It combines traditional commerce operations with cutting-edge AI for trend analysis, sales predictions, and smart alerts.

## User Preferences
I prefer clear, concise, and structured explanations. Focus on high-level decisions and their impact. For coding, prioritize robust error handling, security, and maintainability. When making changes, ensure comprehensive logging is in place and that the system remains stable and performant. I prefer to be informed about critical bug fixes and architectural changes.

## Recent Audit & Fixes (November 25, 2025)

### NEW: Advanced Dashboard + AI Intelligence System (Session 8)
**Features Implemented:** Advanced interactive dashboard + 3 AI-powered systems

#### 1. **Advanced Interactive Dashboard** (`/dashboard`)
- **Real-time Analytics:** Server stats, transactions, bot performance metrics
- **4 Interactive Button Views:**
  - 📊 **Analytics View** - Transaction trends, data volume, performance metrics
  - 🤖 **AI Insights View** - Smart recommendations, performance scoring, predictions
  - ⚠️ **Smart Alerts View** - Active alerts, monitoring systems, auto-recovery status
  - 🔮 **Predictions View** - 7-day forecasts, revenue predictions, top performers
- **Dropdown Menu:** Quick access to Top Products, Top Customers, Performance, Commands
- **Professional Embeds** with uptime, success rates, security status

#### 2. **AI Sales Analytics** (`/analytics` + `SmartAnalytics.js`)
- **Real-time Analysis:**
  - Today/Yesterday/Week/Month metrics
  - Transaction counts and success rates
  - Volume and revenue tracking
- **Smart Calculations:**
  - Top 5 products by volume
  - Day-over-day and week-over-week trends
  - Success rate monitoring (85%+ alerts)
- **Predictive Insights:**
  - Peak hour prediction (typically 14:00 UTC)
  - Expected volume forecasts
  - Risk assessment and recommendations
- **Usage:** `/analytics`

#### 3. **Predictive Alert System** (`PredictiveAlerts.js`)
- **Intelligent Monitoring:** Checks every 6 hours
- **4 Alert Types:**
  - 🔴 **High Failure Rate** - When failures > 20%
  - 📈 **Unusual Traffic** - When volume spike > 50%
  - 🔴 **Low Success Rate** - When overall success < 85%
  - 🔮 **Peak Predictions** - Forecasts expected traffic peaks
- **Automatic Recommendations:** Each alert includes actionable suggestions
- **Risk Assessment:** 🟢 LOW / 🟡 MEDIUM / 🔴 HIGH
- **Smart Deduplication:** Prevents duplicate alerts within same hour

#### 4. **Enhanced Dashboard Command** (Complete Redesign)
- **Summary View:** Key metrics at a glance
- **Performance Metrics:** Response time <500ms, success rates, uptime
- **Security Status:** Rate limiting, auto-moderation, backup system status
- **Dynamic Components:** Buttons + dropdown menus for navigation
- **Professional Formatting:** Color-coded severity levels, clean layout

---

### Previous Automation Suite (Session 7)

**All systems from Session 7 remain active:**
- ✅ `/translate` - 15+ language support
- ✅ Weekly Reports (Mondays 09:00 UTC)
- ✅ Daily Backups (03:00 UTC)
- ✅ Auto-Moderation (continuous)
- ✅ Hourly Auto-Sync (every 60 minutes)
- ✅ Daily Status Updates (12:00 UTC)

---

### Integration Architecture

**Automated System Timeline (UTC):**
```
03:00 UTC - 💾 Daily Backups
06:00 UTC - 🔔 Predictive Alerts Check
09:00 UTC (Mondays) - 📋 Weekly Reports
12:00 UTC - 📢 Daily Status Update
Every 60 min - ⏰ Auto-Sync Variants
Every 6 hours - 🤖 Predictive Alerts Check
24/7 - 🚨 Auto-Moderation
On Command - 📊 Dashboard / Analytics
```

**AI Systems Summary:**
- **SmartAnalytics.js** - Real-time trend detection and analysis
- **PredictiveAlerts.js** - Intelligent alert generation with recommendations
- **Dashboard Command** - Interactive view with 4 button modes + dropdown menu
- **Analytics Command** - Detailed insights and predictions

**Error Handling:**
- All systems gracefully handle errors
- Failed operations reported to staff
- Missing channels logged but don't crash systems
- Connection failures trigger auto-recovery

**Data Persistence:**
- All scheduled tasks survive bot restarts
- State tracked in: sessionState.json, connectionState.json, replaceHistory.json
- Backups stored in: backups/ directory with ISO 8601 timestamps
- Analytics calculated on-demand from history

---

## System Architecture
The bot operates with a modular command-based structure where each command is an independent module. It includes:
- **Core `Bot.js` class** for Discord integration and system initialization
- **`Api.js` class** for SellAuth API interactions
- **Advanced `AdvancedCommandLogger`** for detailed command tracking
- **`errorLogger`** for robust error monitoring
- **AI Analytics Systems** (`SmartAnalytics`, `PredictiveAlerts`) for intelligent insights
- **Multiple automated reporter systems** for staff notifications
- **Auto-moderation** for rule enforcement
- **Persistent state management** for recovery and reliability

## Feature Specifications

### Core Commands
- `/stock` - View and extract product stock
- `/replace` - Automate item replacement
- `/unreplace` - Undo replacements
- `/sync-variants` - Synchronize product variants
- `/invoice-view` - View detailed invoice information
- `/balance-add` - Add customer balance (admin only)
- `/balance-remove` - Remove customer balance (admin only)
- `/clear` - Bulk delete messages (admin only)
- `/backup` - Create server backup (admin only)
- `/loadbackup` - Restore server backup (admin only)
- `/listbackup` - List all available backups (admin only)
- `/audit` - View comprehensive audit logs (admin only)
- `/config` - Manage server settings
- `/status` - System performance monitoring
- `/role-info` - Role statistics and information
- `/help` - Command help and documentation

### Automated & AI Features
- **`/translate`** - Multi-language translation (15+ languages)
- **`/dashboard`** - Advanced interactive analytics dashboard with 4 views
- **`/analytics`** - AI-powered sales insights and predictions
- **Weekly Reports** - Automated Monday 09:00 UTC to channel 1442913019788001513
- **Daily Backups** - Automated 03:00 UTC to channel 1442913427575013426
- **Daily Status** - Automated 12:00 UTC to channel 1441496193711472814
- **Auto-Sync** - Every 60 minutes (background)
- **Auto-Moderation** - Continuous with logging to channel 1442913855964450901
- **Predictive Alerts** - Every 6 hours with AI-generated recommendations

### Advanced Security & Monitoring
- **Rate limiting** with automatic user isolation
- **Permission validation** before sensitive operations
- **Error monitoring** with automatic logging
- **Auto-recovery** for Discord session limits
- **Professional audit logging** with timestamps
- **Role protection system** against unauthorized changes
- **Anti-spam system** with professional response throttling
- **AI Risk Assessment** - Real-time risk scoring and recommendations

---

## System Design Choices
- **Modular Architecture:** Commands and systems isolated for scalability
- **Centralized API Client:** `Api.js` handles all SellAuth interactions
- **Robust Error Handling:** Comprehensive error coverage with graceful fallbacks
- **Persistent Storage:** JSON files for state, scheduled tasks, and recovery
- **Professional Formatting:** Discord embeds for all user-facing output
- **Automated Systems:** Scheduled tasks with zero manual intervention
- **Logging:** Detailed logging to both console and Discord channels
- **Rate Limiting:** Connection and API request throttling
- **Session Recovery:** Automatic bot recovery without manual intervention
- **Moderation:** Automated rule enforcement with staff visibility
- **AI Intelligence:** Real-time analytics and predictive systems for smart decision-making

---

## External Dependencies
- **Discord API:** For bot interactions, commands, and messaging
- **SellAuth API:** For product, stock, and invoice data management
- **Google Translate API:** For multi-language translation (@vitalets/google-translate-api)
- **Railway:** Cloud platform for continuous deployment
- **GitHub:** Version control and source code management
