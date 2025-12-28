import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { GuildConfig } from '../utils/GuildConfig.js';
import { VerifiedUsers } from '../utils/VerifiedUsers.js';
import { OAuth2Manager } from '../utils/OAuth2Manager.js';
import { config } from '../utils/config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pullback')
    .setDescription('Restore verified users to the server (Admin only)')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('User to restore (optional - restores all if not specified)')
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName('add_role')
        .setDescription('Add member role to restored users (default: true)')
        .setRequired(false)
    ),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const targetUser = interaction.options.getUser('user');
      const addRole = interaction.options.getBoolean('add_role') !== false; // Default true
      
      const guild = interaction.guild;
      const guildConfig = GuildConfig.getConfig(guild.id);
      const memberRoleId = guildConfig?.memberRoleId;

      if (!memberRoleId) {
        await interaction.editReply({
          content: '❌ Member role not configured. Please configure it with `/setup start`'
        });
        return;
      }

      const memberRole = await guild.roles.fetch(memberRoleId).catch(() => null);
      if (!memberRole) {
        await interaction.editReply({
          content: '❌ Member role not found. Please reconfigure it.'
        });
        return;
      }

      // Obtener todos los usuarios verificados
      const allVerifiedUsers = VerifiedUsers.getAllVerifiedUsers();
      
      // Filtrar por servidor si es necesario
      let usersToRestore = Object.values(allVerifiedUsers).filter(user => {
        if (targetUser) {
          return user.userId === targetUser.id;
        }
        // Si no se especifica usuario, restaurar todos los del servidor
        return user.guildId === guild.id || user.verifiedGuilds?.includes(guild.id);
      });

      if (usersToRestore.length === 0) {
        await interaction.editReply({
          content: targetUser 
            ? `❌ User ${targetUser.tag} is not in the verified users list.`
            : '❌ No verified users found for this server.'
        });
        return;
      }

      let successCount = 0;
      let roleAddedCount = 0;
      let alreadyInServer = 0;
      let errors = [];

      // Crear invite para usuarios que no están en el servidor
      let invite = null;
      try {
        invite = await guild.invites.create(guild.systemChannel || guild.channels.cache.first(), {
          maxUses: usersToRestore.length,
          maxAge: 86400, // 24 horas
          unique: true
        });
      } catch (inviteError) {
        console.error('[PULLBACK] Error creating invite:', inviteError);
      }

      for (const userData of usersToRestore) {
        try {
          // Intentar obtener el miembro
          let member = await guild.members.fetch(userData.userId).catch(() => null);
          
          if (member) {
            alreadyInServer++;
            
            // Añadir rol si está configurado y no lo tiene
            if (addRole && !member.roles.cache.has(memberRoleId)) {
              try {
                await member.roles.add(memberRole, 'Pullback restore - verified user');
                roleAddedCount++;
              } catch (roleError) {
                console.error(`[PULLBACK] Error adding role to ${userData.tag}:`, roleError);
                errors.push(`${userData.tag}: Could not add role`);
              }
            }
            
            successCount++;
          } else {
            // User not in server - try OAuth2 direct add (Restorecord-style)
            try {
              const user = await interaction.client.users.fetch(userData.userId).catch(() => null);
              if (!user) {
                errors.push(`${userData.tag}: User not found`);
                continue;
              }

              // Check if user has OAuth2 token stored
              const tokenData = OAuth2Manager.getToken(userData.userId);
              
              if (tokenData && !OAuth2Manager.isTokenExpired(tokenData)) {
                // Try to add user directly using OAuth2 (like Restorecord)
                try {
                  const botToken = config.BOT_TOKEN;
                  await OAuth2Manager.addUserToGuild(userData.userId, guild.id, botToken);
                  
                  // User successfully added!
                  successCount++;
                  
                  // Add role if configured
                  if (addRole) {
                    try {
                      const addedMember = await guild.members.fetch(userData.userId);
                      if (addedMember && !addedMember.roles.cache.has(memberRoleId)) {
                        await addedMember.roles.add(memberRole, 'Pullback restore - verified user');
                        roleAddedCount++;
                      }
                    } catch (roleError) {
                      console.error(`[PULLBACK] Error adding role to ${userData.tag}:`, roleError);
                    }
                  }
                  
                  console.log(`[PULLBACK] ✅ Directly added ${userData.tag} to server via OAuth2`);
                  
                  // Send welcome DM
                  try {
                    const welcomeEmbed = new EmbedBuilder()
                      .setColor(0x00ff00)
                      .setTitle(`✅ Welcome back to ${guild.name}!`)
                      .setDescription(`You have been automatically restored to **${guild.name}**.\n\nYour verified member status has been restored.`)
                      .setThumbnail(guild.iconURL({ dynamic: true }))
                      .setFooter({ text: 'Automatic restoration via OAuth2' })
                      .setTimestamp();
                    
                    await user.send({ embeds: [welcomeEmbed] });
                  } catch (dmError) {
                    // DM failed, but user was added successfully
                  }
                  
                } catch (oauthError) {
                  // OAuth2 add failed, fallback to invite
                  console.log(`[PULLBACK] OAuth2 add failed for ${userData.tag}, using invite: ${oauthError.message}`);
                  
                  // Create individual invite as fallback
                  const userInvite = await guild.invites.create(
                    guild.systemChannel || guild.channels.cache.first(),
                    {
                      maxUses: 1,
                      maxAge: 86400, // 24 hours
                      unique: true,
                      reason: `Pullback invite for verified user ${userData.tag}`
                    }
                  ).catch(() => null);

                  if (userInvite) {
                    const dmEmbed = new EmbedBuilder()
                      .setColor(0x5865F2)
                      .setTitle(`🔐 Rejoin ${guild.name}`)
                      .setDescription(`You have been invited to rejoin **${guild.name}**.\n\nClick the button below to join the server.`)
                      .setThumbnail(guild.iconURL({ dynamic: true }))
                      .addFields({
                        name: '🔗 Invite Link',
                        value: `[Click here to rejoin](${userInvite.url})`,
                        inline: false
                      })
                      .setFooter({ text: 'You are a verified member - automatic rejoin link' })
                      .setTimestamp();

                    const joinButton = new ActionRowBuilder().addComponents(
                      new ButtonBuilder()
                        .setLabel('Join Server')
                        .setStyle(ButtonStyle.Link)
                        .setURL(userInvite.url)
                    );

                    await user.send({ embeds: [dmEmbed], components: [joinButton] }).catch(() => {
                      errors.push(`${userData.tag}: Could not send DM`);
                    });
                    
                    successCount++;
                  } else {
                    errors.push(`${userData.tag}: Could not create invite`);
                  }
                }
              } else {
                // No OAuth2 token - send authorization request
                const authUrl = OAuth2Manager.generateAuthUrl(
                  userData.userId,
                  guild.id,
                  `${process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth/callback'}`
                );
                
                const authEmbed = new EmbedBuilder()
                  .setColor(0xff9900)
                  .setTitle(`🔐 Authorization Required`)
                  .setDescription(`To restore you to **${guild.name}**, you need to authorize the bot.\n\nThis allows the bot to automatically add you back if you leave the server.`)
                  .addFields({
                    name: '🔗 Authorize Bot',
                    value: `[Click here to authorize](${authUrl})`,
                    inline: false
                  })
                  .setFooter({ text: 'This is a one-time authorization' })
                  .setTimestamp();

                await user.send({ embeds: [authEmbed] }).catch(() => {
                  errors.push(`${userData.tag}: Could not send authorization request`);
                });
                
                errors.push(`${userData.tag}: Needs OAuth2 authorization`);
              }
            } catch (error) {
              console.error(`[PULLBACK] Error processing ${userData.tag}:`, error);
              errors.push(`${userData.tag}: ${error.message}`);
            }
          }
        } catch (error) {
          console.error(`[PULLBACK] Error processing ${userData.tag}:`, error);
          errors.push(`${userData.tag}: ${error.message}`);
        }
      }

      // Crear embed de resultado
      const resultEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Pullback Completed')
        .addFields(
          {
            name: '📊 Summary',
            value: `**Total Users:** ${usersToRestore.length}\n**Already in Server:** ${alreadyInServer}\n**Role Added:** ${roleAddedCount}\n**Invites Sent:** ${usersToRestore.length - alreadyInServer}`,
            inline: false
          }
        )
        .setFooter({ text: `Executed by ${interaction.user.tag}` })
        .setTimestamp();

      if (errors.length > 0) {
        resultEmbed.addFields({
          name: '⚠️ Errors',
          value: errors.slice(0, 10).join('\n') + (errors.length > 10 ? `\n...and ${errors.length - 10} more` : ''),
          inline: false
        });
        resultEmbed.setColor(0xffaa00);
      }

      if (invite) {
        resultEmbed.addFields({
          name: '🔗 Invite Link',
          value: `[Click here](${invite.url})`,
          inline: false
        });
      }

      await interaction.editReply({
        embeds: [resultEmbed]
      });

      console.log(`[PULLBACK] ✅ Pullback completed: ${successCount} users processed, ${roleAddedCount} roles added`);

    } catch (error) {
      console.error('[PULLBACK] Error:', error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`
      }).catch(() => {});
    }
  }
};

