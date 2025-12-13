import { SlashCommandBuilder, EmbedBuilder, ChannelType } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('replace-message')
    .setDescription('Send a beautiful replacement notification message')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Channel to send the message to')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('Custom title for the message (optional)')
        .setRequired(false)
    ),

  onlyWhitelisted: false,
  requiredRole: 'staff',

  async execute(interaction, api) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const channel = interaction.options.getChannel('channel');
      const customTitle = interaction.options.getString('title') || 'Product Replacement';

      if (!channel) {
        return await interaction.editReply({
          content: '❌ Channel not found',
          ephemeral: true
        });
      }

      if (!channel.permissionsFor(interaction.guild.members.me).has('SendMessages')) {
        return await interaction.editReply({
          content: `❌ I don't have permission to send messages in ${channel}`,
          ephemeral: true
        });
      }

      // Create beautiful replacement message embed
      const replacementEmbed = new EmbedBuilder()
        .setColor(0x00aaff)
        .setTitle(`⏳ ${customTitle}`)
        .setDescription('Your product will be replaced soon')
        .addFields(
          {
            name: '⏱️ Status',
            value: '🔄 **Processing...**',
            inline: true
          },
          {
            name: '👥 Action',
            value: '**Please wait for a staff member**',
            inline: true
          },
          {
            name: '📌 Notice',
            value: 'Your replacement is being processed by our staff team. Thank you for your patience.',
            inline: false
          }
        )
        .setFooter({
          text: 'SellAuth Bot Replacement System',
          iconURL: 'https://cdn.discordapp.com/app-icons/1009849347124862193/2a07cee6e1c97f4ac1cbc8c8ef0b2d1c.png'
        })
        .setTimestamp();

      // Send the message to the specified channel
      const sentMessage = await channel.send({
        embeds: [replacementEmbed]
      });

      // Confirm to the staff member who issued the command
      const confirmEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Message Sent')
        .addFields(
          {
            name: '📍 Channel',
            value: `${channel}`,
            inline: true
          },
          {
            name: '🎯 Status',
            value: 'Successfully posted',
            inline: true
          },
          {
            name: '📊 Message Details',
            value: `ID: \`${sentMessage.id}\`\nTitle: **${customTitle}**\nTimestamp: ${new Date().toUTCString()}`,
            inline: false
          }
        )
        .setFooter({ text: 'Message sent by: ' + interaction.user.tag })
        .setTimestamp();

      await interaction.editReply({
        embeds: [confirmEmbed],
        ephemeral: true
      });

      console.log(
        `[REPLACE-MESSAGE] ✅ Replacement message sent to ${channel.name} by ${interaction.user.tag}`
      );
    } catch (error) {
      console.error('[REPLACE-MESSAGE] Error:', error.message);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`,
        ephemeral: true
      });
    }
  }
};
