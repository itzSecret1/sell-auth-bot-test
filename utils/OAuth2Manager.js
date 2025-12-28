import { readFileSync, writeFileSync, existsSync } from 'fs';
import { config } from './config.js';

const OAUTH_TOKENS_FILE = './oauth2_tokens.json';

/**
 * OAuth2 Manager - Handles OAuth2 tokens for Restorecord-style user restoration
 */
export class OAuth2Manager {
  /**
   * Load OAuth2 tokens from file
   */
  static loadTokens() {
    try {
      if (existsSync(OAUTH_TOKENS_FILE)) {
        return JSON.parse(readFileSync(OAUTH_TOKENS_FILE, 'utf-8'));
      }
    } catch (error) {
      console.error('[OAUTH2] Error loading tokens:', error);
    }
    return {};
  }

  /**
   * Save OAuth2 tokens to file
   */
  static saveTokens(tokens) {
    try {
      writeFileSync(OAUTH_TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf-8');
    } catch (error) {
      console.error('[OAUTH2] Error saving tokens:', error);
    }
  }

  /**
   * Store OAuth2 token for a user
   */
  static storeToken(userId, accessToken, refreshToken, expiresAt) {
    const tokens = this.loadTokens();
    tokens[userId] = {
      accessToken,
      refreshToken,
      expiresAt: expiresAt || (Date.now() + 604800000), // 7 days default
      storedAt: new Date().toISOString()
    };
    this.saveTokens(tokens);
    console.log(`[OAUTH2] ✅ Token stored for user ${userId}`);
  }

  /**
   * Get OAuth2 token for a user
   */
  static getToken(userId) {
    const tokens = this.loadTokens();
    return tokens[userId] || null;
  }

  /**
   * Check if token is expired
   */
  static isTokenExpired(tokenData) {
    if (!tokenData || !tokenData.expiresAt) return true;
    return Date.now() > tokenData.expiresAt;
  }

  /**
   * Remove token for a user (when they revoke access)
   */
  static removeToken(userId) {
    const tokens = this.loadTokens();
    if (tokens[userId]) {
      delete tokens[userId];
      this.saveTokens(tokens);
      console.log(`[OAUTH2] ⚠️ Token removed for user ${userId} (revoked)`);
    }
  }

  /**
   * Generate OAuth2 authorization URL
   */
  static generateAuthUrl(userId, guildId, redirectUri) {
    const clientId = config.BOT_CLIENT_ID || process.env.BOT_CLIENT_ID;
    if (!clientId) {
      throw new Error('BOT_CLIENT_ID not configured');
    }

    // OAuth2 scopes needed for adding users to guild
    const scopes = ['guilds.join', 'identify'];
    const state = Buffer.from(JSON.stringify({ userId, guildId })).toString('base64');
    
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state: state
    });

    return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  static async exchangeCodeForToken(code, redirectUri) {
    const clientId = config.BOT_CLIENT_ID || process.env.BOT_CLIENT_ID;
    const clientSecret = config.BOT_CLIENT_SECRET || process.env.BOT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('OAuth2 credentials not configured');
    }

    try {
      const response = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Token exchange failed: ${error}`);
      }

      const data = await response.json();
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (data.expires_in * 1000),
        tokenType: data.token_type
      };
    } catch (error) {
      console.error('[OAUTH2] Error exchanging code for token:', error);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  static async refreshAccessToken(userId) {
    const tokenData = this.getToken(userId);
    if (!tokenData || !tokenData.refreshToken) {
      throw new Error('No refresh token available');
    }

    const clientId = config.BOT_CLIENT_ID || process.env.BOT_CLIENT_ID;
    const clientSecret = config.BOT_CLIENT_SECRET || process.env.BOT_CLIENT_SECRET;

    try {
      const response = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: tokenData.refreshToken
        })
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      this.storeToken(userId, data.access_token, data.refresh_token || tokenData.refreshToken, Date.now() + (data.expires_in * 1000));
      return data.access_token;
    } catch (error) {
      console.error('[OAUTH2] Error refreshing token:', error);
      throw error;
    }
  }

  /**
   * Add user to guild using OAuth2 token (like Restorecord)
   */
  static async addUserToGuild(userId, guildId, botToken) {
    const tokenData = this.getToken(userId);
    
    if (!tokenData) {
      throw new Error('User has not authorized the bot');
    }

    // Check if token is expired and refresh if needed
    let accessToken = tokenData.accessToken;
    if (this.isTokenExpired(tokenData)) {
      console.log(`[OAUTH2] Token expired for ${userId}, refreshing...`);
      accessToken = await this.refreshAccessToken(userId);
    }

    try {
      // Use Discord API to add member to guild
      const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          access_token: accessToken
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 401) {
          // Token invalid, remove it
          this.removeToken(userId);
          throw new Error('OAuth2 token invalid - user needs to reauthorize');
        }
        throw new Error(`Failed to add user to guild: ${errorText}`);
      }

      const member = await response.json();
      console.log(`[OAUTH2] ✅ Successfully added user ${userId} to guild ${guildId}`);
      return member;
    } catch (error) {
      console.error('[OAUTH2] Error adding user to guild:', error);
      throw error;
    }
  }

  /**
   * Get all users with stored tokens
   */
  static getAllAuthorizedUsers() {
    const tokens = this.loadTokens();
    return Object.keys(tokens).map(userId => ({
      userId,
      ...tokens[userId]
    }));
  }

  /**
   * Check if user has valid OAuth2 authorization
   */
  static hasValidAuthorization(userId) {
    const tokenData = this.getToken(userId);
    return tokenData && !this.isTokenExpired(tokenData);
  }
}

