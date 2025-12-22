import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import axios from 'axios';

// Usar directorio de datos persistente si está configurado (para Railway Volumes)
// En Railway, usar /data si existe, sino usar el directorio actual
const DATA_DIR = process.env.DATA_DIR || (existsSync('/data') ? '/data' : './');
const GUILD_CONFIG_FILE = DATA_DIR.endsWith('/') 
  ? `${DATA_DIR}guildConfigs.json`
  : `${DATA_DIR}/guildConfigs.json`;

// Backup automático: también guardar en variable de entorno de Railway (si está disponible)
const RAILWAY_ENV_BACKUP_KEY = 'GUILD_CONFIGS_BACKUP';

// Logging de la ruta del archivo para diagnóstico
console.log(`[GUILD CONFIG] 📁 Config file path: ${GUILD_CONFIG_FILE}`);
console.log(`[GUILD CONFIG] 📁 DATA_DIR: ${DATA_DIR}`);
console.log(`[GUILD CONFIG] 📁 Absolute path: ${resolve(GUILD_CONFIG_FILE)}`);

// Asegurar que el directorio existe
try {
  const configDir = dirname(GUILD_CONFIG_FILE);
  if (configDir !== '.' && !existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
    console.log(`[GUILD CONFIG] ✅ Created data directory: ${configDir}`);
  } else if (configDir !== '.') {
    console.log(`[GUILD CONFIG] ✅ Data directory exists: ${configDir}`);
  }
} catch (error) {
  console.warn(`[GUILD CONFIG] ⚠️ Could not create data directory: ${error.message}`);
}

let guildConfigs = {};

// Cargar configuraciones de servidores
function loadGuildConfigs() {
  try {
    // Primero intentar cargar desde archivo
    if (existsSync(GUILD_CONFIG_FILE)) {
      const data = readFileSync(GUILD_CONFIG_FILE, 'utf-8');
      guildConfigs = JSON.parse(data);
      const guildCount = Object.keys(guildConfigs).length;
      console.log(`[GUILD CONFIG] ✅ Loaded ${guildCount} server configuration(s) from ${GUILD_CONFIG_FILE}`);
      
      // Mostrar detalles de cada configuración cargada
      if (guildCount > 0) {
        for (const [guildId, config] of Object.entries(guildConfigs)) {
          console.log(`[GUILD CONFIG]   - Guild ${guildId}: ${config.guildName || 'Unknown'} (Admin: ${config.adminRoleId || 'Not set'})`);
        }
      }
      return; // Archivo encontrado, no intentar backup
    }
    
    // Si no existe el archivo, intentar cargar desde backup en variable de entorno
    const backupData = process.env[RAILWAY_ENV_BACKUP_KEY];
    if (backupData) {
      try {
        const parsed = JSON.parse(backupData);
        if (parsed && typeof parsed === 'object') {
          guildConfigs = parsed;
          const guildCount = Object.keys(guildConfigs).length;
          console.log(`[GUILD CONFIG] ✅ Loaded ${guildCount} server configuration(s) from environment backup`);
          
          // Restaurar al archivo para futuras cargas
          if (guildCount > 0) {
            const saved = saveGuildConfigs();
            if (saved) {
              console.log(`[GUILD CONFIG] ✅ Restored configuration from backup to file`);
            } else {
              console.warn(`[GUILD CONFIG] ⚠️ Could not save restored configuration to file`);
            }
          }
          
          // Mostrar detalles
          if (guildCount > 0) {
            for (const [guildId, config] of Object.entries(guildConfigs)) {
              console.log(`[GUILD CONFIG]   - Guild ${guildId}: ${config.guildName || 'Unknown'} (Admin: ${config.adminRoleId || 'Not set'})`);
            }
          }
          return;
        }
      } catch (parseError) {
        console.warn(`[GUILD CONFIG] ⚠️ Failed to parse backup data: ${parseError.message}`);
      }
    }
    
    // Si no hay archivo ni backup, empezar desde cero
    console.log(`[GUILD CONFIG] ⚠️ No existing config file found at ${GUILD_CONFIG_FILE} and no backup available, starting fresh`);
    guildConfigs = {};
  } catch (error) {
    console.error(`[GUILD CONFIG] ❌ Error loading from ${GUILD_CONFIG_FILE}:`, error);
    guildConfigs = {};
  }
}

// Guardar configuraciones de servidores (sincrónico y robusto con múltiples intentos)
function saveGuildConfigs() {
  const maxRetries = 3;
  let lastError = null;
  const data = JSON.stringify(guildConfigs, null, 2);
  
  // Guardar en archivo
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Intentar escribir el archivo
      writeFileSync(GUILD_CONFIG_FILE, data, 'utf-8');
      
      // Esperar un momento para que el sistema de archivos se actualice
      if (attempt < maxRetries) {
        // Pequeño delay solo si no es el último intento
        const start = Date.now();
        while (Date.now() - start < 50) {} // 50ms delay
      }
      
      // Verificar que se guardó correctamente
      if (existsSync(GUILD_CONFIG_FILE)) {
        const savedData = readFileSync(GUILD_CONFIG_FILE, 'utf-8');
        if (savedData === data) {
          const fileSize = savedData.length;
          const guildCount = Object.keys(guildConfigs).length;
          console.log(`[GUILD CONFIG] ✅ Configuration saved successfully to ${GUILD_CONFIG_FILE}`);
          console.log(`[GUILD CONFIG]   - File size: ${fileSize} bytes`);
          console.log(`[GUILD CONFIG]   - Servers configured: ${guildCount}`);
          console.log(`[GUILD CONFIG]   - Attempt: ${attempt}/${maxRetries}`);
          
          // También guardar en backup (variable de entorno) de forma asíncrona
          saveBackupAsync(data);
          
          return true;
        } else {
          lastError = new Error('Saved data does not match expected data');
          if (attempt < maxRetries) {
            console.warn(`[GUILD CONFIG] ⚠️ Attempt ${attempt} failed: Data mismatch. Retrying...`);
            continue;
          }
        }
      } else {
        lastError = new Error(`Config file was not created at ${GUILD_CONFIG_FILE}`);
        if (attempt < maxRetries) {
          console.warn(`[GUILD CONFIG] ⚠️ Attempt ${attempt} failed: File not created at ${GUILD_CONFIG_FILE}. Retrying...`);
          continue;
        }
      }
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        console.warn(`[GUILD CONFIG] ⚠️ Attempt ${attempt} failed: ${error.message}. Retrying...`);
        // Esperar antes de reintentar
        const start = Date.now();
        while (Date.now() - start < 100) {} // 100ms delay
      }
    }
  }
  
  // Si todos los intentos fallaron, al menos intentar guardar el backup
  console.error(`[GUILD CONFIG] ❌ Error saving file after ${maxRetries} attempts:`, lastError?.message || 'Unknown error');
  console.log(`[GUILD CONFIG] 🔄 Attempting to save backup only...`);
  saveBackupAsync(data);
  
  return false;
}

// Guardar backup en variable de entorno de Railway usando la API
async function saveBackupAsync(data) {
  try {
    // Valores por defecto del proyecto de Railway
    const railwayToken = process.env.RAILWAY_TOKEN || '567c878a-6d6f-4f15-8236-7345b75afec2';
    const projectId = process.env.RAILWAY_PROJECT_ID || 'f0ed44fd-ead6-4d32-8e31-dcaf06726015';
    const environmentId = process.env.RAILWAY_ENVIRONMENT_ID || 'c7ed3caa-9689-4f8e-a925-845a6642ccb6';
    
    // Si tenemos el token y el project ID, intentar guardar en Railway
    if (railwayToken && projectId) {
      try {
        // Comprimir datos si son muy grandes (Railway tiene límite de 64KB por variable)
        let backupData = data;
        if (data.length > 50000) {
          // Si es muy grande, usar solo los campos esenciales
          const essential = {};
          for (const [guildId, config] of Object.entries(guildConfigs)) {
            essential[guildId] = {
              adminRoleId: config.adminRoleId,
              staffRoleId: config.staffRoleId,
              guildName: config.guildName,
              configuredAt: config.configuredAt,
              lastUpdated: config.lastUpdated
            };
          }
          backupData = JSON.stringify(essential);
          console.log(`[GUILD CONFIG] 💾 Compressed backup data (${data.length} -> ${backupData.length} bytes)`);
        }
        
        // Actualizar variable de entorno usando Railway API
        const response = await axios.patch(
          `https://api.railway.app/v1/variables/${RAILWAY_ENV_BACKUP_KEY}`,
          {
            value: backupData
          },
          {
            headers: {
              'Authorization': `Bearer ${railwayToken}`,
              'Content-Type': 'application/json'
            },
            params: {
              projectId: projectId,
              environmentId: environmentId || 'production'
            }
          }
        ).catch(async (error) => {
          // Si la variable no existe, crearla
          if (error.response?.status === 404) {
            return await axios.post(
              'https://api.railway.app/v1/variables',
              {
                name: RAILWAY_ENV_BACKUP_KEY,
                value: backupData,
                projectId: projectId,
                environmentId: environmentId || 'production'
              },
              {
                headers: {
                  'Authorization': `Bearer ${railwayToken}`,
                  'Content-Type': 'application/json'
                }
              }
            );
          }
          throw error;
        });
        
        console.log(`[GUILD CONFIG] ✅ Backup saved to Railway environment variable (${backupData.length} bytes)`);
      } catch (apiError) {
        // No crítico si falla, solo loguear
        console.warn(`[GUILD CONFIG] ⚠️ Could not save backup to Railway: ${apiError.response?.data?.message || apiError.message}`);
      }
    } else {
      console.log(`[GUILD CONFIG] 💾 Backup data prepared (${data.length} bytes) - Railway API not configured`);
    }
  } catch (error) {
    // No crítico, solo loguear
    console.warn(`[GUILD CONFIG] ⚠️ Backup save error: ${error.message}`);
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
    // Recargar antes de guardar para evitar sobrescribir cambios concurrentes
    loadGuildConfigs();
    
    const isNew = !guildConfigs[guildId];
    
    if (!guildConfigs[guildId]) {
      guildConfigs[guildId] = {};
    }
    
    // Preservar configuración existente y actualizar con nueva
    guildConfigs[guildId] = {
      ...guildConfigs[guildId],
      ...config,
      guildId: guildId, // Asegurar que el guildId esté presente
      configuredAt: guildConfigs[guildId].configuredAt || new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };
    
    // Intentar guardar múltiples veces si es necesario
    let saved = saveGuildConfigs();
    if (!saved) {
      // Si falla, intentar una vez más después de un breve delay
      console.warn(`[GUILD CONFIG] ⚠️ First save attempt failed, retrying...`);
      const start = Date.now();
      while (Date.now() - start < 200) {} // 200ms delay
      saved = saveGuildConfigs();
    }
    
    if (saved) {
      console.log(`[GUILD CONFIG] ${isNew ? '✅ Created' : '🔄 Updated'} configuration for guild: ${guildId} (${config.guildName || 'Unknown'})`);
      // Verificar inmediatamente que se guardó correctamente
      loadGuildConfigs();
      if (guildConfigs[guildId] && guildConfigs[guildId].adminRoleId === config.adminRoleId) {
        console.log(`[GUILD CONFIG] ✅ Verified: Configuration persisted correctly`);
      } else {
        console.error(`[GUILD CONFIG] ⚠️ Warning: Configuration may not have persisted correctly`);
      }
    } else {
      console.error(`[GUILD CONFIG] ❌ Failed to save configuration for guild: ${guildId} after multiple attempts`);
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
    // Recargar antes de devolver para asegurar datos actualizados
    loadGuildConfigs();
    return guildConfigs;
  }

  /**
   * Recargar configuraciones desde el archivo (útil después de cambios externos)
   */
  static reload() {
    loadGuildConfigs();
    console.log(`[GUILD CONFIG] 🔄 Reloaded ${Object.keys(guildConfigs).length} server configuration(s)`);
    return guildConfigs;
  }

  /**
   * Verificar y reparar configuración (marca como no configurado si falta adminRoleId)
   */
  static verifyAndRepair(guildId) {
    loadGuildConfigs();
    if (guildConfigs[guildId] && !guildConfigs[guildId].adminRoleId) {
      console.warn(`[GUILD CONFIG] ⚠️ Configuration for guild ${guildId} is incomplete (missing adminRoleId)`);
      return false;
    }
    return !!guildConfigs[guildId];
  }
}

