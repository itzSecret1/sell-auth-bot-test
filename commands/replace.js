import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const historyFilePath = join(process.cwd(), 'replaceHistory.json');
const variantsDataPath = join(process.cwd(), 'variantsData.json');

let historyData = [];

if (existsSync(historyFilePath)) {
  historyData = JSON.parse(readFileSync(historyFilePath, 'utf-8'));
}

function saveHistory() {
  writeFileSync(historyFilePath, JSON.stringify(historyData, null, 2));
}

function loadVariantsData() {
  if (existsSync(variantsDataPath)) {
    try {
      return JSON.parse(readFileSync(variantsDataPath, 'utf-8'));
    } catch (e) {
      return {};
    }
  }
  return {};
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
  try {
    const deliverablesData = await api.get(
      `shops/${api.shopId}/products/${productId}/deliverables/${variantId}`
    );
    
    let items = [];
    
    if (typeof deliverablesData === 'string') {
      items = deliverablesData.split('\n').filter(item => item.trim());
    } else if (deliverablesData?.deliverables && typeof deliverablesData.deliverables === 'string') {
      items = deliverablesData.deliverables.split('\n').filter(item => item.trim());
    } else if (deliverablesData?.content && typeof deliverablesData.content === 'string') {
      items = deliverablesData.content.split('\n').filter(item => item.trim());
    } else if (deliverablesData?.data && typeof deliverablesData.data === 'string') {
      items = deliverablesData.data.split('\n').filter(item => item.trim());
    } else if (Array.isArray(deliverablesData)) {
      items = deliverablesData.map(item => {
        if (typeof item === 'string') return item.trim();
        if (typeof item === 'object' && item?.value) return item.value;
        return String(item).trim();
      }).filter(item => item);
    } else if (deliverablesData?.items && Array.isArray(deliverablesData.items)) {
      items = deliverablesData.items.map(item => {
        if (typeof item === 'string') return item.trim();
        if (typeof item === 'object' && item?.value) return item.value;
        return String(item).trim();
      }).filter(item => item);
    } else if (typeof deliverablesData === 'object' && deliverablesData !== null) {
      items = Object.values(deliverablesData).map(val => String(val).trim()).filter(item => item);
    }
    
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
    .addStringOption(option => 
      option.setName('product')
        .setDescription('Product name or ID')
        .setRequired(true)
        .setAutocomplete(true))
    .addIntegerOption(option => 
      option.setName('quantity')
        .setDescription('Number of items to take from stock')
        .setRequired(true)
        .setMinValue(1))
    .addStringOption(option => 
      option.setName('variant')
        .setDescription('Select variant')
        .setRequired(true)
        .setAutocomplete(true))
    .addStringOption(option =>
      option.setName('visibility')
        .setDescription('Who can see the result?')
        .setRequired(false)
        .addChoices(
          { name: '🔒 Only me (private)', value: 'private' },
          { name: '👥 Everyone (public)', value: 'public' }
        )),

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
            .map(p => ({ 
              name: p.productName, 
              id: p.productId 
            }))
            .filter(p => p.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
            .slice(0, 25);

          await interaction.respond(
            products.map(p => ({ name: p.name, value: p.id.toString() }))
          );
          responded = true;
        } 
        else if (focusedOption.name === 'variant') {
          const productInput = interaction.options.getString('product');
          
          if (!productInput) {
            await interaction.respond([]);
            responded = true;
            return;
          }

          const variantsData = loadVariantsData();
          const productData = Object.values(variantsData).find(p => 
            p.productId.toString() === productInput
          );

          if (!productData || !productData.variants) {
            await interaction.respond([]);
            responded = true;
            return;
          }

          const variants = Object.values(productData.variants)
            .map(v => ({
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

    try {
      try {
        await interaction.deferReply({ ephemeral: isPrivate });
      } catch (deferError) {
        console.error(`[REPLACE] Defer error: ${deferError.message}`);
        return;
      }

      // Load data from cache
      const variantsData = loadVariantsData();
      
      // Find product by ID in cache
      const productData = variantsData[productInput];
      if (!productData) {
        await interaction.editReply({ 
          content: `❌ Producto no encontrado: ${productInput}` 
        });
        return;
      }

      // Find variant by ID
      const variantData = productData.variants[variantInput];
      if (!variantData) {
        await interaction.editReply({ 
          content: `❌ Variante no encontrada` 
        });
        return;
      }

      const cachedStock = variantData.stock || 0;

      if (cachedStock === 0) {
        await interaction.editReply({ 
          content: `❌ No hay stock en variante **${variantData.name}** para **${productData.productName}**`
        });
        return;
      }

      if (cachedStock < quantity) {
        await interaction.editReply({ 
          content: `❌ Stock insuficiente\n` +
                   `Stock disponible: ${cachedStock}\n` +
                   `Cantidad solicitada: ${quantity}`
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
          content: `❌ Stock insuficiente.\n` +
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
      try {
        await api.put(
          `shops/${api.shopId}/products/${productData.productId}/deliverables/overwrite/${variantData.id}`,
          { deliverables: newDeliverablesString }
        );
        console.log(`[REPLACE] API updated for ${productData.productId}/${variantData.id}`);
      } catch (putError) {
        console.error(`[REPLACE] API PUT failed: ${putError.message}`);
        await interaction.editReply({ 
          content: `❌ Error actualizando stock en API: ${putError.message}` 
        });
        return;
      }

      // Update cache
      try {
        variantsData[productData.productId.toString()].variants[variantData.id.toString()].stock = remainingStock;
        writeFileSync(variantsDataPath, JSON.stringify(variantsData, null, 2));
        console.log(`[REPLACE] Cache updated: ${productData.productId}/${variantData.id} - New stock: ${remainingStock}`);
      } catch (cacheError) {
        console.error(`[REPLACE] Cache update error: ${cacheError.message}`);
      }

      // Add to history
      addToHistory(productData.productId, productData.productName, removedItems, variantData.id, variantData.name);

      // Create response embed
      const embed = new EmbedBuilder()
        .setColor(0x00AA00)
        .setTitle(`✅ Items Extraídos`)
        .addField('🏪 Producto', productData.productName, true)
        .addField('🎮 Variante', variantData.name, true)
        .addField('📦 Cantidad', quantity.toString(), true)
        .addField('📊 Stock Restante', remainingStock.toString(), true);

      let itemsText = '';
      for (let i = 0; i < Math.min(removedItems.length, 5); i++) {
        itemsText += `${i + 1}. ${removedItems[i].substring(0, 80)}\n`;
      }
      if (removedItems.length > 5) {
        itemsText += `\n... y ${removedItems.length - 5} items más`;
      }

      embed.addField('📋 Items Extraídos', itemsText, false);

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('[REPLACE] Error:', error);
      try {
        await interaction.editReply({ 
          content: `❌ Error: ${error.message}` 
        });
      } catch (e) {
        console.error('[REPLACE] Could not send error message:', e.message);
      }
    }
  }
};
