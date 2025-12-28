import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { GuildConfig } from '../utils/GuildConfig.js';

export default {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Send welcome embed to a channel (Admin only)')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Channel to send welcome embed (optional, uses configured channel if not specified)')
        .setRequired(false)
    ),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guild = interaction.guild;
      const guildConfig = GuildConfig.getConfig(guild.id);
      
      // Permitir especificar el canal directamente o usar uno por defecto
      const targetChannel = interaction.options.getChannel('channel') || 
                            interaction.channel;

      // Check permissions
      if (!targetChannel.permissionsFor(interaction.guild.members.me).has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        await interaction.editReply({
          content: `❌ I don't have permission to send messages in ${targetChannel}.`
        });
        return;
      }

      // Crear embed de bienvenida (formato como foto 3)
      const welcomeEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`¡Te damos la bienvenida a ${guild.name}!`)
        .setDescription(`Aquí empieza el canal de ${targetChannel.name}.\n\n**EN:** Official server website link and info\n**ES:** Enlace e información oficial del sitio web`)
        .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
        .setFooter({ text: `${guild.name} | Welcome System` })
        .setTimestamp();

      // Crear botón de website si está configurado
      const websiteUrl = guildConfig?.websiteLink || 'https://sellauth.com';
      const websiteButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Go to website')
          .setStyle(ButtonStyle.Link)
          .setURL(websiteUrl)
      );

      await targetChannel.send({
        embeds: [welcomeEmbed],
        components: [websiteButton]
      });

      await interaction.editReply({
        content: `✅ Welcome embed sent to ${targetChannel}`
      });

      console.log(`[WELCOME] Welcome embed sent to ${targetChannel.name} by ${interaction.user.tag}`);
    } catch (error) {
      console.error('[WELCOME] Error:', error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`
      }).catch(() => {});
    }
  }
};

