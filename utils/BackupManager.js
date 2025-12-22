/**
 * BackupManager - Handles server backup and restore
 * Saves: Roles, Channels, Permissions, Bot Configurations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BACKUPS_DIR = path.join(__dirname, '..', 'data', 'backups');

// Ensure backups directory exists
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

export class BackupManager {
  /**
   * Create a backup of the server
   * @param {Guild} guild - Discord Guild object
   * @param {string} backupName - Name for the backup
   * @returns {Object} Backup data
   */
  static async createBackup(guild, backupName) {
    try {
      console.log(`[BACKUP] Creating backup "${backupName}" for ${guild.name}...`);

      // Prepare timestamp
      const now = new Date();
      const dateString = now.toISOString().split('T')[0]; // YYYY-MM-DD format
      const timeString = now.toTimeString().split(' ')[0]; // HH:MM:SS format
      const timestamp = `${dateString} ${timeString}`;

      const backupData = {
        guildId: guild.id,
        guildName: guild.name,
        backupName,
        timestamp,
        date: dateString,
        time: timeString,
        createdAt: now.toISOString(),

        // Roles
        roles: [],

        // Channels
        channels: [],

        // Bot permissions
        botPermissions: null,

        // Server settings
        settings: {
          name: guild.name,
          description: guild.description,
          icon: guild.iconURL(),
          defaultMessageNotifications: guild.defaultMessageNotifications,
          verificationLevel: guild.verificationLevel,
          contentFilter: guild.explicitContentFilter,
          afkTimeout: guild.afkTimeout,
          systemChannel: guild.systemChannel?.id || null,
          mfaLevel: guild.mfaLevel,
          nsfw: guild.nsfwLevel
        }
      };

      // Backup roles (skip @everyone)
      for (const [, role] of guild.roles.cache) {
        if (role.id !== guild.id) {
          backupData.roles.push({
            name: role.name,
            color: role.color,
            hoist: role.hoist,
            mentionable: role.mentionable,
            permissions: role.permissions.bitfield.toString(),
            position: role.position,
            icon: role.icon,
            unicodeEmoji: role.unicodeEmoji
          });
        }
      }

      // Backup categories first
      const categories = [];
      for (const [, category] of guild.channels.cache) {
        if (category.type === 4) { // Category channel
          categories.push({
            name: category.name,
            position: category.position,
            permissionOverwrites: []
          });

          // Backup category permission overwrites
          for (const [, overwrite] of category.permissionOverwrites.cache) {
            categories[categories.length - 1].permissionOverwrites.push({
              id: overwrite.id,
              type: overwrite.type,
              allow: overwrite.allow.bitfield.toString(),
              deny: overwrite.deny.bitfield.toString()
            });
          }
        }
      }
      backupData.categories = categories;

      // Backup channels (excluding tickets)
      const { TicketManager } = await import('./TicketManager.js');
      const ticketChannels = new Set();
      
      // Obtener todos los canales de tickets
      try {
        const ticketsFilePath = path.join(process.cwd(), 'tickets.json');
        if (fs.existsSync(ticketsFilePath)) {
          const ticketsData = JSON.parse(fs.readFileSync(ticketsFilePath, 'utf-8'));
          for (const ticket of Object.values(ticketsData.tickets || {})) {
            if (ticket.channelId) {
              ticketChannels.add(ticket.channelId);
            }
          }
        }
      } catch (e) {
        console.log('[BACKUP] No tickets file found or error reading it');
      }

      for (const [, channel] of guild.channels.cache) {
        // Skip ticket channels
        if (ticketChannels.has(channel.id)) {
          console.log(`[BACKUP] Skipping ticket channel: ${channel.name}`);
          continue;
        }

        // Skip category channels (already backed up)
        if (channel.type === 4) continue;

        const channelData = {
          name: channel.name,
          type: channel.type,
          position: channel.position,
          topic: channel.topic,
          nsfw: channel.nsfw,
          bitrate: channel.bitrate,
          userLimit: channel.userLimit,
          permissionOverwrites: [],
          parentId: channel.parentId,
          messages: [] // Para guardar mensajes
        };

        // Backup permission overwrites
        for (const [, overwrite] of channel.permissionOverwrites.cache) {
          channelData.permissionOverwrites.push({
            id: overwrite.id,
            type: overwrite.type,
            allow: overwrite.allow.bitfield.toString(),
            deny: overwrite.deny.bitfield.toString()
          });
        }

        // Backup messages (solo para canales de texto, máximo 100 por canal)
        if (channel.type === 0) { // GuildText
          try {
            const messages = await channel.messages.fetch({ limit: 100 });
            for (const [, message] of messages) {
              channelData.messages.push({
                id: message.id,
                content: message.content,
                author: {
                  id: message.author.id,
                  username: message.author.username,
                  tag: message.author.tag
                },
                timestamp: message.createdTimestamp,
                embeds: message.embeds.map(e => ({
                  title: e.title,
                  description: e.description,
                  color: e.color,
                  fields: e.fields,
                  footer: e.footer,
                  timestamp: e.timestamp
                })),
                attachments: message.attachments.map(a => ({
                  name: a.name,
                  url: a.url,
                  contentType: a.contentType
                }))
              });
            }
          } catch (msgError) {
            console.error(`[BACKUP] Error backing up messages for ${channel.name}: ${msgError.message}`);
          }
        }

        backupData.channels.push(channelData);
      }

      // Backup bot info
      if (guild.members.me) {
        backupData.botPermissions = {
          nickname: guild.members.me.nickname,
          roles: Array.from(guild.members.me.roles.cache.values()).map(r => r.name)
        };
      }

      // Save to file
      const fileName = `${backupName}_${dateString}.json`;
      const filePath = path.join(BACKUPS_DIR, fileName);

      fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));

      console.log(`[BACKUP] ✅ Backup saved: ${fileName}`);

      return {
        success: true,
        fileName,
        timestamp,
        data: backupData
      };
    } catch (error) {
      console.error('[BACKUP] Error creating backup:', error);
      throw error;
    }
  }

  /**
   * List all available backups
   * @returns {Array} List of backup files
   */
  static listBackups() {
    try {
      const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.json'));
      return files.map(f => {
        const content = fs.readFileSync(path.join(BACKUPS_DIR, f), 'utf-8');
        const data = JSON.parse(content);
        return {
          fileName: f,
          backupName: data.backupName,
          guildName: data.guildName,
          timestamp: data.timestamp,
          date: data.date
        };
      });
    } catch (error) {
      console.error('[BACKUP] Error listing backups:', error);
      return [];
    }
  }

  /**
   * Load a backup by name and date
   * @param {string} backupName - Name of the backup
   * @param {string} date - Date (YYYY-MM-DD format)
   * @returns {Object} Backup data
   */
  static loadBackup(backupName, date) {
    try {
      const fileName = `${backupName}_${date}.json`;
      const filePath = path.join(BACKUPS_DIR, fileName);

      if (!fs.existsSync(filePath)) {
        throw new Error(`Backup not found: ${fileName}`);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);

      console.log(`[BACKUP] Loaded backup: ${fileName}`);
      return data;
    } catch (error) {
      console.error('[BACKUP] Error loading backup:', error);
      throw error;
    }
  }

  /**
   * Restore a backup to a guild
   * @param {Guild} guild - Discord Guild object
   * @param {Object} backupData - Backup data
   * @returns {Object} Restore result
   */
  static async restoreBackup(guild, backupData) {
    try {
      console.log(`[RESTORE] Restoring backup to ${guild.name}...`);

      let restored = {
        roles: 0,
        channels: 0,
        permissions: 0,
        errors: []
      };

      // Restore roles
      console.log(`[RESTORE] Restoring roles...`);
      for (const roleData of backupData.roles) {
        try {
          const existingRole = guild.roles.cache.find(r => r.name === roleData.name);

          if (existingRole) {
            // Update existing role
            await existingRole.edit({
              color: roleData.color,
              hoist: roleData.hoist,
              mentionable: roleData.mentionable,
              permissions: roleData.permissions
            });
          } else {
            // Create new role
            await guild.roles.create({
              name: roleData.name,
              color: roleData.color,
              hoist: roleData.hoist,
              mentionable: roleData.mentionable,
              permissions: roleData.permissions
            });
          }
          restored.roles++;
        } catch (error) {
          console.error(`[RESTORE] Error restoring role ${roleData.name}:`, error.message);
          restored.errors.push(`Role ${roleData.name}: ${error.message}`);
        }
      }

      // Restore categories first
      console.log(`[RESTORE] Restoring categories...`);
      const categoryMap = new Map();
      
      if (backupData.categories) {
        for (const categoryData of backupData.categories) {
          try {
            const existingCategory = guild.channels.cache.find(c => c.type === 4 && c.name === categoryData.name);
            
            if (existingCategory) {
              await existingCategory.edit({
                name: categoryData.name,
                position: categoryData.position
              });
              categoryMap.set(categoryData.name, existingCategory.id);
            } else {
              const newCategory = await guild.channels.create({
                name: categoryData.name,
                type: 4, // Category
                position: categoryData.position
              });
              categoryMap.set(categoryData.name, newCategory.id);
            }
            
            // Restore category permissions
            const category = guild.channels.cache.get(categoryMap.get(categoryData.name));
            if (category) {
              for (const overwrite of categoryData.permissionOverwrites) {
                try {
                  const target = guild.roles.cache.get(overwrite.id) || guild.members.cache.get(overwrite.id);
                  if (target) {
                    await category.permissionOverwrites.create(target, {
                      Allow: BigInt(overwrite.allow),
                      Deny: BigInt(overwrite.deny)
                    });
                  }
                } catch (permError) {
                  console.error(`[RESTORE] Error setting category permissions: ${permError.message}`);
                }
              }
            }
          } catch (error) {
            console.error(`[RESTORE] Error restoring category ${categoryData.name}:`, error.message);
            restored.errors.push(`Category ${categoryData.name}: ${error.message}`);
          }
        }
      }

      // Restore channels
      console.log(`[RESTORE] Restoring channels...`);
      const channelMap = new Map(); // Map old channel names to new IDs

      for (const channelData of backupData.channels) {
        try {
          // Find parent category if exists
          let parentId = null;
          if (channelData.parentId) {
            // Try to find category by old ID or name
            const parentCategory = guild.channels.cache.find(c => 
              c.type === 4 && (c.id === channelData.parentId || c.name === channelData.name)
            );
            if (parentCategory) {
              parentId = parentCategory.id;
            }
          }

          const existingChannel = guild.channels.cache.find(c => c.name === channelData.name && c.type === channelData.type);

          if (existingChannel) {
            await existingChannel.edit({
              name: channelData.name,
              topic: channelData.topic,
              nsfw: channelData.nsfw,
              bitrate: channelData.bitrate,
              userLimit: channelData.userLimit,
              position: channelData.position,
              parent: parentId
            });
            channelMap.set(channelData.name, existingChannel.id);
          } else {
            const newChannel = await guild.channels.create({
              name: channelData.name,
              type: channelData.type,
              topic: channelData.topic,
              nsfw: channelData.nsfw,
              bitrate: channelData.bitrate,
              userLimit: channelData.userLimit,
              position: channelData.position,
              parent: parentId
            });
            channelMap.set(channelData.name, newChannel.id);
          }
          restored.channels++;
        } catch (error) {
          console.error(`[RESTORE] Error restoring channel ${channelData.name}:`, error.message);
          restored.errors.push(`Channel ${channelData.name}: ${error.message}`);
        }
      }

      // Restore permissions
      console.log(`[RESTORE] Restoring permissions...`);
      for (const channelData of backupData.channels) {
        try {
          const channel = guild.channels.cache.find(c => c.name === channelData.name);
          if (!channel) continue;

          for (const overwrites of channelData.permissionOverwrites) {
            try {
              const target = guild.roles.cache.get(overwrites.id) || guild.members.cache.get(overwrites.id);
              if (!target) continue;

              await channel.permissionOverwrites.create(target, {
                Allow: BigInt(overwrites.allow),
                Deny: BigInt(overwrites.deny)
              });
              restored.permissions++;
            } catch (error) {
              console.error(`[RESTORE] Error setting permissions for ${overwrites.id}:`, error.message);
            }
          }
        } catch (error) {
          console.error(`[RESTORE] Error processing channel permissions:`, error.message);
        }
      }

      console.log(`[RESTORE] ✅ Restore completed:`, restored);
      return restored;
    } catch (error) {
      console.error('[RESTORE] Error restoring backup:', error);
      throw error;
    }
  }
}

export default BackupManager;
