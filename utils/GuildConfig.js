import { readFileSync, writeFileSync, existsSync } from 'fs';

const GUILD_CONFIG_FILE = './guildConfigs.json';

let guildConfigs = {};

// Cargar configuraciones de servidores
function loadGuildConfigs() {
  try {
    if (existsSync(GUILD_CONFIG_FILE)) {
      const data = readFileSync(GUILD_CONFIG_FILE, 'utf-8');
      guildConfigs = JSON.parse(data);
      console.log(`[GUILD CONFIG] ✅ Loaded ${Object.keys(guildConfigs).length} server configuration(s)`);
    } else {
      console.log('[GUILD CONFIG] No existing config file found, starting fresh');
      guildConfigs = {};
    }
  } catch (error) {
    console.error('[GUILD CONFIG] ❌ Error loading:', error);
    guildConfigs = {};
  }
}

// Guardar configuraciones de servidores (sincrónico y robusto)
function saveGuildConfigs() {
  try {
    const data = JSON.stringify(guildConfigs, null, 2);
    writeFileSync(GUILD_CONFIG_FILE, data, 'utf-8');
    
    // Verificar que se guardó correctamente
    if (existsSync(GUILD_CONFIG_FILE)) {
      const savedData = readFileSync(GUILD_CONFIG_FILE, 'utf-8');
      if (savedData === data) {
        console.log(`[GUILD CONFIG] ✅ Configuration saved successfully (${Object.keys(guildConfigs).length} server(s))`);
        return true;
      } else {
        console.error('[GUILD CONFIG] ⚠️ Warning: Saved data does not match expected data');
        return false;
      }
    } else {
      console.error('[GUILD CONFIG] ❌ Error: Config file was not created');
      return false;
    }
  } catch (error) {
    console.error('[GUILD CONFIG] ❌ Error saving:', error);
    return false;
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
   * Configurar un servidor (crear o actualizar)
   */
  static setConfig(guildId, config) {
    const isNew = !guildConfigs[guildId];
    
    if (!guildConfigs[guildId]) {
      guildConfigs[guildId] = {};
    }
    
    // Preservar configuración existente y actualizar con nueva
    guildConfigs[guildId] = {
      ...guildConfigs[guildId],
      ...config,
      configuredAt: guildConfigs[guildId].configuredAt || new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };
    
    const saved = saveGuildConfigs();
    if (saved) {
      console.log(`[GUILD CONFIG] ${isNew ? '✅ Created' : '🔄 Updated'} configuration for guild: ${guildId} (${config.guildName || 'Unknown'})`);
    } else {
      console.error(`[GUILD CONFIG] ❌ Failed to save configuration for guild: ${guildId}`);
    }
    
    return guildConfigs[guildId];
  }

  /**
   * Actualizar configuración existente de un servidor (solo actualiza campos proporcionados)
   */
  static updateConfig(guildId, updates) {
    if (!guildConfigs[guildId]) {
      console.warn(`[GUILD CONFIG] ⚠️ Attempted to update non-existent config for guild: ${guildId}. Use setConfig() instead.`);
      return null;
    }
    
    // Actualizar solo los campos proporcionados
    guildConfigs[guildId] = {
      ...guildConfigs[guildId],
      ...updates,
      lastUpdated: new Date().toISOString()
    };
    
    const saved = saveGuildConfigs();
    if (saved) {
      console.log(`[GUILD CONFIG] 🔄 Updated configuration for guild: ${guildId}`);
    } else {
      console.error(`[GUILD CONFIG] ❌ Failed to save updated configuration for guild: ${guildId}`);
    }
    
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

