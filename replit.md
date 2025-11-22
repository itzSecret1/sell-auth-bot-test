# SellAuth Discord Bot

## Overview

This is a Discord bot that integrates with the SellAuth e-commerce platform, allowing shop owners to manage their SellAuth stores directly through Discord commands. The bot provides administrative functions including product management, order processing, coupon management, invoice handling, and customer role assignment.

The application uses Discord.js v14 to interface with Discord's API and communicates with SellAuth's REST API to perform shop management operations. It implements a slash command system with role-based access control and whitelist permissions.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Command System Architecture

**Problem**: Need a scalable way to register and handle Discord slash commands with proper permission controls.

**Solution**: Dynamic command loading system that reads command files from a `/commands` directory and automatically registers them as Discord slash commands.

**Implementation Details**:
- Commands are individual ES6 modules that export a configuration object with `data` (SlashCommandBuilder), `execute` function, and optional permission flags
- The `Bot` class loads all command files at startup, builds a command collection, and registers them with Discord's REST API
- Commands can specify `onlyWhitelisted: true` and `requiredRole` ('admin' or 'staff') for access control
- Cooldown system prevents command spam

**Pros**: Easy to add new commands, clean separation of concerns, maintainable structure
**Cons**: All commands load at startup (no lazy loading)

### Permission & Access Control

**Problem**: Need granular control over who can execute administrative commands.

**Solution**: Multi-tier permission system combining Discord roles and user ID whitelists.

**Implementation Details**:
- Three permission levels: Admin (full access), Staff (limited access), and Whitelist (legacy fallback)
- `checkUserIdWhitelist` utility validates permissions before command execution
- Commands marked with `onlyWhitelisted: true` require either admin role, staff role (if command allows), or presence in user ID whitelist
- Configuration supports `BOT_ADMIN_ROLE_ID`, `BOT_STAFF_ROLE_ID`, and `BOT_USER_ID_WHITELIST`

**Rationale**: Provides flexibility for different organizational structures while maintaining security

### Claims System

**Problem**: Need to prevent duplicate customer role assignments and track which invoices have been claimed.

**Solution**: File-based persistence using `claims.json` to store claimed invoice IDs.

**Implementation Details**:
- Claims data stored as JSON object mapping invoice IDs to claim status
- Read at startup and written when new claims are processed
- The `claim` command validates invoice ownership via email match before assigning customer role
- Prevents re-claiming already used invoices

**Alternative Considered**: Database storage
**Pros of Current Approach**: Simple, no database dependency, suitable for small-scale usage
**Cons**: Not suitable for high-concurrency scenarios, file I/O blocking, data loss risk without backups

### API Communication Layer

**Problem**: Need consistent interface for making authenticated HTTP requests to SellAuth API.

**Solution**: `Api` class that encapsulates all HTTP communication with the SellAuth platform.

**Implementation Details**:
- Centralized API client with base URL and authentication headers
- Methods for GET, POST, PUT, and DELETE operations
- Uses `axios` for HTTP requests (replaced `node-fetch` for better compatibility with Railway)
- API credentials (API key and shop ID) loaded from environment configuration
- Error handling throws objects with response details

**Pros**: Single source of truth for API communication, easy to mock for testing, stable on Railway
**Cons**: Limited error handling, no retry logic

### Event-Driven Architecture

**Problem**: Need to respond to Discord interactions and lifecycle events.

**Solution**: Event listener pattern using Discord.js event emitters.

**Implementation Details**:
- Bot class sets up event listeners for `ready`, `warn`, `error`, and `interactionCreate`
- `onInteractionCreate` method handles slash command execution with permission checks
- Commands are executed via their exported `execute` function with interaction and API client passed as parameters

**Rationale**: Aligns with Discord.js framework conventions, enables reactive behavior

### Stock Management & Variants System

**Problem**: Need to manage product variants and their stock via Discord commands.

**Solution**: Two-phase variant synchronization system:
1. **Sync Phase** (`/sync-variants` command): Discovers all variants from SellAuth by analyzing invoices
2. **Runtime Phase** (`/replace` command): Uses cached variant data for fast autocomplete and stock management

**Implementation Details**:
- `/sync-variants` (admin only) fetches all invoices, extracts unique variant IDs and names, checks stock via deliverables endpoint, saves to `variantsData.json`
- Variants are discovered through actual invoice data (each invoice contains `variant.id` and `variant.name`)
- Stock information retrieved from `/deliverables` endpoint for each variant
- Cached data persists across bot restarts for performance
- `/replace` command uses cached data to provide instant autocomplete without API delays
- `/unreplace` command restores previously removed items from history

**Key Insight**: SellAuth variants are discovered through transaction history (invoices) rather than a direct variants endpoint. Each product's variants appear in its invoices as actual transactions.

**Rationale**: 
- Ensures only variants that actually have transactions are managed
- Provides real stock data from the deliverables system
- Avoids timeout issues during autocomplete by pre-caching variant information
- Fast autocomplete by reading from local JSON instead of making API calls

## External Dependencies

### Discord API Integration
- **Library**: discord.js v14.15.3
- **Purpose**: Discord bot framework for creating slash commands, managing guild interactions, and handling events
- **Key Features Used**: SlashCommandBuilder, Client with Gateway intents, REST API for command registration, EmbedBuilder for rich messages, ActionRowBuilder and ButtonBuilder for interactive components
- **Authentication**: Bot token (`BOT_TOKEN`) required in environment configuration

### SellAuth REST API
- **Base URL**: `https://api.sellauth.com/v1/`
- **Purpose**: E-commerce platform API for managing shop products, invoices, coupons, orders, and statistics
- **Authentication**: Bearer token authentication using shop API key (`SA_API_KEY`)
- **Key Endpoints Used**:
  - `/shops/{shopId}/products/*` - Product management and listings
  - `/shops/{shopId}/invoices/*` - Invoice viewing and variant discovery
  - `/shops/{shopId}/coupons/*` - Coupon CRUD operations
  - `/shops/{shopId}/products/{productId}/deliverables/{variantId}` - Stock management for variants
  - `/shops/{shopId}/payouts/balances` - Cryptocurrency balance viewing
  - `/shops/{shopId}/stats` - Shop statistics
- **Required Configuration**: `SA_API_KEY` and `SA_SHOP_ID`

### Environment Configuration
- **Library**: dotenv v16.4.5
- **Purpose**: Load environment variables from `.env` file
- **Required Variables**:
  - `BOT_TOKEN` - Discord bot authentication token
  - `BOT_GUILD_ID` - Discord server ID for command registration
  - `BOT_USER_ID_WHITELIST` - Comma-separated user IDs for legacy permission system
  - `BOT_CUSTOMER_ROLE_ID` - Role assigned to customers using claim command
  - `BOT_STAFF_ROLE_ID` - Role ID for staff-level permissions
  - `BOT_ADMIN_ROLE_ID` - Role ID for admin-level permissions
  - `SA_API_KEY` - SellAuth API authentication key
  - `SA_SHOP_ID` - SellAuth shop identifier

### HTTP Client
- **Library**: axios v1.7.7
- **Purpose**: Make HTTP requests to SellAuth API and Replit connectors
- **Usage**: All API requests in `Api` class and GitHub token fetching in `gitAutoSync.js`
- **Note**: Replaced `node-fetch` to fix Railway deployment compatibility issues with ReadableStream

### File System
- **Module**: Node.js built-in `fs` module
- **Purpose**: Read command files dynamically, persist claims and variant data to JSON files
- **Usage**: Command loading, claims.json and variantsData.json read/write operations

### Development Tools
- **nodemon** v2.0.22 - Auto-restart during development
- **prettier** v3.3.1 - Code formatting

## Current Status

**✅ Production Ready** - All systems operational and tested

- Bot running 24/7 in Replit development environment
- GitHub repository fully synced and ready for Railway deployment
- All dependencies properly configured (`axios`, `discord.js`, etc.)
- Real-time stock management working with batch API processing
- Auto-sync optimized (30-second interval, 5 concurrent requests limit)
- Autocomplete loading from cache immediately
- Environment variables validated and secure

## Recent Changes (Nov 22, 2025)

### Autocomplete Performance Optimization
- **Fixed Autocomplete Timeout**: Bot now loads cached variants data immediately on startup
- Removed blocking behavior where initial auto-sync prevented autocomplete from responding
- Implemented batch processing for API calls (5 concurrent limit) to prevent overwhelming the server
- Background sync runs asynchronously without blocking Discord commands
- Variants data loads instantly from cache while background sync refreshes in the background

### Real-Time Stock Accuracy Fix
- **Fixed Stock Display Bug**: Changed auto-sync to fetch REAL stock from `/deliverables` endpoint instead of `product.variants.stock`
- Previous method showed outdated/cached stock that didn't match actual inventory
- `/replace` command now shows accurate remaining stock after removing items
- Each variant gets real-time item count from SellAuth deliverables system
- variantsData.json now contains live inventory data for accurate autocomplete display

### Auto-Sync Interval Optimization (1s → 30s)
- **Fixed Discord Timeout Errors**: Reduced auto-sync interval from 1 second to 30 seconds
- Previous 1-second interval was causing 60 requests/minute to SellAuth API, blocking Node.js event loop
- Eliminated "DiscordAPIError[10062]: Unknown interaction" timeout errors
- Eliminated "Error: Invalid response" intermittent failures
- Commands now respond within Discord's 3-second timeout requirement
- Bot remains fully synchronized with variant data, just updates less frequently

### HTTP Client Migration (node-fetch → axios)
- **Fixed Railway Deployment Crash**: Replaced `node-fetch` v3 with `axios` for better Node.js compatibility
- Updated `classes/Api.js` to use axios for all SellAuth API requests
- Updated `utils/gitAutoSync.js` to use axios for Replit connector API requests
- Eliminated `ReferenceError: ReadableStream is not defined` that was preventing Railway deployment
- Bot now successfully runs 24/7 on Railway without crashes
- All changes automatically synced to GitHub via gitAutoSync

### Previous Changes (Nov 21, 2025)

### Variants System Implementation
- Created `/sync-variants` command (admin only) for discovering and caching all product variants
- Updated `/replace` command to use cached variant data instead of real-time API calls
- Implemented variant discovery through invoice analysis (SellAuth's variant structure)
- Added `variantsData.json` for persistent variant caching
- Autocomplete now responds instantly using pre-cached data
- Stock information synchronized alongside variant names and IDs
