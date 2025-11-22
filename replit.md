# SellAuth Discord Bot

## Overview
The SellAuth Discord Bot is a production-ready, highly stable Discord bot designed to manage product stock, automate item replacement, and synchronize product variants with the SellAuth platform. It provides staff and administrators with essential tools for efficient inventory management and order fulfillment, featuring advanced logging and robust error handling to ensure reliability and security. The project aims to streamline operations for businesses using the SellAuth platform by integrating key functionalities directly into Discord.

## User Preferences
I prefer clear, concise, and structured explanations. Focus on high-level decisions and their impact. For coding, prioritize robust error handling, security, and maintainability. When making changes, ensure comprehensive logging is in place and that the system remains stable and performant. I prefer to be informed about critical bug fixes and architectural changes.

## System Architecture
The bot operates with a modular command-based structure, where each command is an independent module. It includes a core `Bot.js` class for Discord integration and an `Api.js` class for interacting with the SellAuth API. Advanced logging is central to the system, utilizing a `AdvancedCommandLogger` for detailed command tracking and an `errorLogger` for robust error monitoring. Data is cached locally in `variantsData.json` and `replaceHistory.json` for performance. Error handling is designed to be comprehensive, covering API rate limits, network issues, and specific SellAuth API error codes. Security measures include input validation, type safety, null checks, and ensuring no sensitive data is exposed in logs.

**UI/UX Decisions:**
- Discord Embeds are used for displaying command results and log entries in a user-friendly, structured format within Discord channels.
- Color-coded console output is used for developer-side logging.

**Feature Specifications:**
- **Stock Management:** View and extract product stock, with the ability to restore previous extractions.
- **Variant Synchronization:** Synchronize product variants with the SellAuth API.
- **Invoice Viewing:** View detailed invoice information from SellAuth, including real product data, pricing, customer details, and payment methods.
- **Balance Management:** Add or remove customer balance directly via `/balance-add` and `/balance-remove` (admin only).
- **Channel Management:** Bulk delete messages via `/clear` command (admin only) - supports up to 100 messages per execution.
- **Server Backup System:** Anti-raid protection with `/backup`, `/loadbackup`, and `/listbackup` commands. Automatically saves roles, channels, permissions with date-stamped backups.
- **Anti-Spam System:** Professional rate limiting - automatically isolates users for 3 days if they execute 5+ replaces within 1-3 seconds (owner exempt). Includes timeout tracking and detailed logging.
- **Advanced Logging:** Professional command tracking with detailed metadata, execution times, status, and error context. Logs are outputted to Discord embeds, a persistent JSON file (`commandLog.json`), and the console.
- **Error Monitoring:** Automatic logging of errors with context to `errorLog.json`, tracking up to 100 recent errors for debugging.
- **Ultra-Fast Responses:** All commands respond within 1 second to avoid Discord timeouts using the `quickResponse.js` utility.

**System Design Choices:**
- **Modular Command Structure:** Commands are isolated in the `commands/` directory for easy management and scalability (13 commands total).
- **Centralized API Client:** A dedicated `Api.js` class encapsulates all interactions with the SellAuth API, promoting reusability and maintainability.
- **Robust Error Handling:** Implemented across all API interactions and command executions to ensure system stability and provide clear feedback on issues.
- **Persistent Data Storage:** Key data like product variants, replace history, logs, and server backups are stored in JSON files for persistence and quick access.
- **Comprehensive ID Search:** Invoice lookup supports multiple ID fields (`id`, `unique_id`, `invoice_id`, `reference_id`) and pagination for thorough searching.
- **Professional Rate Limiting:** Dedicated `rateLimiter.js` utility tracks user actions, detects spam patterns (5+ actions in 1-3 seconds), and applies automatic 3-day timeouts with real-time duration tracking.
- **Backup System:** `BackupManager.js` handles server state snapshots including roles, channels, permissions, and bot configurations with date-stamped storage.
- **Performance Optimization:** `quickResponse.js` ensures all commands respond within Discord's 3-second timeout by using immediate acknowledgment with background processing.

## External Dependencies
- **Discord API:** For bot interactions, commands, and sending messages/embeds.
- **SellAuth API:** For all product, stock, and invoice data management.
- **Railway:** Cloud platform for continuous deployment and hosting.
- **GitHub:** Version control and source code management, integrated with Railway for auto-deployment.