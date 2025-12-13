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

// Inicializar
loadTickets();

export class TicketManager {
  /**
   * Crear un nuevo ticket
   */
  static async createTicket(guild, user, category) {
    try {
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
          },
          {
            name: '🕐 Creation Time',
            value: new Date().toLocaleString('es-ES', { 
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
            value: 'Describe your issue or request. Our team will contact you soon.',
            inline: false
          }
        )
        .setFooter({ text: 'Shop System • El servidor de itz_Secret Alt' })
        .setTimestamp();

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_close_${ticketId}`)
          .setLabel('Cerrar')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`ticket_claim_${ticketId}`)
          .setLabel('Reclamar')
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
      if (!ticket) throw new Error('Ticket no encontrado');

      if (ticket.claimedBy) {
        return { success: false, message: 'Este ticket ya ha sido reclamado' };
      }

      ticket.claimedBy = staffMember.id;
      ticket.claimedAt = new Date().toISOString();
      saveTickets();

      const channel = await guild.channels.fetch(ticket.channelId);
      if (channel) {
        const claimEmbed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✔ You have claimed this ticket')
          .setDescription(`${staffMember} reclamó este ticket`)
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
      if (!ticket) throw new Error('Ticket no encontrado');

      if (ticket.closed) {
        return { success: false, message: 'Este ticket ya está cerrado' };
      }

      // Guardar quién está cerrando el ticket
      ticket.closedBy = staffMember.id;
      saveTickets();

      // Guardar quién está cerrando el ticket
      ticket.closedBy = staffMember.id;
      saveTickets();

      const channel = await guild.channels.fetch(ticket.channelId);
      if (!channel) throw new Error('Canal no encontrado');

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
      if (!ticket) throw new Error('Ticket no encontrado');

      const channel = await guild.channels.fetch(ticket.channelId);
      if (!channel) throw new Error('Canal no encontrado');

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

      // Enviar mensaje informando que el ticket está cerrado y necesita reviews
      const closeNoticeEmbed = new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle('🔒 Ticket Cerrado - Reviews Obligatorias')
        .setDescription(`Este ticket ha sido cerrado por el staff.\n\n**⚠️ IMPORTANTE:** Debes completar las reviews obligatorias para finalizar el proceso.`)
        .addFields(
          {
            name: '📝 Instrucciones',
            value: '1. Completa la **Service Rating** (obligatoria)\n2. Completa la **Staff Rating** (obligatoria)\n3. El ticket se cerrará automáticamente después de completar ambas reviews',
            inline: false
          },
          {
            name: '⏰ Tiempo límite',
            value: 'Si no completas las reviews en **24 horas**, el ticket se cerrará automáticamente.',
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
      if (!ticket) throw new Error('Ticket no encontrado');

      // Verificar que solo el usuario que creó el ticket puede hacer la review
      if (ticket.userId !== userId) {
        throw new Error('Solo el usuario que creó el ticket puede hacer las reviews');
      }

      // Verificar que el ticket esté pendiente de cierre
      if (!ticket.pendingClose) {
        throw new Error('Este ticket no está pendiente de reviews');
      }

      ticket.serviceRating = rating;
      saveTickets();

      const channel = await guild.channels.fetch(ticket.channelId);
      if (!channel) throw new Error('Canal no encontrado');

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
      if (!ticket) throw new Error('Ticket no encontrado');

      // Verificar que solo el usuario que creó el ticket puede hacer la review
      if (ticket.userId !== userId) {
        throw new Error('Solo el usuario que creó el ticket puede hacer las reviews');
      }

      // Verificar que el ticket esté pendiente de cierre
      if (!ticket.pendingClose) {
        throw new Error('Este ticket no está pendiente de reviews');
      }

      // Verificar que ya haya completado la service rating
      if (!ticket.serviceRating) {
        throw new Error('Debes completar primero la Service Rating');
      }

      ticket.staffRating = rating;
      saveTickets();

      const channel = await guild.channels.fetch(ticket.channelId);
      if (!channel) throw new Error('Canal no encontrado');

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

        // Cerrar ticket después de 3-5 segundos
        setTimeout(async () => {
          await this.closeTicket(guild, ticketId, closedByUserId);
        }, 3000 + Math.random() * 2000);
      } else {
        // Aún falta la service rating, mostrar mensaje
        const channel = await guild.channels.fetch(ticket.channelId);
        if (channel) {
          await channel.send({
            content: `✅ **Staff Rating completada!**\n\nAhora completa la **Service Rating** para finalizar el proceso.`
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
      
      if (!ratingChannelId) {
        console.warn('[TICKET] Rating channel not configured for this server');
        return;
      }

      const ratingChannel = await guild.channels.fetch(ratingChannelId);
      if (!ratingChannel) {
        console.warn('[TICKET] Rating channel not found');
        return;
      }

      const user = await guild.members.fetch(ticket.userId);
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
            value: `${user}`,
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
      if (!ticket) throw new Error('Ticket no encontrado');

      ticket.closed = true;
      ticket.closedAt = new Date().toISOString();
      ticket.closedBy = closedByUserId;
      saveTickets();

      const channel = await guild.channels.fetch(ticket.channelId);
      if (!channel) throw new Error('Canal no encontrado');

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

      let transcript = `# Transcript - ${ticket.id}\n\n`;
      transcript += `**Category:** ${ticket.category}\n`;
      transcript += `**User:** <@${ticket.userId}>\n`;
      transcript += `**Created:** ${new Date(ticket.createdAt).toLocaleString('es-ES')}\n`;
      transcript += `**Closed:** ${ticket.closedAt ? new Date(ticket.closedAt).toLocaleString('es-ES') : 'N/A'}\n`;
      if (ticket.closeReason) {
        transcript += `**Close Reason:** ${ticket.closeReason}\n`;
      }
      transcript += `**Service Rating:** ${ticket.serviceRating || 'N/A'}/5\n`;
      transcript += `**Staff Rating:** ${ticket.staffRating || 'N/A'}/5\n`;
      transcript += `\n--- Messages ---\n\n`;

      for (const msg of sortedMessages.values()) {
        const date = new Date(msg.createdTimestamp).toLocaleString('es-ES');
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
    return ticketsData.tickets[ticketId];
  }

  /**
   * Obtener ticket por canal
   */
  static getTicketByChannel(channelId) {
    return Object.values(ticketsData.tickets).find(t => t.channelId === channelId);
  }
}

