import { EmbedBuilder } from 'discord.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const BACKUP_CHANNEL_ID = '1442913427575013426';
const BACKUP_DIR = './backups';

/**
 * DailyBackupReporter - Creates daily backups and reports to staff
 */
export class DailyBackupReporter {
  constructor(client) {
    this.client = client;
  }

  /**
   * Create backup of critical data
   */
  async createBackup() {
    try {
      // Ensure backup directory exists
      if (!existsSync(BACKUP_DIR)) {
        const fs = await import('fs');
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }

      const timestamp = new Date().toISOString();
      const backupName = `backup_${new Date().toISOString().split('T')[0]}`;
      const backupPath = join(BACKUP_DIR, `${backupName}.json`);

      const backupData = {
        timestamp: timestamp,
        data: {}
      };

      // Backup key files
      const filesToBackup = ['variantsData.json', 'replaceHistory.json', 'sessionState.json'];

      for (const file of filesToBackup) {
        try {
          if (existsSync(`./${file}`)) {
            backupData.data[file] = JSON.parse(readFileSync(`./${file}`, 'utf-8'));
          }
        } catch (e) {
          console.error(`[BACKUP] Error backing up ${file}:`, e.message);
        }
      }

      writeFileSync(backupPath, JSON.stringify(backupData, null, 2));

      return {
        success: true,
        path: backupPath,
        timestamp: timestamp,
        filesBackedUp: Object.keys(backupData.data).length
      };
    } catch (error) {
      console.error('[BACKUP] Error creating backup:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send backup report to channel
   */
  async sendBackupReport() {
    try {
      const channel = this.client.channels.cache.get(BACKUP_CHANNEL_ID);
      if (!channel) {
        console.error('[BACKUP] Backup channel not found');
        return;
      }

      const backup = await this.createBackup();

      if (!backup.success) {
        const errorEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('❌ Backup Failed')
          .setDescription(`Error: ${backup.error}`)
          .setTimestamp();

        await channel.send({ embeds: [errorEmbed] });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Daily Backup Completed')
        .setDescription('Automatic daily backup has been created successfully')
        .addFields(
          {
            name: '📅 Backup Date',
            value: new Date(backup.timestamp).toUTCString(),
            inline: true
          },
          {
            name: '📦 Files Backed Up',
            value: `**${backup.filesBackedUp}** files`,
            inline: true
          },
          {
            name: '💾 Backup Location',
            value: `\`${backup.path}\``,
            inline: false
          },
          {
            name: '📋 Backed Up Files',
            value: '• variantsData.json\n• replaceHistory.json\n• sessionState.json',
            inline: false
          }
        )
        .setFooter({
          text: 'SellAuth Bot Backup System',
          iconURL: 'https://cdn.discordapp.com/app-icons/1009849347124862193/2a07cee6e1c97f4ac1cbc8c8ef0b2d1c.png'
        })
        .setTimestamp();

      await channel.send({ embeds: [embed] });
      console.log('[BACKUP] ✅ Daily backup report sent');
    } catch (error) {
      console.error('[BACKUP] Error sending report:', error.message);
    }
  }

  /**
   * Schedule daily backups at 03:00 UTC
   */
  scheduleDailyBackups() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(3, 0, 0, 0);

    const timeUntilNext = tomorrow - now;

    console.log(
      `[BACKUP] ✅ Daily backups scheduled at 03:00 UTC (in ${Math.ceil(timeUntilNext / 1000 / 60)} minutes)`
    );

    // Schedule for first time
    setTimeout(
      () => {
        this.sendBackupReport();
        // Then schedule for every 24 hours
        setInterval(() => this.sendBackupReport(), 24 * 60 * 60 * 1000);
      },
      timeUntilNext
    );
  }
}

export const createDailyBackupReporter = (client) => new DailyBackupReporter(client);
