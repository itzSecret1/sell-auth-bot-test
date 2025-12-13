import { readFileSync, writeFileSync, existsSync } from 'fs';

const GUILD_CONFIG_FILE = './guildConfigs.json';

let guildConfigs = {};

// Cargar configuraciones de servidores
function loadGuildConfigs() {
  try {
    if (existsSync(GUILD_CONFIG_FILE)) {
      const data = readFileSync(GUILD_CONFIG_FILE, 'utf-8');
      guildConfigs = JSON.parse(data);
    }
  } catch (error) {
    console.error('[GUILD CONFIG] Error loading:', error);
    guildConfigs = {};
  }
}

// Guardar configuraciones de servidores
function saveGuildConfigs() {
  try {
    writeFileSync(GUILD_CONFIG_FILE, JSON.stringify(guildConfigs, null, 2), 'utf-8');
  } catch (error) {
    console.error('[GUILD CONFIG] Error saving:', error);
  }
}

// Inicializar
loadGuildConfigs();

export class GuildConfig {
  /**
   * Obtener configuración de un servidor
   */
  static getConfig(guildId) {
    return guildConfigs[guildId] || null;
  }

  /**
   * Configurar un servidor
   */
  static setConfig(guildId, config) {
    if (!guildConfigs[guildId]) {
      guildConfigs[guildId] = {};
    }
    
    guildConfigs[guildId] = {
      ...guildConfigs[guildId],
      ...config,
      configuredAt: new Date().toISOString()
    };
    
    saveGuildConfigs();
    return guildConfigs[guildId];
  }

  /**
   * Verificar si un servidor está configurado
   */
  static isConfigured(guildId) {
    return !!guildConfigs[guildId] && !!guildConfigs[guildId].adminRoleId;
  }

  /**
   * Obtener rol de admin de un servidor
   */
  static getAdminRole(guildId) {
    return guildConfigs[guildId]?.adminRoleId || null;
  }

  /**
   * Obtener rol de staff de un servidor
   */
  static getStaffRole(guildId) {
    return guildConfigs[guildId]?.staffRoleId || null;
  }

  /**
   * Obtener rol de customer de un servidor
   */
  static getCustomerRole(guildId) {
    return guildConfigs[guildId]?.customerRoleId || null;
  }

  /**
   * Obtener canal de logs de un servidor
   */
  static getLogChannel(guildId) {
    return guildConfigs[guildId]?.logChannelId || null;
  }

  /**
   * Obtener canal de transcripts de un servidor
   */
  static getTranscriptChannel(guildId) {
    return guildConfigs[guildId]?.transcriptChannelId || null;
  }

  /**
   * Obtener canal de ratings de un servidor
   */
  static getRatingChannel(guildId) {
    return guildConfigs[guildId]?.ratingChannelId || null;
  }

  /**
   * Eliminar configuración de un servidor
   */
  static removeConfig(guildId) {
    if (guildConfigs[guildId]) {
      delete guildConfigs[guildId];
      saveGuildConfigs();
      return true;
    }
    return false;
  }

  /**
   * Obtener todos los servidores configurados
   */
  static getAllConfigs() {
    return guildConfigs;
  }
}

