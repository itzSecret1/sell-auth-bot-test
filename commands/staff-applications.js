import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { GuildConfig } from '../utils/GuildConfig.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const APPLICATIONS_FILE = './staffApplications.json';

function loadApplications() {
  try {
    if (existsSync(APPLICATIONS_FILE)) {
      return JSON.parse(readFileSync(APPLICATIONS_FILE, 'utf-8'));
    }
  } catch (error) {
    console.error('[STAFF-APPS] Error loading applications:', error);
  }
  return { applications: {}, isOpen: false, applicationChannelId: null };
}

function saveApplications(data) {
  try {
    writeFileSync(APPLICATIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('[STAFF-APPS] Error saving applications:', error);
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('staff-applications')
    .setDescription('Manage staff applications (Admin only)')
    .addSubcommand((sub) =>
      sub
        .setName('open')
        .setDescription('Open staff applications')
    )
    .addSubcommand((sub) =>
      sub
        .setName('closed')
        .setDescription('Close staff applications')
    ),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const subcommand = interaction.options.getSubcommand();
      const guild = interaction.guild;
      const guildConfig = GuildConfig.getConfig(guild.id);
      const appsData = loadApplications();

      // Buscar canal de anuncios (announces, ads, announcements)
      const announceChannels = guild.channels.cache.filter(ch => 
        ch.type === 0 && // Text channel
        (ch.name.toLowerCase().includes('announce') || 
         ch.name.toLowerCase().includes('ads') ||
         ch.name.toLowerCase().includes('anuncio'))
      );
      
      const announceChannel = announceChannels.first() || guild.systemChannel || guild.channels.cache.find(ch => ch.type === 0);

      if (!announceChannel) {
        await interaction.editReply({
          content: '❌ No announcement channel found. Please create a channel named "announces" or "ads".'
        });
        return;
      }

      // Search or create staff applications category
      let applicationCategory = null;
      const categoryName = 'Staff Applications';
      applicationCategory = guild.channels.cache.find(ch => 
        ch.type === 4 && // Category
        ch.name.toLowerCase() === categoryName.toLowerCase()
      );

      if (!applicationCategory) {
        // Create category automatically
        applicationCategory = await guild.channels.create({
          name: categoryName,
          type: 4 // Category
        });
        console.log(`[STAFF-APPS] ✅ Created category: ${categoryName}`);
      }

      // Search or create application channel
      let applicationChannel = null;
      if (appsData.applicationChannelId) {
        applicationChannel = await guild.channels.fetch(appsData.applicationChannelId).catch(() => null);
      }

      if (!applicationChannel) {
        // Search for existing channel with related name
        const existingChannel = guild.channels.cache.find(ch => 
          ch.type === 0 && 
          (ch.name.toLowerCase().includes('application') || 
           ch.name.toLowerCase().includes('applications'))
        );
        
        if (existingChannel) {
          applicationChannel = existingChannel;
          appsData.applicationChannelId = existingChannel.id;
        } else {
          // Create new channel in the category
          const memberRoleId = guildConfig?.memberRoleId;
          const memberRole = memberRoleId ? await guild.roles.fetch(memberRoleId).catch(() => null) : null;

          applicationChannel = await guild.channels.create({
            name: 'applications',
            type: 0,
            parent: applicationCategory.id,
            permissionOverwrites: [
              {
                id: guild.id,
                deny: [PermissionFlagsBits.ViewChannel]
              },
              ...(memberRole ? [{
                id: memberRoleId,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
              }] : [])
            ]
          });

          appsData.applicationChannelId = applicationChannel.id;
          saveApplications(appsData);
        }
      }

      if (subcommand === 'open') {
        appsData.isOpen = true;
        saveApplications(appsData);

        // Configurar permisos del canal
        const memberRoleId = guildConfig?.memberRoleId;
        if (memberRoleId) {
          const memberRole = await guild.roles.fetch(memberRoleId).catch(() => null);
          if (memberRole) {
            await applicationChannel.permissionOverwrites.edit(memberRoleId, {
              ViewChannel: true,
              ReadMessageHistory: true
            });
          }
        }

        // Send message in announcement channel
        const openEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🛡️ Staff Applications are now Open!')
          .setDescription(
            'We are looking for **new members** who want to be part of the staff team and **improve the customer service** we currently have.\n\n' +
            '> The approved member will receive a **monthly payment of $80.**\n\n' +
            'To apply, simply **follow the steps** that appear when you click the button below:'
          )
          .setFooter({ text: `${guild.name} • Staff Applications` })
          .setTimestamp();

        const applyButton = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('staff_application_apply')
            .setLabel('Apply to the team')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🛡️')
        );

        await announceChannel.send({
          content: '@everyone',
          embeds: [openEmbed],
          components: [applyButton]
        });

        // Send message in application channel
        const applicationEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🛡️ Staff Applications')
          .setDescription('Click the button below to apply for a staff position.')
          .setFooter({ text: `${guild.name} • Staff Applications` })
          .setTimestamp();

        await applicationChannel.send({
          embeds: [applicationEmbed],
          components: [applyButton]
        });

        await interaction.editReply({
          content: `✅ Staff applications opened! Message sent to ${announceChannel} and ${applicationChannel}`
        });

      } else if (subcommand === 'closed') {
        appsData.isOpen = false;
        saveApplications(appsData);

        // Remover permisos del canal
        const memberRoleId = guildConfig?.memberRoleId;
        if (memberRoleId) {
          const memberRole = await guild.roles.fetch(memberRoleId).catch(() => null);
          if (memberRole) {
            await applicationChannel.permissionOverwrites.edit(memberRoleId, {
              ViewChannel: false
            });
          }
        }

        // Enviar mensaje en canal de anuncios
        const closedEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('🔒 Staff Applications Closed')
          .setDescription(
            'Staff applications are now **closed**.\n\n' +
            'We are no longer accepting new applications at this time.\n\n' +
            'Thank you to everyone who applied!'
          )
          .setFooter({ text: `${guild.name} • Staff Applications` })
          .setTimestamp();

        await announceChannel.send({
          content: '@everyone',
          embeds: [closedEmbed]
        });

        await interaction.editReply({
          content: `✅ Staff applications closed! Message sent to ${announceChannel}`
        });
      }

    } catch (error) {
      console.error('[STAFF-APPS] Error:', error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`
      }).catch(() => {});
    }
  }
};

