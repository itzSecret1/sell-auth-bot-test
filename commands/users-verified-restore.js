import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { VerifiedUsers } from '../utils/VerifiedUsers.js';
import { GuildConfig } from '../utils/GuildConfig.js';

export default {
  data: new SlashCommandBuilder()
    .setName('users-verified-restore')
    .setDescription('Restore/add all verified users to the current server')
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

      const addRole = interaction.options.getBoolean('add_role') !== false; // Default true
      
      const stats = VerifiedUsers.getStats();
      const allUsers = stats.users;
      
      if (allUsers.length === 0) {
        await interaction.editReply({
          content: '❌ **No verified users found**\n\nThere are no verified users to restore.'
        });
        return;
      }

      // Obtener configuración del servidor
      const guildConfig = GuildConfig.getConfig(interaction.guild.id);
      const memberRoleId = guildConfig?.memberRoleId;
      const memberRole = memberRoleId ? await interaction.guild.roles.fetch(memberRoleId).catch(() => null) : null;

      if (addRole && !memberRole) {
        await interaction.editReply({
          content: '⚠️ **Member Role Not Configured**\n\nMember role is not configured in this server. Users will be added but no role will be assigned.\n\nTo configure it, use `/setup start` and set the Member Role.'
        });
      }

      // Procesar usuarios
      let successCount = 0;
      let failedCount = 0;
      let alreadyInServer = 0;
      let roleAddedCount = 0;
      const failedUsers = [];

      const statusEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('🔄 Restoring Verified Users')
        .setDescription(`Processing ${allUsers.length} verified users...\n\nPlease wait, this may take a while.`)
        .setFooter({ text: 'Verification System' })
        .setTimestamp();

      await interaction.editReply({ embeds: [statusEmbed] });

      // Procesar usuarios en lotes para evitar rate limits
      const batchSize = 5;
      for (let i = 0; i < allUsers.length; i += batchSize) {
        const batch = allUsers.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (userData) => {
          try {
            // Intentar obtener el usuario
            let user;
            try {
              user = await interaction.client.users.fetch(userData.userId);
            } catch (fetchError) {
              failedCount++;
              failedUsers.push({ user: userData.tag, reason: 'User not found' });
              return;
            }

            // Verificar si el usuario ya está en el servidor
            let member = await interaction.guild.members.fetch(userData.userId).catch(() => null);
            
            if (member) {
              alreadyInServer++;
              
              // Añadir rol si está configurado y no lo tiene
              if (addRole && memberRole && !member.roles.cache.has(memberRoleId)) {
                try {
                  await member.roles.add(memberRole, 'Verified user restore');
                  roleAddedCount++;
                } catch (roleError) {
                  console.error(`[VERIFIED-RESTORE] Error adding role to ${userData.tag}:`, roleError);
                }
              }
              
              successCount++;
            } else {
              // Intentar añadir el usuario al servidor usando OAuth2
              // Nota: Esto requiere que el bot tenga permisos de "Create Instant Invite" y que el usuario acepte
              try {
                // Crear un invite temporal para el usuario
                const invite = await interaction.guild.invites.create(
                  interaction.guild.channels.cache.first() || interaction.channel,
                  {
                    maxUses: 1,
                    unique: true,
                    temporary: false
                  }
                );

                // Intentar enviar DM al usuario con el invite
                try {
                  const dmChannel = await user.createDM();
                  await dmChannel.send({
                    content: `🔗 **Server Invitation**\n\n` +
                      `You have been invited to join **${interaction.guild.name}**.\n\n` +
                      `**Invite Link:** ${invite.url}\n\n` +
                      `Click the link above to join the server.`
                  });
                  
                  successCount++;
                  console.log(`[VERIFIED-RESTORE] ✅ Sent invite to ${userData.tag}`);
                } catch (dmError) {
                  // Si no se puede enviar DM, al menos crear el invite
                  failedCount++;
                  failedUsers.push({ 
                    user: userData.tag, 
                    reason: 'Could not send DM (user may have DMs disabled)',
                    invite: invite.url
                  });
                }
              } catch (inviteError) {
                failedCount++;
                failedUsers.push({ 
                  user: userData.tag, 
                  reason: `Could not create invite: ${inviteError.message}` 
                });
              }
            }
          } catch (error) {
            failedCount++;
            failedUsers.push({ 
              user: userData.tag, 
              reason: error.message 
            });
            console.error(`[VERIFIED-RESTORE] Error processing ${userData.tag}:`, error);
          }
        }));

        // Delay entre lotes para evitar rate limits
        if (i + batchSize < allUsers.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Crear embed de resultados
      const resultEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Verified Users Restore Complete')
        .setDescription(`Restoration process completed for **${allUsers.length}** verified users.`)
        .addFields(
          {
            name: '✅ Successfully Processed',
            value: `**${successCount}** users`,
            inline: true
          },
          {
            name: '👥 Already in Server',
            value: `**${alreadyInServer}** users`,
            inline: true
          },
          {
            name: '🎭 Role Added',
            value: `**${roleAddedCount}** users`,
            inline: true
          },
          {
            name: '❌ Failed',
            value: `**${failedCount}** users`,
            inline: true
          }
        )
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();

      if (failedUsers.length > 0 && failedUsers.length <= 10) {
        const failedList = failedUsers.map(f => 
          `• ${f.user}: ${f.reason}${f.invite ? ` (Invite: ${f.invite})` : ''}`
        ).join('\n');
        
        resultEmbed.addFields({
          name: '⚠️ Failed Users',
          value: failedList,
          inline: false
        });
      } else if (failedUsers.length > 10) {
        resultEmbed.addFields({
          name: '⚠️ Failed Users',
          value: `${failedUsers.length} users failed. Check console for details.`,
          inline: false
        });
      }

      await interaction.editReply({ embeds: [resultEmbed] });

      console.log(`[VERIFIED-RESTORE] ✅ Restored ${successCount}/${allUsers.length} users by ${interaction.user.tag}`);
      if (failedUsers.length > 0) {
        console.log(`[VERIFIED-RESTORE] ❌ Failed users:`, failedUsers);
      }
    } catch (error) {
      console.error('[VERIFIED-RESTORE] Error:', error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`
      }).catch(() => {});
    }
  }
};

