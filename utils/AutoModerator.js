import { EmbedBuilder } from 'discord.js';

const MODLOG_CHANNEL_ID = '1442913855964450901';
const OWNER_ROLE_ID = process.env.BOT_ADMIN_ROLE_ID;

/**
 * AutoModerator - Automatically handles rule violations
 */
export class AutoModerator {
  constructor(client) {
    this.client = client;
    this.discordInviteRegex = /(discord\.gg\/[a-z0-9]+|discordapp\.com\/invite\/[a-z0-9]+)/gi;
  }

  /**
   * Check if message violates rules
   */
  checkMessage(message) {
    const violations = [];

    // Check for Discord server invites
    const inviteMatches = message.content.match(this.discordInviteRegex);
    if (inviteMatches) {
      violations.push({
        type: 'discord_invite',
        details: inviteMatches,
        severity: 'high'
      });
    }

    return violations;
  }

  /**
   * Handle message rule violations
   */
  async handleViolations(message, violations) {
    try {
      // Skip if user is owner/admin
      if (message.author.bot) return;

      const isOwner = message.member?.roles.cache.has(OWNER_ROLE_ID);
      if (isOwner) return;

      for (const violation of violations) {
        if (violation.type === 'discord_invite') {
          // Delete the message
          await message.delete().catch(() => {});

          // Send warning to user
          const dmEmbed = new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle('⚠️ Message Deleted - Server Invite')
            .setDescription('Your message was deleted because it contained an invite to another Discord server.')
            .addFields(
              {
                name: '❌ Rule Violated',
                value: 'External server invites are not allowed'
              },
              {
                name: '📋 Action Taken',
                value: 'Message deleted'
              }
            )
            .setFooter({ text: 'SellAuth Bot Auto-Moderation' })
            .setTimestamp();

          try {
            await message.author.send({ embeds: [dmEmbed] });
          } catch (e) {
            // DM failed, continue
          }

          // Log to moderation channel
          const modLogEmbed = new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle('🚨 Auto-Moderation: Discord Invite Detected')
            .addFields(
              {
                name: '👤 User',
                value: `${message.author.tag} (${message.author.id})`
              },
              {
                name: '💬 Channel',
                value: `${message.channel.name || 'DM'}`
              },
              {
                name: '🔗 Invite(s) Found',
                value: violation.details.join(', ')
              },
              {
                name: '⚙️ Action',
                value: 'Message deleted'
              },
              {
                name: '🕐 Time',
                value: new Date().toUTCString()
              }
            )
            .setFooter({ text: 'SellAuth Bot Auto-Moderation' })
            .setTimestamp();

          const modChannel = this.client.channels.cache.get(MODLOG_CHANNEL_ID);
          if (modChannel) {
            await modChannel.send({ embeds: [modLogEmbed] });
          }

          console.log(`[AUTOMOD] ✅ Removed Discord invite from ${message.author.tag}`);
        }
      }
    } catch (error) {
      console.error('[AUTOMOD] Error handling violations:', error.message);
    }
  }

  /**
   * Setup event listeners
   */
  setup() {
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;

      const violations = this.checkMessage(message);
      if (violations.length > 0) {
        await this.handleViolations(message, violations);
      }
    });

    console.log('[AUTOMOD] ✅ Auto-moderation system initialized');
  }
}

export const createAutoModerator = (client) => new AutoModerator(client);
