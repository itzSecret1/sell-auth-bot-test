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
import { learnFromTicket } from './TicketLearning.js';

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

/**
 * Normalizar nombre de categoría eliminando emojis, stickers y caracteres especiales
 * @param {string} name - Nombre de la categoría
 * @returns {string} - Nombre normalizado (solo texto)
 */
function normalizeCategoryName(name) {
  if (!name) return '';
  
  // Eliminar emojis Unicode (incluyendo variaciones de selector)
  // Patrón para emojis: incluye emojis básicos, emojis con variaciones de tono, banderas, etc.
  let normalized = name
    // Eliminar emojis Unicode (rango básico)
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    // Eliminar emojis de símbolos y pictogramas
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
    // Eliminar emojis de símbolos varios
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
    // Eliminar emojis suplementarios
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
    // Eliminar emojis de símbolos y pictogramas extendidos
    .replace(/[\u{1FA00}-\u{1FAFF}]/gu, '')
    // Eliminar símbolos varios (incluye monedas, flechas, etc.)
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    // Eliminar símbolos varios suplementarios
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    // Eliminar símbolos y pictogramas varios
    .replace(/[\u{1F000}-\u{1F02F}]/gu, '')
    // Eliminar variaciones de selector (para emojis con tonos de piel)
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    // Eliminar marcas de combinación cero ancho (para emojis compuestos)
    .replace(/[\u{200D}]/gu, '')
    // Eliminar símbolos de moneda y caracteres especiales comunes
    .replace(/[$€£¥₹₽¢]/g, '')
    // Eliminar bullet points y caracteres especiales
    .replace(/[•·▪▫◦‣⁃‾]/g, '')
    // Eliminar otros símbolos comunes
    .replace(/[→←↑↓↔]/g, '')
    // Eliminar espacios múltiples
    .replace(/\s+/g, ' ')
    // Trim espacios al inicio y final
    .trim()
    // Convertir a minúsculas para comparación
    .toLowerCase();
  
  return normalized;
}

export class TicketManager {
  /**
   * Crear un nuevo ticket
   */
  static async createTicket(guild, user, category, invoiceId = null) {
    try {
      // CRÍTICO: Recargar tickets antes de verificar para evitar race conditions
      loadTickets();
      
      // Verificar que el usuario no tenga un ticket abierto
      // IMPORTANTE: También verificar que el canal del ticket exista
      let userOpenTickets = Object.values(ticketsData.tickets).filter(
        t => t.userId === user.id && !t.closed && t.guildId === guild.id
      );
      
      // Verificar si los canales de los tickets aún existen
      // Si un canal fue eliminado, marcar el ticket como cerrado automáticamente
      const validOpenTickets = [];
      for (const ticket of userOpenTickets) {
        try {
          const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
          if (channel) {
            // El canal existe, el ticket es válido
            validOpenTickets.push(ticket);
          } else {
            // El canal no existe, marcar el ticket como cerrado
            console.log(`[TICKET] Channel ${ticket.channelId} for ticket ${ticket.id} no longer exists. Marking as closed.`);
            ticket.closed = true;
            ticket.closedAt = new Date().toISOString();
            ticket.closeReason = 'Channel deleted';
            ticket.closedBy = null;
            ticket.closedByType = 'system';
            saveTickets();
          }
        } catch (error) {
          // Error al verificar el canal, asumir que no existe
          console.log(`[TICKET] Error checking channel ${ticket.channelId} for ticket ${ticket.id}:`, error.message);
          ticket.closed = true;
          ticket.closedAt = new Date().toISOString();
          ticket.closeReason = 'Channel deleted';
          ticket.closedBy = null;
          ticket.closedByType = 'system';
          saveTickets();
        }
      }
      
      // Actualizar la lista de tickets abiertos con solo los válidos
      userOpenTickets = validOpenTickets;
      
      if (userOpenTickets.length > 0) {
        // Log para debugging
        console.log(`[TICKET] User ${user.id} already has ${userOpenTickets.length} open ticket(s):`, 
          userOpenTickets.map(t => `${t.id} (${t.channelId})`).join(', '));
        throw new Error('You already have an open ticket. Please close it before creating a new one.');
      }
      
      const ticketId = `TKT-${String(ticketsData.nextId).padStart(4, '0')}`;
      const categoryName = category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ');
      
      // Buscar o crear categoría - MEJORADO para evitar duplicados
      // Primero intentar usar categoría configurada en setup si existe
      const guildConfig = GuildConfig.getConfig(guild.id);
      let ticketCategory = null;
      
      // Si hay una categoría de verificación configurada y es para tickets, usarla
      if (guildConfig?.verificationCategoryId) {
        const configCategory = await guild.channels.fetch(guildConfig.verificationCategoryId).catch(() => null);
        if (configCategory && configCategory.type === ChannelType.GuildCategory) {
          ticketCategory = configCategory;
          console.log(`[TICKET] Using configured category: ${ticketCategory.name}`);
        }
      }
      
      // Si no hay categoría configurada, buscar en todas las categorías del servidor
      if (!ticketCategory) {
        // Actualizar caché primero para asegurar que tenemos todas las categorías
        await guild.channels.fetch().catch(() => {});
        
        // Normalizar el nombre de categoría esperado (sin emojis, stickers, etc.)
        const normalizedExpectedName = normalizeCategoryName(categoryName);
        // Extraer palabra clave principal (primera palabra significativa)
        const categoryKeyword = category.toLowerCase().trim();
        
        // Extraer palabras individuales del nombre esperado para búsqueda flexible
        const expectedWords = normalizedExpectedName.split(/\s+/).filter(w => w.length > 2);
        
        console.log(`[TICKET] Searching for category:`);
        console.log(`[TICKET]   Expected normalized: "${normalizedExpectedName}"`);
        console.log(`[TICKET]   Keyword: "${categoryKeyword}"`);
        console.log(`[TICKET]   Expected words: ${expectedWords.join(', ')}`);
        
        // Obtener todas las categorías del servidor
        const allCategories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory);
        console.log(`[TICKET]   Available categories: ${allCategories.size}`);
        
        // Primero: Buscar categoría existente comparando nombres normalizados (ignora emojis/stickers)
        for (const cat of allCategories.values()) {
          const normalizedExistingName = normalizeCategoryName(cat.name);
          if (normalizedExistingName === normalizedExpectedName) {
            ticketCategory = cat;
            console.log(`[TICKET] ✅ Found by exact match: "${cat.name}" (normalized: "${normalizedExistingName}")`);
            break;
          }
        }
        
        // Segundo: Si no se encuentra, buscar por palabra clave (más flexible)
        if (!ticketCategory) {
          console.log(`[TICKET] No exact match, searching by keyword...`);
          for (const cat of allCategories.values()) {
            const normalizedExistingName = normalizeCategoryName(cat.name);
            // Buscar si el nombre normalizado contiene la palabra clave o viceversa
            if (normalizedExistingName.includes(categoryKeyword) || categoryKeyword.includes(normalizedExistingName)) {
              ticketCategory = cat;
              console.log(`[TICKET] ✅ Found by keyword: "${cat.name}" (normalized: "${normalizedExistingName}") contains "${categoryKeyword}"`);
              break;
            }
          }
        }
        
        // Tercero: Buscar por palabras individuales (más flexible aún)
        if (!ticketCategory && expectedWords.length > 0) {
          console.log(`[TICKET] No keyword match, searching by individual words...`);
          for (const cat of allCategories.values()) {
            const normalizedExistingName = normalizeCategoryName(cat.name);
            const existingWords = normalizedExistingName.split(/\s+/).filter(w => w.length > 2);
            
            // Verificar si alguna palabra esperada está en las palabras existentes
            const hasMatchingWord = expectedWords.some(expectedWord => {
              return existingWords.some(existingWord => {
                // Coincidencia exacta o contiene la palabra
                return existingWord === expectedWord || 
                       existingWord.includes(expectedWord) || 
                       expectedWord.includes(existingWord) ||
                       // Coincidencia aproximada (para errores de escritura como "purachase" vs "purchase")
                       (existingWord.length > 4 && expectedWord.length > 4 && 
                        existingWord.substring(0, 4) === expectedWord.substring(0, 4));
              });
            });
            
            if (hasMatchingWord) {
              ticketCategory = cat;
              console.log(`[TICKET] ✅ Found by word match: "${cat.name}" (normalized: "${normalizedExistingName}")`);
              break;
            }
          }
        }
        
        // Cuarto: Buscar variaciones comunes
        if (!ticketCategory) {
          console.log(`[TICKET] No word match, trying variations...`);
          const variations = [
            categoryName,
            categoryName.toLowerCase(),
            category,
            category.toLowerCase(),
            category.replace('_', ' '),
            category.replace('_', ' ').toLowerCase()
          ];
          
          for (const variation of variations) {
            const normalizedVariation = normalizeCategoryName(variation);
            for (const cat of allCategories.values()) {
              const normalizedExistingName = normalizeCategoryName(cat.name);
              if (normalizedExistingName === normalizedVariation || 
                  normalizedExistingName.includes(normalizedVariation) ||
                  normalizedVariation.includes(normalizedExistingName)) {
                ticketCategory = cat;
                console.log(`[TICKET] ✅ Found by variation: "${cat.name}" (normalized: "${normalizedExistingName}") matches "${normalizedVariation}"`);
                break;
              }
            }
            if (ticketCategory) break;
          }
        }
        
        // Log todas las categorías disponibles para debugging si no encuentra
        if (!ticketCategory) {
          console.log(`[TICKET] ⚠️ No matching category found. Available categories:`);
          allCategories.forEach(cat => {
            const normalized = normalizeCategoryName(cat.name);
            console.log(`[TICKET]   - "${cat.name}" (normalized: "${normalized}")`);
          });
        }
      }

      // Si aún no existe, crear la categoría
      if (!ticketCategory) {
        console.log(`[TICKET] Creating new category: ${categoryName}`);
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
              allow: [
                PermissionFlagsBits.ViewChannel, 
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.AttachFiles, // Permite videos y archivos
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.EmbedLinks, // Permite embeds (previews de videos)
                PermissionFlagsBits.UseExternalEmojis, // Permite emojis externos
                PermissionFlagsBits.UseExternalStickers // Permite stickers externos
              ]
            }
          ]
        });
      } else {
        console.log(`[TICKET] Using existing category: ${ticketCategory.name} (ID: ${ticketCategory.id})`);
      }

      // Obtener configuración del servidor (ya cargada arriba, reutilizar)
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
          allow: [
            PermissionFlagsBits.ViewChannel, 
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles, // Permite videos y archivos
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.EmbedLinks, // Permite embeds (previews de videos)
            PermissionFlagsBits.UseExternalEmojis, // Permite emojis externos (opcional pero útil)
            PermissionFlagsBits.UseExternalStickers // Permite stickers externos (opcional pero útil)
          ]
        }
      ];

      // Agregar roles si están configurados
      if (staffRoleId) {
        permissionOverwrites.push({
          id: staffRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel, 
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.EmbedLinks
          ]
        });
      }

      if (adminRoleId) {
        permissionOverwrites.push({
          id: adminRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel, 
            PermissionFlagsBits.SendMessages, 
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.EmbedLinks
          ]
        });
      }

      // Verificar que tenemos una categoría válida antes de crear el canal
      if (!ticketCategory || !ticketCategory.id) {
        console.error(`[TICKET] ERROR: No category found or created for ${categoryName}, creating emergency category...`);
        // Crear categoría de emergencia si no existe
        try {
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
                allow: [
                  PermissionFlagsBits.ViewChannel, 
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.AttachFiles,
                  PermissionFlagsBits.ReadMessageHistory,
                  PermissionFlagsBits.EmbedLinks
                ]
              }
            ]
          });
          console.log(`[TICKET] ✅ Emergency category created: ${ticketCategory.name}`);
        } catch (categoryError) {
          console.error(`[TICKET] CRITICAL: Failed to create emergency category:`, categoryError);
          throw new Error(`Failed to create or find category for ticket: ${categoryError.message}`);
        }
      }

      // CRÍTICO: Verificar que tenemos una categoría válida - NO crear canal sin categoría
      if (!ticketCategory || !ticketCategory.id) {
        console.error(`[TICKET] ❌ CRITICAL ERROR: No valid category available! Creating emergency category...`);
        try {
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
                allow: [
                  PermissionFlagsBits.ViewChannel, 
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.AttachFiles,
                  PermissionFlagsBits.ReadMessageHistory,
                  PermissionFlagsBits.EmbedLinks
                ]
              }
            ]
          });
          console.log(`[TICKET] ✅ Emergency category created: ${ticketCategory.name} (ID: ${ticketCategory.id})`);
        } catch (categoryError) {
          console.error(`[TICKET] ❌ CRITICAL: Failed to create emergency category:`, categoryError);
          throw new Error(`Failed to create or find category for ticket: ${categoryError.message}`);
        }
      }

      // Crear canal del ticket con formato específico
      let channelName;
      if (category.toLowerCase() === 'replaces') {
        channelName = `replaces-tkt-${String(ticketsData.nextId).padStart(4, '0')}`;
      } else {
        channelName = `${category.toLowerCase()}-${user.username.toLowerCase()}`;
      }

      // Crear canal del ticket - SIEMPRE con parent (categoría) - OBLIGATORIO
      console.log(`[TICKET] Creating channel "${channelName}" in category "${ticketCategory.name}" (ID: ${ticketCategory.id})`);
      
      // Verificar que la categoría existe antes de crear el canal
      try {
        const categoryCheck = await guild.channels.fetch(ticketCategory.id).catch(() => null);
        if (!categoryCheck || categoryCheck.type !== ChannelType.GuildCategory) {
          console.error(`[TICKET] ❌ Category ${ticketCategory.id} is invalid or doesn't exist! Creating emergency category...`);
          ticketCategory = await guild.channels.create({
            name: categoryName,
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
              {
                id: guild.id,
                deny: [PermissionFlagsBits.ViewChannel]
              }
            ]
          });
          console.log(`[TICKET] ✅ Emergency category created: ${ticketCategory.name} (ID: ${ticketCategory.id})`);
        }
      } catch (categoryError) {
        console.error(`[TICKET] ❌ Error verifying category:`, categoryError);
        throw new Error(`Category verification failed: ${categoryError.message}`);
      }
      
      // Crear el canal con parent explícito
      let ticketChannel;
      try {
        ticketChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: ticketCategory.id, // OBLIGATORIO - siempre debe tener categoría
          permissionOverwrites: permissionOverwrites
        });
        console.log(`[TICKET] Channel created: ${ticketChannel.id}`);
      } catch (createError) {
        console.error(`[TICKET] ❌ Error creating channel:`, createError);
        throw new Error(`Failed to create ticket channel: ${createError.message}`);
      }
      
      // CRÍTICO: Verificar inmediatamente después de crear que tiene la categoría correcta
      // Recargar el canal desde Discord para obtener el estado real
      try {
        const freshChannel = await guild.channels.fetch(ticketChannel.id);
        const actualParentId = freshChannel.parentId;
        
        if (!actualParentId || actualParentId !== ticketCategory.id) {
          console.error(`[TICKET] ❌ CRITICAL ERROR: Channel created without correct parent!`);
          console.error(`[TICKET]   Expected category: ${ticketCategory.id} (${ticketCategory.name})`);
          console.error(`[TICKET]   Actual parent: ${actualParentId || 'NONE'}`);
          
          // Intentar mover el canal a la categoría correcta inmediatamente
          try {
            await freshChannel.setParent(ticketCategory.id, { lockPermissions: false });
            // Verificar de nuevo después de mover
            const recheckChannel = await guild.channels.fetch(ticketChannel.id);
            if (recheckChannel.parentId === ticketCategory.id) {
              console.log(`[TICKET] ✅ Channel successfully moved to correct category after creation`);
            } else {
              throw new Error(`Channel still not in correct category after move attempt`);
            }
          } catch (moveError) {
            console.error(`[TICKET] ❌ CRITICAL: Failed to move channel to category:`, moveError);
            // Si no se puede mover, eliminar el canal y lanzar error
            try {
              await freshChannel.delete('Ticket created outside category - deleting to prevent orphaned channel');
              console.log(`[TICKET] ✅ Deleted incorrectly created channel`);
            } catch (deleteError) {
              console.error(`[TICKET] ❌ Failed to delete channel:`, deleteError);
            }
            throw new Error(`Failed to assign category to ticket channel. Channel was deleted to prevent orphaned tickets. Error: ${moveError.message}`);
          }
        } else {
          console.log(`[TICKET] ✅ Channel created successfully in category "${ticketCategory.name}" (ID: ${ticketCategory.id})`);
          console.log(`[TICKET] ✅ Verified: Channel parent is correct (${actualParentId})`);
        }
      } catch (verifyError) {
        console.error(`[TICKET] ❌ Error verifying channel category:`, verifyError);
        // Intentar eliminar el canal si no podemos verificar
        try {
          await ticketChannel.delete('Verification failed - deleting channel').catch(() => {});
        } catch {}
        throw new Error(`Failed to verify ticket channel category: ${verifyError.message}`);
      }

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
        guildId: guild.id, // IMPORTANTE: Guardar guildId para persistencia
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
        ratingTimeout: null,
        pendingClose: false,
        ratingStartedAt: null
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
      // CRÍTICO: Recargar tickets antes de buscar
      loadTickets();
      
      // Buscar por ID primero
      let ticket = ticketsData.tickets[ticketId];
      
      // Si no se encuentra, intentar búsqueda alternativa
      if (!ticket) {
        ticket = this.getTicket(ticketId);
      }
      
      if (!ticket) {
        console.error(`[TICKET] claimTicket: Ticket not found: ${ticketId}`);
        throw new Error('Ticket not found');
      }

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
      // CRÍTICO: Recargar tickets antes de buscar
      loadTickets();
      
      // Buscar por ID primero
      let ticket = ticketsData.tickets[ticketId];
      
      // Si no se encuentra, intentar búsqueda alternativa
      if (!ticket) {
        ticket = this.getTicket(ticketId);
      }
      
      // Si aún no se encuentra, buscar por variaciones del ID
      if (!ticket) {
        const cleanId = ticketId.replace(/^TKT-?/i, '');
        const formattedId = `TKT-${cleanId.padStart(4, '0')}`;
        ticket = ticketsData.tickets[formattedId];
      }
      
      if (!ticket) {
        console.error(`[TICKET] initiateClose: Ticket not found: ${ticketId}`);
        throw new Error('Ticket not found');
      }

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
      // CRÍTICO: Recargar tickets antes de buscar
      loadTickets();
      
      // Buscar por ID primero
      let ticket = ticketsData.tickets[ticketId];
      
      // Si no se encuentra, intentar búsqueda alternativa
      if (!ticket) {
        ticket = this.getTicket(ticketId);
      }
      
      // Si aún no se encuentra, buscar por variaciones del ID
      if (!ticket) {
        const cleanId = ticketId.replace(/^TKT-?/i, '');
        const formattedId = `TKT-${cleanId.padStart(4, '0')}`;
        ticket = ticketsData.tickets[formattedId];
      }
      
      if (!ticket) {
        console.error(`[TICKET] showRatings: Ticket not found: ${ticketId}`);
        throw new Error('Ticket not found');
      }

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
      // Verificar que existe serviceRatingMsgId antes de intentar obtener el mensaje
      if (ticket.serviceRatingMsgId) {
        try {
          const serviceMsg = await channel.messages.fetch(ticket.serviceRatingMsgId).catch(() => null);
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
            }).catch(err => {
              console.warn(`[TICKET] Could not edit service rating message: ${err.message}`);
              // Continuar aunque no se pueda editar el mensaje
            });
          } else {
            console.warn(`[TICKET] Service rating message ${ticket.serviceRatingMsgId} not found, continuing anyway`);
          }
        } catch (msgError) {
          console.warn(`[TICKET] Error fetching service rating message: ${msgError.message}`);
          // Continuar aunque no se pueda obtener el mensaje
        }
      } else {
        console.warn(`[TICKET] No serviceRatingMsgId found for ticket ${ticketId}, skipping message update`);
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
      // Verificar que existe staffRatingMsgId antes de intentar obtener el mensaje
      if (ticket.staffRatingMsgId) {
        try {
          const staffMsg = await channel.messages.fetch(ticket.staffRatingMsgId).catch(() => null);
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
            }).catch(err => {
              console.warn(`[TICKET] Could not edit staff rating message: ${err.message}`);
              // Continuar aunque no se pueda editar el mensaje
            });
          } else {
            console.warn(`[TICKET] Staff rating message ${ticket.staffRatingMsgId} not found, continuing anyway`);
          }
        } catch (msgError) {
          console.warn(`[TICKET] Error fetching staff rating message: ${msgError.message}`);
          // Continuar aunque no se pueda obtener el mensaje
        }
      } else {
        console.warn(`[TICKET] No staffRatingMsgId found for ticket ${ticketId}, skipping message update`);
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
                value: claimedBy ? `${claimedBy} (${claimedBy.user.tag})` : 'Nobody claimed this ticket',
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

          // Formato como foto 4 y 5
          const staffRatingEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('✨ New Ticket Review')
            .addFields(
              {
                name: '👤 User Information',
                value: `Creator: <@${ticket.userId}> ${user?.user.username || 'Unknown'}\nCategory: ${ticket.category || 'Support'}\nMessages: ${ticket.messageCount || 1}`,
                inline: false
              },
              {
                name: '⭐ User Feedback',
                value: '⭐'.repeat(ticket.staffRating) + '☆'.repeat(5 - ticket.staffRating) + `\n${ticket.staffRatingComment || 'No comment provided'}`,
                inline: false
              }
            )
            .setThumbnail(user?.user.displayAvatarURL({ dynamic: true }) || guild.iconURL({ dynamic: true }))
            .setFooter({ 
              text: `${guild.name} • ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`,
              iconURL: guild.iconURL({ dynamic: true }) || undefined
            })
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
                value: staffMember ? `${staffMember} (${staffMember.user.tag})` : 'Nobody claimed this ticket',
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

      // Aprender del ticket cerrado
      try {
        learnFromTicket(ticket);
      } catch (learnError) {
        console.error('[TICKET] Error learning from ticket:', learnError);
      }

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
   * Enviar transcript del ticket (mejorado con formato embellecido)
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

      // Obtener todos los mensajes (hasta 1000)
      let allMessages = [];
      let lastMessageId = null;
      let hasMore = true;
      
      while (hasMore && allMessages.length < 1000) {
        const options = { limit: 100 };
        if (lastMessageId) options.before = lastMessageId;
        
        const batch = await channel.messages.fetch(options);
        if (batch.size === 0) {
          hasMore = false;
        } else {
          allMessages = allMessages.concat(Array.from(batch.values()));
          lastMessageId = batch.last().id;
          if (batch.size < 100) hasMore = false;
        }
      }
      
      const sortedMessages = allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      const user = await guild.members.fetch(ticket.userId).catch(() => null);
      const claimedBy = ticket.claimedBy ? await guild.members.fetch(ticket.claimedBy).catch(() => null) : null;
      const closedBy = ticket.closedBy ? await guild.members.fetch(ticket.closedBy).catch(() => null) : null;

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

      // Crear embed embellecido
      const transcriptEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📄 Transcript - ${ticket.id}`)
        .setDescription(`Complete transcript of ticket ${ticket.id}`)
        .addFields(
          {
            name: '👤 Ticket Owner',
            value: user ? `<@${ticket.userId}> (${user.user.tag})` : `User ID: ${ticket.userId}`,
            inline: true
          },
          {
            name: '📝 Channel Name',
            value: channel.name,
            inline: true
          },
          {
            name: '📂 Category',
            value: ticket.category.charAt(0).toUpperCase() + ticket.category.slice(1),
            inline: true
          },
          {
            name: '📅 Created',
            value: `<t:${Math.floor(new Date(ticket.createdAt).getTime() / 1000)}:F>`,
            inline: true
          },
          {
            name: '🔒 Closed',
            value: ticket.closedAt ? `<t:${Math.floor(new Date(ticket.closedAt).getTime() / 1000)}:F>` : 'N/A',
            inline: true
          },
          {
            name: '📊 Messages',
            value: `${sortedMessages.length} messages`,
            inline: true
          }
        )
        .setTimestamp();

      // Agregar información de claimed by
      if (claimedBy) {
        transcriptEmbed.addFields({
          name: '✅ Claimed by',
          value: `<@${ticket.claimedBy}> (${claimedBy.user.tag})`,
          inline: true
        });
      } else {
        transcriptEmbed.addFields({
          name: '✅ Claimed by',
          value: 'Nobody claimed this ticket',
          inline: true
        });
      }
      
      // Agregar información de closed by
      if (closedBy) {
        const closedByType = ticket.closedByType || 'staff';
        const typeLabel = closedByType === 'owner' ? 'Owner/Admin' : closedByType === 'user' ? 'Ticket Creator' : 'Staff';
        transcriptEmbed.addFields({
          name: '🔒 Closed by',
          value: `<@${ticket.closedBy}> (${closedBy.user.tag}) - ${typeLabel}`,
          inline: true
        });
      }
      
      // Agregar razón de cierre
      if (ticket.closeReason) {
        transcriptEmbed.addFields({
          name: '📝 Close Reason',
          value: ticket.closeReason,
          inline: false
        });
      }
      
      // Agregar ratings
      transcriptEmbed.addFields(
        {
          name: '⭐ Service Rating',
          value: ticket.serviceRating ? `${ticket.serviceRating}/5` : 'N/A/5',
          inline: true
        },
        {
          name: '👤 Staff Rating',
          value: ticket.staffRating ? `${ticket.staffRating}/5` : 'N/A/5',
          inline: true
        }
      );

      // Agregar participantes
      transcriptEmbed.addFields({
        name: '👥 Participants',
        value: participantsList || 'None',
        inline: false
      });

      // Generar transcript en texto para archivo HTML
      let transcriptText = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Transcript - ${ticket.id}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 20px;
            color: #333;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        h1 {
            color: #667eea;
            border-bottom: 3px solid #667eea;
            padding-bottom: 10px;
        }
        .info {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
        }
        .info-item {
            margin: 10px 0;
        }
        .info-label {
            font-weight: bold;
            color: #667eea;
        }
        .messages {
            margin-top: 30px;
        }
        .message {
            padding: 15px;
            margin: 10px 0;
            border-left: 4px solid #667eea;
            background: #f9f9f9;
            border-radius: 5px;
        }
        .message-header {
            font-weight: bold;
            color: #667eea;
            margin-bottom: 5px;
        }
        .message-time {
            color: #999;
            font-size: 0.9em;
        }
        .message-content {
            margin-top: 5px;
        }
        .embed {
            background: #e8e8e8;
            padding: 10px;
            border-radius: 5px;
            margin-top: 5px;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📄 Transcript - ${ticket.id}</h1>
        
        <div class="info">
            <div class="info-item"><span class="info-label">Ticket Owner:</span> ${user ? `${user.user.tag} (${user.user.id})` : `User ID: ${ticket.userId}`}</div>
            <div class="info-item"><span class="info-label">Channel Name:</span> ${channel.name}</div>
            <div class="info-item"><span class="info-label">Channel ID:</span> ${channel.id}</div>
            <div class="info-item"><span class="info-label">Category:</span> ${ticket.category}</div>
            <div class="info-item"><span class="info-label">Created:</span> ${new Date(ticket.createdAt).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'long' })}</div>
            <div class="info-item"><span class="info-label">Closed:</span> ${ticket.closedAt ? new Date(ticket.closedAt).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'long' }) : 'N/A'}</div>
            ${claimedBy ? `<div class="info-item"><span class="info-label">Claimed by:</span> ${claimedBy.user.tag} (${claimedBy.user.id})</div>` : '<div class="info-item"><span class="info-label">Claimed by:</span> Nobody claimed this ticket</div>'}
            ${closedBy ? `<div class="info-item"><span class="info-label">Closed by:</span> ${closedBy.user.tag} (${closedBy.user.id}) - ${ticket.closedByType === 'owner' ? 'Owner/Admin' : ticket.closedByType === 'user' ? 'Ticket Creator' : 'Staff'}</div>` : ''}
            ${ticket.closeReason ? `<div class="info-item"><span class="info-label">Close Reason:</span> ${ticket.closeReason}</div>` : ''}
            <div class="info-item"><span class="info-label">Service Rating:</span> ${ticket.serviceRating || 'N/A'}/5</div>
            <div class="info-item"><span class="info-label">Staff Rating:</span> ${ticket.staffRating || 'N/A'}/5</div>
            <div class="info-item"><span class="info-label">Participants:</span> ${participantsList.replace(/<@(\d+)>/g, 'User ID: $1')}</div>
        </div>
        
        <div class="messages">
            <h2>--- Messages ---</h2>
`;

      for (const msg of sortedMessages.values()) {
        const date = new Date(msg.createdTimestamp).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'medium' });
        const content = msg.content || '(No text content)';
        transcriptText += `
            <div class="message">
                <div class="message-header">${msg.author.tag}</div>
                <div class="message-time">${date}</div>
                <div class="message-content">${content.replace(/\n/g, '<br>')}</div>
                ${msg.embeds.length > 0 ? `<div class="embed">[Embed: ${msg.embeds[0].title || 'No title'}]</div>` : ''}
                ${msg.attachments.size > 0 ? `<div class="embed">[${msg.attachments.size} Attachment(s)]</div>` : ''}
            </div>
`;
      }

      transcriptText += `
        </div>
    </div>
</body>
</html>`;

      // Guardar archivo HTML
      const { writeFileSync, unlinkSync } = await import('fs');
      const filename = `transcript-${ticket.id}.html`;
      writeFileSync(filename, transcriptText, 'utf-8');

      // Crear botones para acciones
      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`transcript_direct_${ticket.id}`)
            .setLabel('Direct Link')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📎')
        );

      // Enviar embed y archivo
      await transcriptChannel.send({
        embeds: [transcriptEmbed],
        files: [{
          attachment: filename,
          name: `transcript-${ticket.id}.html`
        }],
        components: [buttons]
      });

      // Eliminar archivo temporal
      unlinkSync(filename);

      console.log(`[TICKET] ✅ Transcript sent for ${ticket.id}`);
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
          // Han pasado 24 horas sin completar las reviews, asignar 5 estrellas y cerrar automáticamente
          console.log(`[TICKET] Auto-closing ticket ${ticketId} after 24 hours without completing reviews`);
          
          // Asignar 5 estrellas automáticamente si no se completaron
          if (!ticket.serviceRating) {
            ticket.serviceRating = 5;
          }
          if (!ticket.staffRating) {
            ticket.staffRating = 5;
          }
          saveTickets();
          
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
  static getTicketByChannel(channelId, verbose = false) {
    // Recargar tickets antes de buscar para asegurar datos actualizados
    loadTickets();
    
    if (!channelId) {
      if (verbose) {
        console.warn('[TICKET] getTicketByChannel called with null/undefined channelId');
      }
      return null;
    }
    
    // Buscar por channelId exacto
    let ticket = Object.values(ticketsData.tickets).find(t => t.channelId === channelId);
    
    if (ticket) {
      return ticket;
    }
    
    // Si no se encuentra, buscar también por channelId como string
    ticket = Object.values(ticketsData.tickets).find(t => 
      String(t.channelId) === String(channelId)
    );
    
    if (ticket) {
      return ticket;
    }
    
    // Solo loguear si se solicita explícitamente (verbose) o si hay tickets disponibles
    // Esto evita spam cuando se verifica en canales que no son tickets
    if (verbose || Object.keys(ticketsData.tickets).length > 0) {
      console.log(`[TICKET] No ticket found for channel: ${channelId}`);
      if (verbose) {
        console.log(`[TICKET] Available tickets: ${Object.keys(ticketsData.tickets).length}`);
        console.log(`[TICKET] Channel IDs in tickets: ${Object.values(ticketsData.tickets).map(t => t.channelId).join(', ')}`);
      }
    }
    
    return null;
  }

  /**
   * Guardar tickets (método estático)
   */
  static saveTickets() {
    saveTickets();
  }

  /**
   * Recargar tickets manualmente (útil para forzar actualización)
   */
  static reloadTickets() {
    loadTickets();
  }

  /**
   * Obtener todos los tickets
   */
  static getAllTickets() {
    loadTickets();
    return ticketsData.tickets;
  }

  /**
   * Mover un ticket a la categoría "Done" automáticamente
   */
  static async moveTicketToDoneCategory(guild, ticketId, channel) {
    try {
      // Recargar tickets
      loadTickets();
      
      // Buscar ticket
      let ticket = ticketsData.tickets[ticketId];
      if (!ticket) {
        ticket = this.getTicket(ticketId);
      }
      
      if (!ticket) {
        console.error(`[TICKET] moveTicketToDoneCategory: Ticket not found: ${ticketId}`);
        return;
      }
      
      // Buscar o crear categoría "Done"
      await guild.channels.fetch().catch(() => {});
      const allCategories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory);
      
      // Buscar categoría "Done" o "Done Ticket"
      let doneCategory = null;
      const doneKeywords = ['done', 'done ticket', 'completed', 'finished'];
      
      // Primero: búsqueda exacta normalizada
      for (const cat of allCategories.values()) {
        const normalized = normalizeCategoryName(cat.name);
        if (normalized === 'done' || normalized === 'done ticket') {
          doneCategory = cat;
          console.log(`[TICKET] ✅ Found "Done" category: ${cat.name} (ID: ${cat.id})`);
          break;
        }
      }
      
      // Segundo: búsqueda por palabra clave
      if (!doneCategory) {
        for (const cat of allCategories.values()) {
          const normalized = normalizeCategoryName(cat.name);
          if (doneKeywords.some(keyword => normalized.includes(keyword))) {
            doneCategory = cat;
            console.log(`[TICKET] ✅ Found "Done" category by keyword: ${cat.name} (ID: ${cat.id})`);
            break;
          }
        }
      }
      
      // Si no existe, crear categoría "Done Ticket"
      if (!doneCategory) {
        console.log(`[TICKET] Creating "Done Ticket" category...`);
        doneCategory = await guild.channels.create({
          name: 'Done Ticket',
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              id: guild.id,
              deny: [PermissionFlagsBits.ViewChannel]
            }
          ]
        });
        console.log(`[TICKET] ✅ Created "Done Ticket" category (ID: ${doneCategory.id})`);
      }
      
      // Mover el canal a la categoría "Done"
      if (channel.parentId !== doneCategory.id) {
        await channel.setParent(doneCategory.id, { lockPermissions: false });
        console.log(`[TICKET] ✅ Moved ticket ${ticketId} to "Done" category`);
      } else {
        console.log(`[TICKET] ℹ️ Ticket ${ticketId} already in "Done" category`);
      }
    } catch (error) {
      console.error(`[TICKET] ❌ Error moving ticket to Done category:`, error);
      throw error;
    }
  }

  /**
   * Actualizar permisos de un ticket para permitir archivos y videos
   */
  static async updateTicketPermissions(guild, ticket) {
    try {
      const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
      if (!channel) return false;

      const guildConfig = GuildConfig.getConfig(guild.id);
      const staffRoleId = guildConfig?.staffRoleId;
      const adminRoleId = guildConfig?.adminRoleId;

      let needsUpdate = false;
      const permissionOverwrites = channel.permissionOverwrites.cache;

      // Verificar permisos del usuario creador
      try {
        // Verificar que el usuario existe antes de intentar crear/editar permisos
        const user = await guild.members.fetch(ticket.userId).catch(() => null);
        if (!user) {
          console.warn(`[TICKET] ⚠️ User ${ticket.userId} not found in guild, skipping user permission update`);
        } else {
        
        const userOverwrite = permissionOverwrites.get(ticket.userId);
        if (userOverwrite) {
          const hasAttachFiles = userOverwrite.allow.has(PermissionFlagsBits.AttachFiles);
          const hasEmbedLinks = userOverwrite.allow.has(PermissionFlagsBits.EmbedLinks);
          
          if (!hasAttachFiles || !hasEmbedLinks) {
            needsUpdate = true;
            await channel.permissionOverwrites.edit(user, {
              ViewChannel: true,
              SendMessages: true,
              AttachFiles: true,
              ReadMessageHistory: true,
              EmbedLinks: true,
              UseExternalEmojis: true,
              UseExternalStickers: true
            });
            console.log(`[TICKET] ✅ Updated permissions for user ${ticket.userId} in ticket ${ticket.id}`);
          }
        } else {
          // Si no tiene overwrite, crear uno
          needsUpdate = true;
          await channel.permissionOverwrites.create(user, {
            ViewChannel: true,
            SendMessages: true,
            AttachFiles: true,
            ReadMessageHistory: true,
            EmbedLinks: true,
            UseExternalEmojis: true,
            UseExternalStickers: true
          });
          console.log(`[TICKET] ✅ Created permissions for user ${ticket.userId} in ticket ${ticket.id}`);
        }
        }
      } catch (userError) {
        console.error(`[TICKET] ❌ Error handling user permissions:`, userError.message);
        // Continuar con roles aunque user falle
      }

      // Verificar permisos de staff
      if (staffRoleId) {
        try {
          // Verificar que el rol existe antes de intentar crear/editar permisos
          const staffRole = await guild.roles.fetch(staffRoleId).catch(() => null);
          if (!staffRole) {
            console.warn(`[TICKET] ⚠️ Staff role ${staffRoleId} not found, skipping staff permission update`);
          } else {
          
          const staffOverwrite = permissionOverwrites.get(staffRoleId);
          if (staffOverwrite) {
            const hasAttachFiles = staffOverwrite.allow.has(PermissionFlagsBits.AttachFiles);
            const hasEmbedLinks = staffOverwrite.allow.has(PermissionFlagsBits.EmbedLinks);
            
            if (!hasAttachFiles || !hasEmbedLinks) {
              needsUpdate = true;
              await channel.permissionOverwrites.edit(staffRole, {
                ViewChannel: true,
                SendMessages: true,
                AttachFiles: true,
                ReadMessageHistory: true,
                EmbedLinks: true
              });
              console.log(`[TICKET] ✅ Updated permissions for staff role in ticket ${ticket.id}`);
            }
          } else {
            needsUpdate = true;
            await channel.permissionOverwrites.create(staffRole, {
              ViewChannel: true,
              SendMessages: true,
              AttachFiles: true,
              ReadMessageHistory: true,
              EmbedLinks: true
            });
            console.log(`[TICKET] ✅ Created permissions for staff role in ticket ${ticket.id}`);
          }
          }
        } catch (staffError) {
          console.error(`[TICKET] ❌ Error handling staff role permissions:`, staffError.message);
          // Continuar con admin role aunque staff falle
        }
      }

      // Verificar permisos de admin
      if (adminRoleId) {
        try {
          // Verificar que el rol existe antes de intentar crear/editar permisos
          const adminRole = await guild.roles.fetch(adminRoleId).catch(() => null);
          if (!adminRole) {
            console.warn(`[TICKET] ⚠️ Admin role ${adminRoleId} not found, skipping admin permission update`);
          } else {
          
          const adminOverwrite = permissionOverwrites.get(adminRoleId);
          if (adminOverwrite) {
            const hasAttachFiles = adminOverwrite.allow.has(PermissionFlagsBits.AttachFiles);
            const hasEmbedLinks = adminOverwrite.allow.has(PermissionFlagsBits.EmbedLinks);
            
            if (!hasAttachFiles || !hasEmbedLinks) {
              needsUpdate = true;
              await channel.permissionOverwrites.edit(adminRole, {
                ViewChannel: true,
                SendMessages: true,
                ManageChannels: true,
                AttachFiles: true,
                ReadMessageHistory: true,
                EmbedLinks: true
              });
              console.log(`[TICKET] ✅ Updated permissions for admin role in ticket ${ticket.id}`);
            }
          } else {
            needsUpdate = true;
            await channel.permissionOverwrites.create(adminRole, {
              ViewChannel: true,
              SendMessages: true,
              ManageChannels: true,
              AttachFiles: true,
              ReadMessageHistory: true,
              EmbedLinks: true
            });
            console.log(`[TICKET] ✅ Created permissions for admin role in ticket ${ticket.id}`);
          }
          }
        } catch (adminError) {
          console.error(`[TICKET] ❌ Error handling admin role permissions:`, adminError.message);
          // Continuar aunque admin falle
        }
      }

      return needsUpdate;
    } catch (error) {
      console.error(`[TICKET] ❌ Error updating permissions for ticket ${ticket.id}:`, error);
      return false;
    }
  }

  /**
   * Recuperar tickets al iniciar el bot - verificar que los canales existan
   */
  static async recoverTickets(guild) {
    try {
      // CRÍTICO: Recargar tickets antes de recuperar
      loadTickets();
      
      const totalTickets = Object.keys(ticketsData.tickets).length;
      console.log(`[TICKET-RECOVERY] Checking tickets for guild ${guild.name}...`);
      console.log(`[TICKET-RECOVERY] Total tickets in file: ${totalTickets}`);
      
      let recovered = 0;
      let closed = 0;
      let skipped = 0;
      let permissionsUpdated = 0;
      
      // Obtener todos los canales del servidor para verificación más rápida
      const guildChannels = await guild.channels.fetch().catch(() => new Map());
      const channelIds = new Set(Array.from(guildChannels.values()).map(c => c.id));
      
      for (const [ticketId, ticket] of Object.entries(ticketsData.tickets)) {
        // Si el ticket ya está cerrado, continuar
        if (ticket.closed) {
          skipped++;
          continue;
        }
        
        // Verificar si el ticket pertenece a este servidor
        // Si no tiene guildId, intentar verificarlo por el canal
        if (ticket.guildId && ticket.guildId !== guild.id) {
          skipped++;
          continue;
        }
        
        // Si no tiene guildId, verificar si el canal existe en este servidor
        if (!ticket.guildId) {
          if (ticket.channelId && channelIds.has(ticket.channelId)) {
            // El canal existe en este servidor, asignar guildId
            ticket.guildId = guild.id;
            console.log(`[TICKET-RECOVERY] 🔄 Assigned guildId to ticket ${ticketId} (channel: ${ticket.channelId})`);
          } else {
            // El canal no existe en este servidor, saltar
            skipped++;
            continue;
          }
        }
        
        try {
          // Verificar que el canal existe
          const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
          
          if (!channel) {
            // Canal no existe, marcar ticket como cerrado
            console.log(`[TICKET-RECOVERY] ❌ Channel not found for ticket ${ticketId} (${ticket.channelId}), marking as closed`);
            ticket.closed = true;
            ticket.closedAt = new Date().toISOString();
            ticket.closeReason = 'Channel deleted or bot restarted';
            closed++;
          } else {
            // Canal existe, verificar que el ticket esté activo
            console.log(`[TICKET-RECOVERY] ✅ Ticket ${ticketId} recovered - Channel: ${channel.name} (${channel.id})`);
            recovered++;
            
            // Asegurar que el ticket tenga guildId guardado
            if (!ticket.guildId) {
              ticket.guildId = guild.id;
            }
            
            // Verificar que el ticket tenga todos los campos necesarios
            if (!ticket.id) {
              ticket.id = ticketId;
            }
            
            // CRÍTICO: Actualizar permisos del ticket para permitir archivos y videos
            try {
              const updated = await this.updateTicketPermissions(guild, ticket);
              if (updated) {
                permissionsUpdated++;
                console.log(`[TICKET-RECOVERY] ✅ Updated permissions for ticket ${ticketId}`);
              }
            } catch (permError) {
              console.error(`[TICKET-RECOVERY] ⚠️ Error updating permissions for ticket ${ticketId}:`, permError.message);
            }
          }
        } catch (error) {
          console.error(`[TICKET-RECOVERY] ❌ Error checking ticket ${ticketId}:`, error.message);
          // Si hay error, intentar marcar como cerrado para evitar problemas
          ticket.closed = true;
          ticket.closedAt = new Date().toISOString();
          ticket.closeReason = `Error during recovery: ${error.message}`;
          closed++;
        }
      }
      
      // Guardar cambios
      saveTickets();
      
      console.log(`[TICKET-RECOVERY] ✅ Recovery complete:`);
      console.log(`[TICKET-RECOVERY]   - Recovered: ${recovered} tickets`);
      console.log(`[TICKET-RECOVERY]   - Permissions updated: ${permissionsUpdated} tickets`);
      console.log(`[TICKET-RECOVERY]   - Closed: ${closed} invalid tickets`);
      console.log(`[TICKET-RECOVERY]   - Skipped: ${skipped} tickets (closed or other guild)`);
      console.log(`[TICKET-RECOVERY]   - Total processed: ${recovered + closed + skipped}/${totalTickets}`);
    } catch (error) {
      console.error('[TICKET-RECOVERY] ❌ Error recovering tickets:', error);
      console.error('[TICKET-RECOVERY] Stack:', error.stack);
    }
  }
}

