import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { loadVariantsData } from '../utils/dataLoader.js';
import { parseDeliverables } from '../utils/parseDeliverables.js';
import { ErrorLog } from '../utils/errorLogger.js';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';
import { isUserTimedOut, checkRateLimit, applyTimeout, getTimeoutRemaining } from '../utils/rateLimiter.js';

const historyFilePath = join(process.cwd(), 'replaceHistory.json');
const variantsDataPath = join(process.cwd(), 'variantsData.json');

let historyData = [];

if (existsSync(historyFilePath)) {
  historyData = JSON.parse(readFileSync(historyFilePath, 'utf-8'));
}

function saveHistory() {
  writeFileSync(historyFilePath, JSON.stringify(historyData, null, 2));
}

function addToHistory(productId, productName, removedItems, variantId = null, variantName = null) {
  historyData.push({
    timestamp: new Date().toISOString(),
    productId,
    productName,
    variantId,
    variantName,
    removedItems,
    action: 'removed'
  });
  saveHistory();
}

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
    )
    .addStringOption((option) =>
      option
        .setName('visibility')
        .setDescription('Who can see the result?')
        .setRequired(false)
        .addChoices(
          { name: '🔒 Only me (private)', value: 'private' },
          { name: '👥 Everyone (public)', value: 'public' }
        )
    ),

  onlyWhitelisted: true,
  requiredRole: 'staff',

  async autocomplete(interaction, api) {
    try {
      const focusedOption = interaction.options.getFocused(true);
      let responded = false;

      try {
        if (focusedOption.name === 'product') {
          const variantsData = loadVariantsData();
          const products = Object.values(variantsData)
            .map((p) => ({
              name: p.productName,
              id: p.productId
            }))
            .filter((p) => p.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
            .slice(0, 25);

          await interaction.respond(products.map((p) => ({ name: p.name, value: p.id.toString() })));
          responded = true;
        } else if (focusedOption.name === 'variant') {
          const productInput = interaction.options.getString('product');

          if (!productInput) {
            await interaction.respond([]);
            responded = true;
            return;
          }

          const variantsData = loadVariantsData();
          const productData = Object.values(variantsData).find((p) => p.productId.toString() === productInput);

          if (!productData || !productData.variants) {
            await interaction.respond([]);
            responded = true;
            return;
          }

          const variants = Object.values(productData.variants)
            .map((v) => ({
              name: `${v.name} (${v.stock})`,
              value: v.id.toString()
            }))
            .slice(0, 25);

          await interaction.respond(variants);
          responded = true;
        }
      } catch (e) {
        if (!responded && interaction.responded === false) {
          try {
            await interaction.respond([]);
          } catch (respondError) {
            // Silent fail
          }
        }
      }
    } catch (error) {
      // Silent fail
    }
  },

  async execute(interaction, api) {
    const productInput = interaction.options.getString('product');
    const quantity = interaction.options.getInteger('quantity');
    const variantInput = interaction.options.getString('variant');
    const visibility = interaction.options.getString('visibility') || 'private';
    const isPrivate = visibility === 'private';
    const userId = interaction.user.id;
    const ownerId = process.env.BOT_USER_ID_WHITELIST?.split(',')[0]; // Owner is first in whitelist

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

      // Create response embed
      const embed = new EmbedBuilder().setColor(0x00aa00).setTitle(`✅ Items Extraídos`);

      let itemsText = '';
      for (let i = 0; i < Math.min(removedItems.length, 5); i++) {
        itemsText += `${i + 1}. ${removedItems[i].substring(0, 80)}\n`;
      }
      if (removedItems.length > 5) {
        itemsText += `\n... y ${removedItems.length - 5} items más`;
      }

      embed.addFields([
        { name: '🏪 Producto', value: productData.productName, inline: true },
        { name: '🎮 Variante', value: variantData.name, inline: true },
        { name: '📦 Cantidad', value: quantity.toString(), inline: true },
        { name: '📊 Stock Restante', value: remainingStock.toString(), inline: true },
        { name: '📋 Items Extraídos', value: itemsText, inline: false }
      ]);

      await interaction.editReply({ embeds: [embed] });

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