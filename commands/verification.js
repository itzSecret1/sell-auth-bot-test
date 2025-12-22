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

      const targetChannel = interaction.options.getChannel('channel') || 
                            (verificationChannelId ? await interaction.guild.channels.fetch(verificationChannelId).catch(() => null) : null);

      if (!targetChannel) {
        await interaction.editReply({
          content: '❌ Verification channel not configured. Please configure it in `/setup start` first.'
        });
        return;
      }

      if (!memberRoleId) {
        await interaction.editReply({
          content: '❌ Member role not configured. Please configure it in `/setup start` first.'
        });
        return;
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

      // Create verify button with OAuth2 URL (mejorado - sin redirect_uri para evitar errores)
      const clientId = interaction.client.user.id;
      // Para bot authorization, no necesitamos redirect_uri si solo usamos scope 'bot'
      // Permisos mejorados: Manage Roles (268435456) + Manage Channels (16) + Send Messages (2048) + Embed Links (16384) = 268453904
      const permissions = '268453904'; // Permisos combinados mejorados
      // Usar solo scope 'bot' para evitar problemas con redirect_uri
      const verifyUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot`;

      const verifyButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('✅ Verify & Authorize')
          .setStyle(ButtonStyle.Link)
          .setURL(verifyUrl)
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

