import { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ChannelType,
  PermissionFlagsBits,
  Collection
} from 'discord.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { config } from './config.js';
import { GuildConfig } from './GuildConfig.js';

const TICKETS_FILE = './tickets.json';

let ticketsData = { tickets: {}, nextId: 1 };

// Cargar datos de tickets
function loadTickets() {
  try {
    if (existsSync(TICKETS_FILE)) {
      const data = readFileSync(TICKETS_FILE, 'utf-8');
      ticketsData = JSON.parse(data);
    }
  } catch (error) {
    console.error('[TICKET] Error loading tickets:', error);
    ticketsData = { tickets: {}, nextId: 1 };
  }
}

// Guardar datos de tickets
function saveTickets() {
  try {
    writeFileSync(TICKETS_FILE, JSON.stringify(ticketsData, null, 2), 'utf-8');
  } catch (error) {
    console.error('[TICKET] Error saving tickets:', error);
  }
}

// Exportar función para uso externo
export function saveTicketsData() {
  saveTickets();
}

// Inicializar
loadTickets();

export class TicketManager {
  /**
   * Crear un nuevo ticket
   */
  static async createTicket(guild, user, category, invoiceId = null) {
    try {
      // Verificar que el usuario no tenga un ticket abierto
      const userOpenTickets = Object.values(ticketsData.tickets).filter(
        t => t.userId === user.id && !t.closed
      );
      
      if (userOpenTickets.length > 0) {
        throw new Error('You already have an open ticket. Please close it before creating a new one.');
      }
      
      const ticketId = `TKT-${String(ticketsData.nextId).padStart(4, '0')}`;
      const categoryName = category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ');
      
      // Buscar o crear categoría
      let ticketCategory = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && 
        c.name.toLowerCase() === categoryName.toLowerCase()
      );

      if (!ticketCategory) {
        ticketCategory = await guild.channels.create({
          name: categoryName,
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              id: guild.id,
              deny: [PermissionFlagsBits.ViewChannel]
            },
            {
              id: user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
            }
          ]
        });
      }

      // Obtener configuración del servidor
      const guildConfig = GuildConfig.getConfig(guild.id);
      const staffRoleId = guildConfig?.staffRoleId;
      const adminRoleId = guildConfig?.adminRoleId;

      // Crear permisos del canal
      const permissionOverwrites = [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
        }
      ];

      // Agregar roles si están configurados
      if (staffRoleId) {
        permissionOverwrites.push({
          id: staffRoleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
        });
      }

      if (adminRoleId) {
        permissionOverwrites.push({
          id: adminRoleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels]
        });
      }

      // Crear canal del ticket con formato específico
      let channelName;
      if (category.toLowerCase() === 'replaces') {
        channelName = `replaces-tkt-${String(ticketsData.nextId).padStart(4, '0')}`;
      } else {
        channelName = `${category.toLowerCase()}-${user.username.toLowerCase()}`;
      }

      // Crear canal del ticket
      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: ticketCategory.id,
        permissionOverwrites: permissionOverwrites
      });

      // Crear embed del ticket
      const ticketEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✔ New Ticket Created')
        .setDescription(`Welcome ${user}!`)
        .addFields(
          {
            name: '🎫 Ticket ID',
            value: `\`${ticketId}\``,
            inline: true
          },
          {
            name: '💼 Category',
            value: categoryName,
            inline: true
          },
          {
            name: '👤 User',
            value: `${user}`,
            inline: true
          }
        );

      // Si es replaces y tiene invoice ID, agregarlo
      if (category.toLowerCase() === 'replaces' && invoiceId) {
        ticketEmbed.addFields({
          name: '📋 Invoice ID',
          value: `\`${invoiceId}\``,
          inline: false
        });
      }

      ticketEmbed.addFields(
        {
          name: '🕐 Creation Time',
          value: new Date().toLocaleString('en-US', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
          }),
          inline: false
        },
        {
          name: '📝 Instructions',
          value: category.toLowerCase() === 'replaces' && invoiceId 
            ? 'Please upload proof images in this channel. Our team will process your replacement shortly.'
            : 'Describe your issue or request. Our team will contact you soon.',
          inline: false
        }
      )
        .setFooter({ text: 'Shop System' })
        .setTimestamp();

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_close_${ticketId}`)
          .setLabel('Close')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`ticket_claim_${ticketId}`)
          .setLabel('Claim')
          .setStyle(ButtonStyle.Primary)
      );

      await ticketChannel.send({
        embeds: [ticketEmbed],
        components: [buttons]
      });

      // Guardar datos del ticket
      ticketsData.tickets[ticketId] = {
        id: ticketId,
        userId: user.id,
        channelId: ticketChannel.id,
        category: categoryName,
        createdAt: new Date().toISOString(),
        invoiceId: invoiceId || null,
        claimedBy: null,
        claimedAt: null,
        closed: false,
        closedAt: null,
        closedBy: null,
        closeReason: null,
        serviceRating: null,
        staffRating: null,
        ratingTimeout: null
      };
      ticketsData.nextId++;
      saveTickets();

      // Enviar log de apertura
      await this.sendLog(guild, 'OPEN', ticketId, user, categoryName);

      return { ticketId, channel: ticketChannel };
    } catch (error) {
      console.error('[TICKET] Error creating ticket:', error);
      throw error;
    }
  }

  /**
   * Reclamar un ticket
   */
  static async claimTicket(guild, ticketId, staffMember) {
    try {
      const ticket = ticketsData.tickets[ticketId];
      if (!ticket) throw new Error('Ticket not found');

      if (ticket.claimedBy) {
        return { success: false, message: 'This ticket has already been claimed' };
      }

      ticket.claimedBy = staffMember.id;
      ticket.claimedAt = new Date().toISOString();
      saveTickets();

      const channel = await guild.channels.fetch(ticket.channelId);
      if (channel) {
        const claimEmbed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✔ You have claimed this ticket')
          .setDescription(`${staffMember} claimed this ticket`)
          .setTimestamp();

        await channel.send({ embeds: [claimEmbed] });
      }

      return { success: true };
    } catch (error) {
      console.error('[TICKET] Error claiming ticket:', error);
      throw error;
    }
  }

  /**
   * Iniciar proceso de cierre de ticket
   */
  static async initiateClose(guild, ticketId, staffMember) {
    try {
      const ticket = ticketsData.tickets[ticketId];
      if (!ticket) throw new Error('Ticket not found');

      if (ticket.closed) {
        return { success: false, message: 'This ticket is already closed' };
      }

      // Guardar quién está cerrando el ticket
      ticket.closedBy = staffMember.id;
      saveTickets();

      // Guardar quién está cerrando el ticket
      ticket.closedBy = staffMember.id;
      saveTickets();

      const channel = await guild.channels.fetch(ticket.channelId);
      if (!channel) throw new Error('Channel not found');

      // Verificar si el staff necesita poner razón
      const guildConfig = GuildConfig.getConfig(guild.id);
      const staffRoleId = guildConfig?.staffRoleId;
      const member = await guild.members.fetch(staffMember.id);
      const needsReason = staffRoleId ? member.roles.cache.has(staffRoleId) : false;

      if (needsReason) {
        // Mostrar modal para razón
        return { 
          success: true, 
          needsReason: true, 
          ticket 
        };
      }

      // Si no necesita razón, mostrar ratings directamente
      return await this.showRatings(guild, ticketId, staffMember, null);
    } catch (error) {
      console.error('[TICKET] Error initiating close:', error);
      throw error;
    }
  }

  /**
   * Mostrar ratings antes de cerrar
   */
  static async showRatings(guild, ticketId, staffMember, closeReason) {
    try {
      const ticket = ticketsData.tickets[ticketId];
      if (!ticket) throw new Error('Ticket not found');

      const channel = await guild.channels.fetch(ticket.channelId);
      if (!channel) throw new Error('Channel not found');

      // Guardar razón si existe
      if (closeReason) {
        ticket.closeReason = closeReason;
      }

      // Marcar ticket como pendiente de cierre (pero no cerrado aún)
      ticket.pendingClose = true;
      ticket.closed = false; // Aún no está cerrado
      saveTickets();

      // BLOQUEAR el canal para que el usuario no pueda escribir
      // Solo el staff puede escribir, el usuario solo puede hacer reviews
      const user = await guild.members.fetch(ticket.userId);
      const guildConfig = GuildConfig.getConfig(guild.id);
      const staffRoleId = guildConfig?.staffRoleId;
      const adminRoleId = guildConfig?.adminRoleId;

      // Actualizar permisos del canal
      const permissionOverwrites = [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: user.id,
          allow: [PermissionFlagsBits.ViewChannel], // Puede ver pero NO escribir
          deny: [PermissionFlagsBits.SendMessages]
        }
      ];

      if (staffRoleId) {
        permissionOverwrites.push({
          id: staffRoleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
        });
      }

      if (adminRoleId) {
        permissionOverwrites.push({
          id: adminRoleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels]
        });
      }

      await channel.permissionOverwrites.set(permissionOverwrites);

      // Renombrar canal a formato "closed-XXXX" usando el ID del ticket
      try {
        const ticketNumber = ticket.id.replace('TKT-', '');
        const newChannelName = `closed-${ticketNumber}`;
        await channel.setName(newChannelName);
        console.log(`[TICKET] Channel renamed to "${newChannelName}" after closing`);
      } catch (renameError) {
        console.error('[TICKET] Error renaming channel:', renameError);
      }

      // Enviar mensaje informando que el ticket está cerrado y necesita reviews
      const closeNoticeEmbed = new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle('🔒 Ticket Closed - Waiting for Evaluation')
        .setDescription(`This ticket has been closed and is waiting for your evaluation.\n\n**⚠️ IMPORTANT:** You must complete the mandatory reviews to finalize the process.`)
        .addFields(
          {
            name: '📝 Instructions',
            value: '1. Complete the **Service Rating** (mandatory)\n2. Complete the **Staff Rating** (mandatory)\n3. The ticket will be removed automatically after completing both reviews',
            inline: false
          },
          {
            name: '⏰ Time Limit',
            value: 'If you do not complete the reviews within **24 hours**, the ticket will be automatically removed.',
            inline: false
          }
        )
        .setTimestamp();

      await channel.send({ embeds: [closeNoticeEmbed] });

      // Mostrar Service Rating
      const serviceRatingEmbed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle('★ Service Rating')
        .setDescription('Please rate the customer service you received.')
        .addFields({
          name: 'ID',
          value: ticketId,
          inline: false
        })
        .setTimestamp();

      const serviceRatingRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rating_service_1_${ticketId}`).setLabel('⭐').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rating_service_2_${ticketId}`).setLabel('⭐').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rating_service_3_${ticketId}`).setLabel('⭐').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rating_service_4_${ticketId}`).setLabel('⭐').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rating_service_5_${ticketId}`).setLabel('⭐').setStyle(ButtonStyle.Secondary)
      );

      const serviceMsg = await channel.send({
        embeds: [serviceRatingEmbed],
        components: [serviceRatingRow]
      });

      ticket.serviceRatingMsgId = serviceMsg.id;
      ticket.serviceRating = null;
      ticket.ratingStartedAt = new Date().toISOString();
      saveTickets();

      return { success: true, waitingForRating: true };
    } catch (error) {
      console.error('[TICKET] Error showing ratings:', error);
      throw error;
    }
  }

  /**
   * Procesar rating de servicio
   */
  static async processServiceRating(guild, ticketId, rating, userId) {
    try {
      const ticket = ticketsData.tickets[ticketId];
      if (!ticket) throw new Error('Ticket not found');

      // Verificar que solo el usuario que creó el ticket puede hacer la review
      if (ticket.userId !== userId) {
        throw new Error('Only the user who created the ticket can complete the reviews');
      }

      // Verificar que el ticket esté pendiente de cierre
      if (!ticket.pendingClose) {
        throw new Error('This ticket is not pending reviews');
      }

      ticket.serviceRating = rating;
      saveTickets();

      const channel = await guild.channels.fetch(ticket.channelId);
      if (!channel) throw new Error('Channel not found');

      // Actualizar embed de service rating
      const serviceMsg = await channel.messages.fetch(ticket.serviceRatingMsgId);
      if (serviceMsg) {
        const updatedEmbed = new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle('★ Service Rating')
          .setDescription('Please rate the customer service you received.')
          .addFields({
            name: 'ID',
            value: ticketId,
            inline: false
          })
          .setTimestamp();

        const updatedRow = new ActionRowBuilder();
        for (let i = 1; i <= 5; i++) {
          const style = i <= rating ? ButtonStyle.Success : ButtonStyle.Secondary;
          updatedRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`rating_service_${i}_${ticketId}`)
              .setLabel('⭐')
              .setStyle(style)
              .setDisabled(true)
          );
        }

        await serviceMsg.edit({
          embeds: [updatedEmbed],
          components: [updatedRow]
        });
      }

      // Ahora mostrar Staff Rating (obligatoria)
      const staffRatingEmbed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle('★ Staff Rating')
        .setDescription('Now rate the staff member who assisted you.')
        .addFields({
          name: 'ID',
          value: ticketId,
          inline: false
        })
        .setTimestamp();

      const staffRatingRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rating_staff_1_${ticketId}`).setLabel('⭐').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rating_staff_2_${ticketId}`).setLabel('⭐').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rating_staff_3_${ticketId}`).setLabel('⭐').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rating_staff_4_${ticketId}`).setLabel('⭐').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rating_staff_5_${ticketId}`).setLabel('⭐').setStyle(ButtonStyle.Secondary)
      );

      const staffMsg = await channel.send({
        embeds: [staffRatingEmbed],
        components: [staffRatingRow]
      });

      ticket.staffRatingMsgId = staffMsg.id;
      ticket.staffRating = null;
      saveTickets();

      return { success: true };
    } catch (error) {
      console.error('[TICKET] Error processing service rating:', error);
      throw error;
    }
  }

  /**
   * Procesar rating de staff y cerrar ticket
   */
  static async processStaffRating(guild, ticketId, rating, userId) {
    try {
      const ticket = ticketsData.tickets[ticketId];
      if (!ticket) throw new Error('Ticket not found');

      // Verificar que solo el usuario que creó el ticket puede hacer la review
      if (ticket.userId !== userId) {
        throw new Error('Only the user who created the ticket can complete the reviews');
      }

      // Verificar que el ticket esté pendiente de cierre
      if (!ticket.pendingClose) {
        throw new Error('This ticket is not pending reviews');
      }

      // Verificar que ya haya completado la service rating
      if (!ticket.serviceRating) {
        throw new Error('You must complete the Service Rating first');
      }

      ticket.staffRating = rating;
      saveTickets();

      const channel = await guild.channels.fetch(ticket.channelId);
      if (!channel) throw new Error('Channel not found');

      // Actualizar embed de staff rating
      const staffMsg = await channel.messages.fetch(ticket.staffRatingMsgId);
      if (staffMsg) {
        const updatedEmbed = new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle('★ Staff Rating')
          .setDescription('Now rate the staff member who assisted you.')
          .addFields({
            name: 'ID',
            value: ticketId,
            inline: false
          })
          .setTimestamp();

        const updatedRow = new ActionRowBuilder();
        for (let i = 1; i <= 5; i++) {
          const style = i <= rating ? ButtonStyle.Success : ButtonStyle.Secondary;
          updatedRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`rating_staff_${i}_${ticketId}`)
              .setLabel('⭐')
              .setStyle(style)
              .setDisabled(true)
          );
        }

        await staffMsg.edit({
          embeds: [updatedEmbed],
          components: [updatedRow]
        });
      }

      // Verificar que ambas reviews estén completas
      if (ticket.serviceRating && ticket.staffRating) {
        // Ambas reviews completas, cerrar el ticket
        // Enviar ratings al canal de ratings
        await this.sendRatings(guild, ticket);

        // Obtener el usuario que cerró el ticket
        const closedByUserId = ticket.closedBy || ticket.claimedBy || 'Sistema';

        // Enviar mensaje de que se cerrará en unos segundos
        const closingEmbed = new EmbedBuilder()
          .setColor(0xff9900)
          .setTitle('✅ Reviews Completed')
          .setDescription('Thank you for your feedback! This ticket will close in a few seconds...')
          .setTimestamp();
        
        await channel.send({ embeds: [closingEmbed] });

        // Cerrar ticket después de 3-5 segundos
        setTimeout(async () => {
          await this.closeTicket(guild, ticketId, closedByUserId);
        }, 3000 + Math.random() * 2000);
      } else {
        // Aún falta la service rating, mostrar mensaje
        const channel = await guild.channels.fetch(ticket.channelId);
        if (channel) {
          await channel.send({
            content: `✅ **Staff Rating completed!**\n\nNow complete the **Service Rating** to finalize the process.`
          });
        }
      }

      return { success: true };
    } catch (error) {
      console.error('[TICKET] Error processing staff rating:', error);
      throw error;
    }
  }

  /**
   * Enviar ratings al canal de ratings
   */
  static async sendRatings(guild, ticket) {
    try {
      const guildConfig = GuildConfig.getConfig(guild.id);
      const ratingChannelId = guildConfig?.ratingChannelId;
      
      // Enviar ratings generales al canal de ratings (si está configurado)
      if (ratingChannelId) {
        const ratingChannel = await guild.channels.fetch(ratingChannelId).catch(() => null);
        if (ratingChannel) {
          const user = await guild.members.fetch(ticket.userId).catch(() => null);
          const claimedBy = ticket.claimedBy ? await guild.members.fetch(ticket.claimedBy).catch(() => null) : null;

          const ratingEmbed = new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle('📊 Ticket Ratings')
            .addFields(
              {
                name: '🎫 Ticket ID',
                value: ticket.id,
                inline: true
              },
              {
                name: '👤 User',
                value: user ? `${user}` : `User ID: ${ticket.userId}`,
                inline: true
              },
              {
                name: '💼 Category',
                value: ticket.category,
                inline: true
              },
              {
                name: '⭐ Service Rating',
                value: `${ticket.serviceRating || 'N/A'}/5`,
                inline: true
              },
              {
                name: '⭐ Staff Rating',
                value: `${ticket.staffRating || 'N/A'}/5`,
                inline: true
              },
              {
                name: '👨‍💼 Claimed By',
                value: claimedBy ? `${claimedBy}` : 'N/A',
                inline: true
              }
            )
            .setTimestamp();

          await ratingChannel.send({ embeds: [ratingEmbed] });
        }
      }

      // Enviar staff rating a Staff Rating Support Channel (todas las evaluaciones)
      const staffRatingSupportChannelId = guildConfig?.staffRatingSupportChannelId;
      if (staffRatingSupportChannelId && ticket.staffRating) {
        const staffRatingSupportChannel = await guild.channels.fetch(staffRatingSupportChannelId).catch(() => null);
        if (staffRatingSupportChannel) {
          const user = await guild.members.fetch(ticket.userId).catch(() => null);
          const staffMember = ticket.claimedBy ? await guild.members.fetch(ticket.claimedBy).catch(() => null) : null;

          const staffRatingEmbed = new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle('⭐ Staff Rating')
            .addFields(
              {
                name: '👤 Evaluated by',
                value: user ? `${user} (${user.user.tag})` : `User ID: ${ticket.userId}`,
                inline: true
              },
              {
                name: '👨‍💼 Staff Member',
                value: staffMember ? `${staffMember} (${staffMember.user.tag})` : 'N/A',
                inline: true
              },
              {
                name: '💼 Category',
                value: ticket.category,
                inline: true
              },
              {
                name: '⭐ Rating',
                value: `${ticket.staffRating}/5 ${'⭐'.repeat(ticket.staffRating)}${'☆'.repeat(5 - ticket.staffRating)}`,
                inline: false
              },
              {
                name: '📅 Date',
                value: `<t:${Math.floor(new Date().getTime() / 1000)}:F>`,
                inline: true
              },
              {
                name: '🎫 Ticket ID',
                value: ticket.id,
                inline: true
              }
            )
            .setTimestamp();

          await staffRatingSupportChannel.send({ embeds: [staffRatingEmbed] });
        }
      }

      // Enviar staff rating a Staff Feedbacks Channel (solo 4+ estrellas)
      const staffFeedbacksChannelId = guildConfig?.staffFeedbacksChannelId;
      if (staffFeedbacksChannelId && ticket.staffRating && ticket.staffRating >= 4) {
        const staffFeedbacksChannel = await guild.channels.fetch(staffFeedbacksChannelId).catch(() => null);
        if (staffFeedbacksChannel) {
          const user = await guild.members.fetch(ticket.userId).catch(() => null);
          const staffMember = ticket.claimedBy ? await guild.members.fetch(ticket.claimedBy).catch(() => null) : null;

          const feedbackEmbed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('🌟 Positive Staff Feedback')
            .addFields(
              {
                name: '👤 Evaluated by',
                value: user ? `${user} (${user.user.tag})` : `User ID: ${ticket.userId}`,
                inline: true
              },
              {
                name: '👨‍💼 Staff Member',
                value: staffMember ? `${staffMember} (${staffMember.user.tag})` : 'N/A',
                inline: true
              },
              {
                name: '💼 Category',
                value: ticket.category,
                inline: true
              },
              {
                name: '⭐ Rating',
                value: `${ticket.staffRating}/5 ${'⭐'.repeat(ticket.staffRating)}${'☆'.repeat(5 - ticket.staffRating)}`,
                inline: false
              },
              {
                name: '📅 Date',
                value: `<t:${Math.floor(new Date().getTime() / 1000)}:F>`,
                inline: true
              },
              {
                name: '🎫 Ticket ID',
                value: ticket.id,
                inline: true
              }
            )
            .setTimestamp();

          await staffFeedbacksChannel.send({ embeds: [feedbackEmbed] });
        }
      }
    } catch (error) {
      console.error('[TICKET] Error sending ratings:', error);
    }
  }

  /**
   * Cerrar ticket
   */
  static async closeTicket(guild, ticketId, closedByUserId) {
    try {
      const ticket = ticketsData.tickets[ticketId];
      if (!ticket) throw new Error('Ticket not found');

      ticket.closed = true;
      ticket.closedAt = new Date().toISOString();
      ticket.closedBy = closedByUserId;
      saveTickets();

      const channel = await guild.channels.fetch(ticket.channelId);
      if (!channel) throw new Error('Channel not found');

      // Enviar transcript
      await this.sendTranscript(guild, ticket);

      // Enviar log de cierre
      const closedBy = await guild.members.fetch(closedByUserId).catch(() => null);
      await this.sendLog(guild, 'CLOSE', ticketId, closedBy, ticket.category, ticket.closeReason);

      // Eliminar canal después de unos segundos
      setTimeout(async () => {
        try {
          await channel.delete();
        } catch (error) {
          console.error('[TICKET] Error deleting channel:', error);
        }
      }, 5000);

      return { success: true };
    } catch (error) {
      console.error('[TICKET] Error closing ticket:', error);
      throw error;
    }
  }

  /**
   * Enviar transcript del ticket
   */
  static async sendTranscript(guild, ticket) {
    try {
      const guildConfig = GuildConfig.getConfig(guild.id);
      const transcriptChannelId = guildConfig?.transcriptChannelId;
      
      if (!transcriptChannelId) {
        console.warn('[TICKET] Transcript channel not configured for this server');
        return;
      }

      const transcriptChannel = await guild.channels.fetch(transcriptChannelId);
      if (!transcriptChannel) {
        console.warn('[TICKET] Transcript channel not found');
        return;
      }

      const channel = await guild.channels.fetch(ticket.channelId);
      if (!channel) return;

      const messages = await channel.messages.fetch({ limit: 100 });
      const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      const user = await guild.members.fetch(ticket.userId).catch(() => null);
      const claimedBy = ticket.claimedBy ? await guild.members.fetch(ticket.claimedBy).catch(() => null) : null;
      const closedBy = ticket.closedBy ? await guild.members.fetch(ticket.closedBy).catch(() => null) : null;

      // Obtener información del canal
      const channelName = channel.name;
      const channelId = channel.id;
      
      // Obtener participantes únicos del ticket
      const participants = new Set();
      participants.add(ticket.userId);
      if (ticket.claimedBy) participants.add(ticket.claimedBy);
      if (ticket.closedBy) participants.add(ticket.closedBy);
      
      // Agregar participantes de los mensajes
      for (const msg of sortedMessages.values()) {
        if (!msg.author.bot) {
          participants.add(msg.author.id);
        }
      }
      
      const participantsList = Array.from(participants).map(id => {
        const member = guild.members.cache.get(id);
        return member ? `<@${id}> (${member.user.tag})` : `User ID: ${id}`;
      }).join('\n');

      let transcript = `# Transcript - ${ticket.id}\n\n`;
      transcript += `**Ticket Owner:** ${user ? `<@${ticket.userId}> (${user.user.tag})` : `User ID: ${ticket.userId}`}\n`;
      transcript += `**Channel Name:** ${channelName}\n`;
      transcript += `**Channel ID:** ${channelId}\n`;
      transcript += `**Category:** ${ticket.category}\n`;
      transcript += `**Created:** ${new Date(ticket.createdAt).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'medium' })}\n`;
      transcript += `**Closed:** ${ticket.closedAt ? new Date(ticket.closedAt).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'medium' }) : 'N/A'}\n`;
      
      if (claimedBy) {
        transcript += `**Claimed by:** <@${ticket.claimedBy}> (${claimedBy.user.tag})\n`;
      }
      
      if (closedBy) {
        const closedByType = ticket.closedByType || 'staff';
        const typeLabel = closedByType === 'owner' ? 'Owner/Admin' : closedByType === 'user' ? 'Ticket Creator' : 'Staff';
        transcript += `**Closed by:** <@${ticket.closedBy}> (${closedBy.user.tag}) - ${typeLabel}\n`;
      }
      
      if (ticket.closeReason) {
        transcript += `**Close Reason:** ${ticket.closeReason}\n`;
      } else {
        transcript += `**Close Reason:** No reason provided\n`;
      }
      
      transcript += `**Service Rating:** ${ticket.serviceRating || 'N/A'}/5\n`;
      transcript += `**Staff Rating:** ${ticket.staffRating || 'N/A'}/5\n`;
      transcript += `\n**Participants in this ticket:**\n${participantsList}\n`;
      transcript += `\n--- Messages ---\n\n`;

      for (const msg of sortedMessages.values()) {
        const date = new Date(msg.createdTimestamp).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'medium' });
        transcript += `[${date}] ${msg.author.tag}: ${msg.content}\n`;
        if (msg.embeds.length > 0) {
          transcript += `  [Embed: ${msg.embeds[0].title || 'No title'}]\n`;
        }
      }

      // Enviar como archivo si es muy largo
      if (transcript.length > 2000) {
        const { writeFileSync, unlinkSync } = await import('fs');
        const filename = `transcript-${ticket.id}.txt`;
        writeFileSync(filename, transcript, 'utf-8');
        
        await transcriptChannel.send({
          content: `📄 Transcript de ${ticket.id}`,
          files: [filename]
        });

        unlinkSync(filename);
      } else {
        await transcriptChannel.send({
          content: `\`\`\`\n${transcript}\n\`\`\``
        });
      }
    } catch (error) {
      console.error('[TICKET] Error sending transcript:', error);
    }
  }

  /**
   * Enviar log de ticket
   */
  static async sendLog(guild, action, ticketId, user, category, reason = null) {
    try {
      const guildConfig = GuildConfig.getConfig(guild.id);
      const logChannelId = guildConfig?.logChannelId;
      
      if (!logChannelId) {
        console.warn('[TICKET] Log channel not configured for this server');
        return;
      }

      const logChannel = await guild.channels.fetch(logChannelId);
      if (!logChannel) {
        console.warn('[TICKET] Log channel not found');
        return;
      }

      const color = action === 'OPEN' ? 0x00ff00 : 0xff0000;
      const title = action === 'OPEN' ? '✅ Ticket Abierto' : '❌ Ticket Cerrado';

      const logEmbed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .addFields(
          {
            name: '🎫 Ticket ID',
            value: ticketId,
            inline: true
          },
          {
            name: '💼 Category',
            value: category,
            inline: true
          },
          {
            name: '👤 User',
            value: user ? `${user}` : 'N/A',
            inline: true
          }
        )
        .setTimestamp();

      if (reason) {
        logEmbed.addFields({
          name: '📝 Reason',
          value: reason,
          inline: false
        });
      }

      await logChannel.send({ embeds: [logEmbed] });
    } catch (error) {
      console.error('[TICKET] Error sending log:', error);
    }
  }

  /**
   * Verificar y cerrar tickets automáticamente después de 24 horas sin completar reviews
   */
  static async checkAutoClose(guild) {
    try {
      const now = new Date();
      for (const [ticketId, ticket] of Object.entries(ticketsData.tickets)) {
        // Solo verificar tickets pendientes de cierre
        if (!ticket.pendingClose) continue;
        if (ticket.closed) continue;
        
        // Si ya tiene ambas reviews completas, no necesita auto-cierre
        if (ticket.serviceRating && ticket.staffRating) continue;
        
        if (!ticket.ratingStartedAt) continue; // Aún no empezó el proceso de rating

        const ratingStartTime = new Date(ticket.ratingStartedAt);
        const hoursSinceRatingStart = (now - ratingStartTime) / (1000 * 60 * 60);

        if (hoursSinceRatingStart >= 24) {
          // Han pasado 24 horas sin completar las reviews, cerrar automáticamente
          console.log(`[TICKET] Auto-cerrando ticket ${ticketId} después de 24 horas sin completar reviews`);
          await this.closeTicket(guild, ticketId, 'Sistema');
        }
      }
    } catch (error) {
      console.error('[TICKET] Error checking auto-close:', error);
    }
  }

  /**
   * Iniciar verificación periódica de cierre automático
   */
  static startAutoCloseChecker(guild) {
    // Verificar cada hora
    setInterval(() => {
      this.checkAutoClose(guild);
    }, 60 * 60 * 1000); // 1 hora

    // Verificar inmediatamente
    this.checkAutoClose(guild);
  }

  /**
   * Obtener ticket por ID
   */
  static getTicket(ticketId) {
    // Recargar tickets antes de buscar para asegurar datos actualizados
    loadTickets();
    
    // Buscar por ID exacto
    if (ticketsData.tickets[ticketId]) {
      return ticketsData.tickets[ticketId];
    }
    
    // Si no se encuentra, buscar sin el prefijo TKT- si está presente
    const cleanId = ticketId.replace(/^TKT-?/i, '');
    const formattedId = `TKT-${cleanId.padStart(4, '0')}`;
    
    if (ticketsData.tickets[formattedId]) {
      return ticketsData.tickets[formattedId];
    }
    
    // Buscar en todos los tickets por ID parcial
    return Object.values(ticketsData.tickets).find(t => 
      t.id === ticketId || 
      t.id === formattedId ||
      t.id.replace(/^TKT-?/i, '') === cleanId
    );
  }

  /**
   * Obtener ticket por canal
   */
  static getTicketByChannel(channelId) {
    // Recargar tickets antes de buscar para asegurar datos actualizados
    loadTickets();
    
    // Buscar por channelId exacto
    const ticket = Object.values(ticketsData.tickets).find(t => t.channelId === channelId);
    
    if (ticket) {
      return ticket;
    }
    
    // Si no se encuentra, buscar también por channelId como string
    return Object.values(ticketsData.tickets).find(t => 
      String(t.channelId) === String(channelId)
    );
  }

  /**
   * Guardar tickets (método estático)
   */
  static saveTickets() {
    saveTickets();
  }
}

