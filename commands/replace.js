import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { loadVariantsData } from '../utils/dataLoader.js';
import { parseDeliverables } from '../utils/parseDeliverables.js';
import { ErrorLog } from '../utils/errorLogger.js';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';
import { isUserTimedOut, checkRateLimit, applyTimeout, getTimeoutRemaining } from '../utils/rateLimiter.js';
import { addToHistory } from '../utils/historyManager.js';
import { PendingOrders } from '../utils/PendingOrders.js';
import { config } from '../utils/config.js';

const variantsDataPath = join(process.cwd(), 'variantsData.json');

async function getVariantStock(api, productId, variantId) {
  if (!productId || !variantId) {
    console.error('[STOCK CHECK] Missing productId or variantId');
    return [];
  }

  try {
    const deliverablesData = await api.get(`shops/${api.shopId}/products/${productId}/deliverables/${variantId}`);
    const items = parseDeliverables(deliverablesData);

    console.log(`[STOCK CHECK] Product ${productId}, Variant ${variantId}: Found ${items.length} items`);
    return items;
  } catch (e) {
    console.error(`[STOCK CHECK ERROR] Product ${productId}, Variant ${variantId}: ${e.message}`);
    return [];
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('replace')
    .setDescription('Take items from stock and send them')
    .addStringOption((option) =>
      option.setName('product').setDescription('Product name or ID').setRequired(true).setAutocomplete(true)
    )
    .addIntegerOption((option) =>
      option.setName('quantity').setDescription('Number of items to take from stock').setRequired(true).setMinValue(1)
    )
    .addStringOption((option) =>
      option.setName('variant').setDescription('Select variant').setRequired(true).setAutocomplete(true)
    ),

  onlyWhitelisted: true,
  requiredRole: 'staff',

  async autocomplete(interaction, api) {
    try {
      const focusedOption = interaction.options.getFocused(true);
      
      if (focusedOption.name === 'product') {
        try {
          const variantsData = loadVariantsData();
          const searchTerm = (focusedOption.value || '').toLowerCase().trim();
          
          // Get all products and filter
          const products = Object.values(variantsData)
            .filter((p) => p && p.productName && p.productId)
            .map((p) => ({
              name: p.productName.slice(0, 100), // Discord limit
              id: String(p.productId)
            }))
            .filter((p) => 
              searchTerm === '' || 
              p.name.toLowerCase().includes(searchTerm) ||
              p.id.includes(searchTerm)
            )
            .slice(0, 25);

          // Format for Discord
          const response = products.map((p) => ({
            name: p.name,
            value: p.id
          }));

          console.log(`[REPLACE] Product autocomplete: Found ${response.length} products for "${searchTerm}"`);
          await interaction.respond(response);
        } catch (err) {
          console.error(`[REPLACE] Product autocomplete error: ${err.message}`);
          try {
            await interaction.respond([]);
          } catch (e) {
            console.error(`[REPLACE] Failed to respond: ${e.message}`);
          }
        }
      } else if (focusedOption.name === 'variant') {
        try {
          const productInput = interaction.options.getString('product');

          if (!productInput) {
            await interaction.respond([]);
            return;
          }

          const variantsData = loadVariantsData();
          const productData = variantsData[productInput];

          if (!productData || !productData.variants) {
            console.log(`[REPLACE] No variants found for product ${productInput}`);
            await interaction.respond([]);
            return;
          }

          const variants = Object.values(productData.variants)
            .filter((v) => v && v.id && v.name)
            .map((v) => ({
              name: `${v.name.slice(0, 80)} (${v.stock})`.slice(0, 100),
              value: String(v.id)
            }))
            .slice(0, 25);

          console.log(`[REPLACE] Variant autocomplete: Found ${variants.length} variants`);
          await interaction.respond(variants);
        } catch (err) {
          console.error(`[REPLACE] Variant autocomplete error: ${err.message}`);
          try {
            await interaction.respond([]);
          } catch (e) {
            console.error(`[REPLACE] Failed to respond: ${e.message}`);
          }
        }
      }
    } catch (error) {
      console.error(`[REPLACE] Autocomplete error: ${error.message}`);
    }
  },

  async execute(interaction, api) {
    const productInput = interaction.options.getString('product');
    const quantity = interaction.options.getInteger('quantity');
    const variantInput = interaction.options.getString('variant');
    const userId = interaction.user.id;
    const ownerId = process.env.BOT_USER_ID_WHITELIST?.split(',')[0]; // Owner is first in whitelist
    
    // SIEMPRE público (obligatorio)
    const isPrivate = false;

    try {
      // RATE LIMIT CHECK (unless user is owner)
      if (userId !== ownerId) {
        // Check if user is timed out
        if (isUserTimedOut(userId)) {
          const remaining = getTimeoutRemaining(userId);
          const daysRemaining = Math.ceil(remaining / (24 * 60 * 60 * 1000));
          const hoursRemaining = Math.ceil(remaining / (60 * 60 * 1000));
          const timeStr = daysRemaining >= 1 ? `${daysRemaining} día(s)` : `${hoursRemaining} hora(s)`;
          
          try {
            await interaction.deferReply({ ephemeral: true });
          } catch (e) {}
          
          await interaction.editReply({
            content: `🚫 **AISLADO DEL SERVIDOR**\n\nTienes un timeout activo por spam/abuso.\n⏱️ Tiempo restante: **${timeStr}**\n\nContacta a un admin si crees que es un error.`
          });
          return;
        }

        // Check rate limit for this user
        const rateLimitCheck = checkRateLimit(userId, 'replace');
        if (rateLimitCheck.violated) {
          // APPLY TIMEOUT: 3 days
          applyTimeout(userId, interaction.member, interaction.guild, rateLimitCheck.reason);
          
          try {
            await interaction.deferReply({ ephemeral: true });
          } catch (e) {}
          
          await interaction.editReply({
            content: `🚫 **¡AISLADO POR SPAM!**\n\n**Razón:** ${rateLimitCheck.reason}\n⏱️ **Duración:** 3 días\n\nHas ejecutado demasiados replaces muy rápido. Intenta de nuevo en 3 días.`
          });

          // Log this to console and error logger
          console.log(`[RATE-LIMITER] 🚫 User ${userId} (${interaction.user.username}) isolated for 3 days. Reason: ${rateLimitCheck.reason}`);
          ErrorLog.log('replace-timeout', new Error(`User isolated for spam: ${rateLimitCheck.reason}`), {
            userId,
            username: interaction.user.username,
            reason: rateLimitCheck.reason
          });

          return;
        }
      }

      await AdvancedCommandLogger.logCommand(interaction, 'replace');
      try {
        await interaction.deferReply({ ephemeral: isPrivate });
      } catch (deferError) {
        console.error(`[REPLACE] Defer error: ${deferError.message}`);
        return;
      }

      // Load data from cache
      const variantsData = loadVariantsData();

      // Validate product input
      if (!productInput || typeof productInput !== 'string') {
        await interaction.editReply({
          content: `❌ ID de producto inválido`
        });
        return;
      }

      // Find product by ID in cache
      const productData = variantsData[productInput];
      if (!productData || typeof productData !== 'object') {
        await interaction.editReply({
          content: `❌ Producto no encontrado: ${productInput}`
        });
        return;
      }

      // Validate productId exists
      if (!productData.productId || typeof productData.productId !== 'number') {
        console.error('[REPLACE] Invalid productId in cache:', productData.productId);
        await interaction.editReply({
          content: `❌ Estructura de caché corrupta. Ejecuta /sync-variants`
        });
        return;
      }

      // Validate variant input
      if (!variantInput || typeof variantInput !== 'string') {
        await interaction.editReply({
          content: `❌ ID de variante inválido`
        });
        return;
      }

      // Find variant by ID
      const variantData = productData.variants?.[variantInput];
      if (!variantData || typeof variantData !== 'object') {
        await interaction.editReply({
          content: `❌ Variante no encontrada`
        });
        return;
      }

      // Validate variant structure
      if (!variantData.id || typeof variantData.id !== 'number') {
        console.error('[REPLACE] Invalid variantId in cache:', variantData.id);
        await interaction.editReply({
          content: `❌ Estructura de caché corrupta. Ejecuta /sync-variants`
        });
        return;
      }

      // Validate and get stock
      const cachedStock = Number(variantData.stock) || 0;
      if (!Number.isInteger(cachedStock) || cachedStock < 0) {
        console.error('[REPLACE] Invalid stock value:', variantData.stock);
        await interaction.editReply({
          content: `❌ Stock inválido en caché. Ejecuta /sync-variants`
        });
        return;
      }

      if (cachedStock === 0) {
        await interaction.editReply({
          content: `❌ No hay stock en variante **${variantData.name}** para **${productData.productName}**`
        });
        return;
      }

      if (cachedStock < quantity) {
        await interaction.editReply({
          content: `❌ Stock insuficiente\n` + `Stock disponible: ${cachedStock}\n` + `Cantidad solicitada: ${quantity}`
        });
        return;
      }

      const deliverablesArray = await getVariantStock(api, productData.productId, variantData.id);

      if (deliverablesArray.length === 0) {
        await interaction.editReply({
          content: `❌ No hay items en stock. Ejecuta /sync-variants para actualizar.`
        });
        return;
      }

      if (deliverablesArray.length < quantity) {
        const discrepancy = cachedStock - deliverablesArray.length;
        console.warn(`[STOCK MISMATCH] Cache: ${cachedStock}, API: ${deliverablesArray.length}, Diff: ${discrepancy}`);
        await interaction.editReply({
          content:
            `❌ Stock insuficiente.\n` +
            `Cache dice: ${cachedStock}\n` +
            `API real: ${deliverablesArray.length}\n` +
            `Ejecuta /sync-variants para sincronizar.`
        });
        return;
      }

      // VERIFICAR SI NECESITA CONFIRMACIÓN (quantity > 5)
      // Verificar si el usuario es owner (no necesita confirmación)
      const { GuildConfig: GuildConfigCheck } = await import('../utils/GuildConfig.js');
      const guildConfigCheck = GuildConfigCheck.getConfig(interaction.guild.id);
      const adminRoleId = guildConfigCheck?.adminRoleId || config.BOT_ADMIN_ROLE_ID;
      const isOwner = adminRoleId && interaction.member.roles.cache.has(adminRoleId);
      
      if (quantity > 5 && !isOwner) {
        // Crear orden pendiente
        const orderId = PendingOrders.createPendingOrder(
          userId,
          interaction.user.username,
          productData.productId,
          productData.productName,
          variantData.id,
          variantData.name,
          quantity,
          interaction.id
        );

        // Enviar mensaje privado al usuario
        try {
          const dmChannel = await interaction.user.createDM();
          await dmChannel.send({
            content: `⏳ **Waiting for the owners to confirm the order.**\n\n` +
              `**Order ID:** ${orderId}\n` +
              `**Product:** ${productData.productName}\n` +
              `**Variant:** ${variantData.name}\n` +
              `**Quantity:** ${quantity}\n\n` +
              `Los owners revisarán tu orden y la confirmarán.`
          });
        } catch (dmError) {
          console.error('[REPLACE] Error sending DM:', dmError);
        }

        // Responder en el canal (público)
        await interaction.editReply({
          content: `⏳ **Orden pendiente de confirmación**\n\n` +
            `Tu orden de **${quantity}** items de **${productData.productName} - ${variantData.name}** está esperando confirmación de los owners.\n` +
            `**Order ID:** ${orderId}\n\n` +
            `Recibirás un mensaje privado cuando sea confirmada.`
        });
        return;
      }

      // Remove items
      const itemsCopy = [...deliverablesArray];
      const removedItems = itemsCopy.splice(0, quantity);
      const newDeliverablesString = itemsCopy.join('\n');
      const remainingStock = itemsCopy.length;

      if (removedItems.length !== quantity) {
        await interaction.editReply({
          content: `❌ Error: No se extrajeron los items correctamente`
        });
        return;
      }

      // Update API
      let apiUpdateSuccess = false;
      try {
        await api.put(
          `shops/${api.shopId}/products/${productData.productId}/deliverables/overwrite/${variantData.id}`,
          { deliverables: newDeliverablesString }
        );
        console.log(`[REPLACE] API updated for ${productData.productId}/${variantData.id}`);
        apiUpdateSuccess = true;
      } catch (putError) {
        console.error(`[REPLACE] API PUT failed: ${putError.message}`);
        ErrorLog.log('replace', putError, {
          stage: 'API_UPDATE',
          productId: productData.productId,
          variantId: variantData.id,
          quantity,
          userId: interaction.user.id,
          userName: interaction.user.username,
          endpoint: `shops/${api.shopId}/products/${productData.productId}/deliverables/overwrite/${variantData.id}`
        });
        await interaction.editReply({
          content: `❌ Error actualizando stock en API: ${putError.message}`
        });
        return;
      }

      // Update cache
      let cacheUpdateSuccess = false;
      try {
        variantsData[productData.productId.toString()].variants[variantData.id.toString()].stock = remainingStock;
        writeFileSync(variantsDataPath, JSON.stringify(variantsData, null, 2));
        console.log(
          `[REPLACE] Cache updated: ${productData.productId}/${variantData.id} - New stock: ${remainingStock}`
        );
        cacheUpdateSuccess = true;
      } catch (cacheError) {
        console.error(`[REPLACE] Cache update error: ${cacheError.message}`);
        ErrorLog.log('replace', cacheError, {
          stage: 'CACHE_UPDATE',
          productId: productData.productId,
          variantId: variantData.id,
          newStock: remainingStock,
          userId: interaction.user.id,
          userName: interaction.user.username,
          errorDetail: 'Failed to update variantsData.json'
        });
      }

      // Add to history
      try {
        addToHistory(productData.productId, productData.productName, removedItems, variantData.id, variantData.name);
      } catch (historyError) {
        console.error(`[REPLACE] History error: ${historyError.message}`);
        ErrorLog.log('replace', historyError, {
          stage: 'HISTORY_ADD',
          productId: productData.productId,
          variantId: variantData.id,
          userId: interaction.user.id,
          userName: interaction.user.username
        });
      }

      // Create response embed - Show ALL items with multiple fields if needed
      const embed = new EmbedBuilder().setColor(0x00aa00).setTitle(`✅ Items Extraídos (${removedItems.length})`);

      const fields = [
        { name: '🏪 Producto', value: productData.productName, inline: true },
        { name: '🎮 Variante', value: variantData.name, inline: true },
        { name: '📦 Cantidad', value: quantity.toString(), inline: true },
        { name: '📊 Stock Restante', value: remainingStock.toString(), inline: true }
      ];

      // Split items into multiple fields if needed (Discord limit: 1024 chars per field)
      let currentField = '';
      let fieldNumber = 1;
      
      for (let i = 0; i < removedItems.length; i++) {
        const itemLine = `${i + 1}. ${removedItems[i].substring(0, 100)}\n`;
        
        // If adding this line would exceed 1024 chars, start a new field
        if ((currentField + itemLine).length > 1024 && currentField.length > 0) {
          fields.push({
            name: `📋 Items - Parte ${fieldNumber}`,
            value: currentField,
            inline: false
          });
          currentField = itemLine;
          fieldNumber++;
        } else {
          currentField += itemLine;
        }
      }
      
      // Add final field with remaining items
      if (currentField.length > 0) {
        if (fieldNumber === 1) {
          fields.push({
            name: `📋 Items Extraídos (${removedItems.length} Total)`,
            value: currentField,
            inline: false
          });
        } else {
          fields.push({
            name: `📋 Items - Parte ${fieldNumber}`,
            value: currentField,
            inline: false
          });
        }
      }

      embed.addFields(fields);
      await interaction.editReply({ embeds: [embed] });

      // Verificar si estamos en un ticket y renombrarlo automáticamente
      const { TicketManager } = await import('../utils/TicketManager.js');
      const ticket = TicketManager.getTicketByChannel(interaction.channel.id);
      
      if (ticket) {
        try {
          const ticketId = ticket.id;
          const newName = `✅-done-${ticketId.toLowerCase()}`;
          await interaction.channel.setName(newName);
          console.log(`[REPLACE] Ticket ${ticketId} renombrado automáticamente a "${newName}"`);
        } catch (renameError) {
          console.error('[REPLACE] Error al renombrar ticket:', renameError);
        }
      }

      // Sugerir hacer vouch después de un replace exitoso
      const { GuildConfig } = await import('../utils/GuildConfig.js');
      const guildConfig = GuildConfig.getConfig(interaction.guild.id);
      const vouchesChannelId = guildConfig?.vouchesChannelId;
      
      if (vouchesChannelId) {
        try {
          const vouchesChannel = interaction.guild.channels.cache.get(vouchesChannelId);
          if (vouchesChannel) {
            const vouchSuggestion = new EmbedBuilder()
              .setColor(0x5865F2)
              .setTitle('💬 Help Us Grow!')
              .setDescription(`Thank you for using our service! If you're satisfied with your purchase, please consider leaving a vouch to help us grow.`)
              .addFields({
                name: '⭐ How to Leave a Vouch',
                value: `Use the \`/vouch\` command in ${vouchesChannel} to share your experience!\n\n**What to include:**\n• Your experience with the service\n• Rating (1-5 stars)\n• Optional proof screenshot\n\nYour feedback helps us improve and helps other customers make informed decisions.`,
                inline: false
              })
              .setFooter({ text: 'Thank you for your support!' })
              .setTimestamp();
            
            await interaction.followUp({ embeds: [vouchSuggestion], ephemeral: true });
          }
        } catch (vouchError) {
          console.error('[REPLACE] Error sending vouch suggestion:', vouchError);
        }
      }

      // Log success
      console.log(
        `[REPLACE] ✅ SUCCESS: ${quantity} items removed from ${productData.productName} - ${variantData.name}`
      );
    } catch (error) {
      console.error('[REPLACE] Outer error:', error);
      ErrorLog.log('replace', error, {
        stage: 'OUTER_EXCEPTION',
        productInput,
        variantInput,
        quantity,
        userId: interaction.user.id,
        userName: interaction.user.username
      });
      try {
        await interaction.editReply({
          content: `❌ Error: ${error.message}`
        });
      } catch (e) {
        console.error('[REPLACE] Could not send error message:', e.message);
        ErrorLog.log('replace', e, {
          stage: 'REPLY_FAILURE',
          userId: interaction.user.id,
          userName: interaction.user.username
        });
      }
    }
  }
};
