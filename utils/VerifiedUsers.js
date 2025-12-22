import { readFileSync, writeFileSync, existsSync } from 'fs';

const VERIFIED_USERS_FILE = './verifiedUsers.json';

let verifiedUsersData = {
  users: {}, // { userId: { userId, username, discriminator, tag, verifiedAt, guildId } }
  lastUpdated: null
};

// Cargar usuarios verificados
function loadVerifiedUsers() {
  try {
    if (existsSync(VERIFIED_USERS_FILE)) {
      const data = readFileSync(VERIFIED_USERS_FILE, 'utf-8');
      verifiedUsersData = JSON.parse(data);
    }
  } catch (error) {
    console.error('[VERIFIED-USERS] Error loading:', error);
    verifiedUsersData = { users: {}, lastUpdated: null };
  }
}

// Guardar usuarios verificados
function saveVerifiedUsers() {
  try {
    verifiedUsersData.lastUpdated = new Date().toISOString();
    writeFileSync(VERIFIED_USERS_FILE, JSON.stringify(verifiedUsersData, null, 2), 'utf-8');
  } catch (error) {
    console.error('[VERIFIED-USERS] Error saving:', error);
  }
}

// Inicializar
loadVerifiedUsers();

export class VerifiedUsers {
  /**
   * Añadir un usuario verificado
   */
  static addVerifiedUser(userId, username, discriminator, tag, guildId) {
    if (!verifiedUsersData.users[userId]) {
      verifiedUsersData.users[userId] = {
        userId: userId,
        username: username,
        discriminator: discriminator,
        tag: tag,
        verifiedAt: new Date().toISOString(),
        guildId: guildId,
        lastSeen: new Date().toISOString(),
        verifiedGuilds: guildId ? [guildId] : []
      };
      saveVerifiedUsers();
      console.log(`[VERIFIED-USERS] ✅ Added verified user: ${tag} (${userId})`);
      return true;
    } else {
      // Actualizar información si ya existe
      verifiedUsersData.users[userId].username = username;
      verifiedUsersData.users[userId].discriminator = discriminator;
      verifiedUsersData.users[userId].tag = tag;
      verifiedUsersData.users[userId].lastSeen = new Date().toISOString();
      
      // Añadir guildId a la lista si no está
      if (guildId) {
        if (!verifiedUsersData.users[userId].verifiedGuilds) {
          verifiedUsersData.users[userId].verifiedGuilds = [];
        }
        if (!verifiedUsersData.users[userId].verifiedGuilds.includes(guildId)) {
          verifiedUsersData.users[userId].verifiedGuilds.push(guildId);
        }
        if (!verifiedUsersData.users[userId].guildId) {
          verifiedUsersData.users[userId].guildId = guildId;
        }
      }
      
      saveVerifiedUsers();
      return false; // Ya existía
    }
  }

  /**
   * Remover un usuario verificado
   */
  static removeVerifiedUser(userId) {
    if (verifiedUsersData.users[userId]) {
      delete verifiedUsersData.users[userId];
      saveVerifiedUsers();
      console.log(`[VERIFIED-USERS] ❌ Removed verified user: ${userId}`);
      return true;
    }
    return false;
  }

  /**
   * Obtener todos los usuarios verificados
   */
  static getAllVerifiedUsers() {
    return Object.values(verifiedUsersData.users);
  }

  /**
   * Obtener un usuario verificado por ID
   */
  static getVerifiedUser(userId) {
    return verifiedUsersData.users[userId] || null;
  }

  /**
   * Verificar si un usuario está verificado
   */
  static isVerified(userId) {
    return !!verifiedUsersData.users[userId];
  }

  /**
   * Obtener estadísticas
   */
  static getStats() {
    const users = Object.values(verifiedUsersData.users);
    return {
      total: users.length,
      lastUpdated: verifiedUsersData.lastUpdated,
      users: users
    };
  }

  /**
   * Limpiar usuarios antiguos (opcional, para mantenimiento)
   */
  static cleanOldUsers(daysOld = 365) {
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - (daysOld * 24 * 60 * 60 * 1000));
    
    let removed = 0;
    for (const [userId, userData] of Object.entries(verifiedUsersData.users)) {
      const verifiedDate = new Date(userData.verifiedAt);
      if (verifiedDate < cutoffDate) {
        delete verifiedUsersData.users[userId];
        removed++;
      }
    }
    
    if (removed > 0) {
      saveVerifiedUsers();
      console.log(`[VERIFIED-USERS] 🧹 Cleaned ${removed} old users (older than ${daysOld} days)`);
    }
    
    return removed;
  }
}

