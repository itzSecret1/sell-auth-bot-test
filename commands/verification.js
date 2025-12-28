import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { GuildConfig } from '../utils/GuildConfig.js';
import { config } from '../utils/config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('verification')
    .setDescription('Send verification embed to a channel')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Channel to send verification embed (optional, uses configured channel if not specified)')
        .setRequired(false)
    ),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildConfig = GuildConfig.getConfig(interaction.guild.id);
      const verificationChannelId = guildConfig?.verificationChannelId;
      const memberRoleId = guildConfig?.memberRoleId;

      // Permitir especificar el canal directamente o usar el configurado
      const targetChannel = interaction.options.getChannel('channel') || 
                            (verificationChannelId ? await interaction.guild.channels.fetch(verificationChannelId).catch(() => null) : null);

      if (!targetChannel) {
        await interaction.editReply({
          content: '❌ Verification channel not specified. Please either:\n' +
                   '• Specify a channel with `/verification channel:#channel`\n' +
                   '• Configure it with `/setup quick` or `/setup start`\n' +
                   '• Configure it with `/setup edit field:verification_channel channel:#channel`'
        });
        return;
      }

      // El memberRoleId es opcional - si no está configurado, el bot funcionará sin asignar rol automáticamente
      // (el usuario aún puede autorizar el bot, pero no recibirá el rol automáticamente)
      if (!memberRoleId) {
        console.log(`[VERIFICATION] ⚠️ Member role not configured. Verification will work but no role will be assigned automatically.`);
      }

      // Check permissions
      if (!targetChannel.permissionsFor(interaction.guild.members.me).has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        await interaction.editReply({
          content: `❌ I don't have permission to send messages in ${targetChannel}.`
        });
        return;
      }

      // Create verification embed (mejorado)
      const verificationEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🔐 ${interaction.guild.name} - Server Verification`)
        .setDescription('Click the button below to verify and gain access to the server.')
        .setThumbnail(interaction.guild.iconURL({ dynamic: true, size: 256 }))
        .addFields({
          name: '📋 Instructions',
          value: '1. Click the **Verify & Authorize** button below\n2. Complete the Discord authorization process\n3. You will automatically receive the member role\n4. Enjoy full access to the server!',
          inline: false
        })
        .addFields({
          name: '🔒 Security',
          value: 'This verification system ensures only authorized users can access the server. Your authorization cannot be revoked without admin permission.',
          inline: false
        })
        .setFooter({ text: `${interaction.guild.name} | Verification System` })
        .setTimestamp();

      // Create OAuth2 authorization button (Restorecord-style)
      const { OAuth2Manager } = await import('../utils/OAuth2Manager.js');
      const clientId = config.BOT_CLIENT_ID || process.env.BOT_CLIENT_ID || interaction.client.user.id;
      
      // Generate OAuth2 URL for user authorization
      const oauthUrl = OAuth2Manager.generateAuthUrl(
        'temp', // Will be set when user clicks
        interaction.guild.id,
        config.OAUTH_REDIRECT_URI
      );

      const verifyButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('verify_button_oauth')
          .setLabel('✅ Verify & Authorize')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🔐')
      );

      await targetChannel.send({
        embeds: [verificationEmbed],
        components: [verifyButton]
      });

      await interaction.editReply({
        content: `✅ Verification embed sent to ${targetChannel}`
      });

      console.log(`[VERIFICATION] Verification embed sent to ${targetChannel.name} by ${interaction.user.tag}`);
    } catch (error) {
      console.error('[VERIFICATION] Error:', error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`
      }).catch(() => {});
    }
  }
};

