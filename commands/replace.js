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
    
    // Try multiple parsing methods to handle different API response formats
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
      // Last resort: convert object values to array
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
    const focusedOption = interaction.options.getFocused(true);
    
    if (focusedOption.name === 'product') {
      try {
        const products = await api.get(`shops/${api.shopId}/products`);
        const productList = Array.isArray(products) ? products : (products?.data || []);
        
        const filtered = productList
          .filter(p => p.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
          .slice(0, 25);

        await interaction.respond(
          filtered.map(p => ({ name: p.name, value: p.id.toString() }))
        );
      } catch (e) {
        await interaction.respond([]);
      }
    } 
    else if (focusedOption.name === 'variant') {
      const productInput = interaction.options.getString('product');
      
      if (!productInput) {
        await interaction.respond([]);
        return;
      }

      const variantsData = loadVariantsData();
      const productData = Object.values(variantsData).find(p => 
        p.productId.toString() === productInput
      );

      if (!productData || !productData.variants) {
        await interaction.respond([]);
        return;
      }

      const variants = Object.values(productData.variants)
        .map(v => ({
          name: `${v.name} (${v.stock})`,
          value: v.id.toString()
        }))
        .slice(0, 25);

      await interaction.respond(variants);
    }
  },

  async execute(interaction, api) {
    const productInput = interaction.options.getString('product');
    const quantity = interaction.options.getInteger('quantity');
    const variantInput = interaction.options.getString('variant');
    const visibility = interaction.options.getString('visibility') || 'private';
    const isPrivate = visibility === 'private';

    try {
      await interaction.deferReply({ ephemeral: isPrivate });

      const products = await api.get(`shops/${api.shopId}/products`);
      const productList = Array.isArray(products) ? products : (products?.data || []);
      
      let product = productList.find(p => p.id.toString() === productInput);

      if (!product) {
        await interaction.editReply({ 
          content: `❌ Producto no encontrado: ${productInput}` 
        });
        return;
      }

      const variant = product.variants?.find(v => v.id.toString() === variantInput);
      if (!variant) {
        await interaction.editReply({ 
          content: `❌ Variante no encontrada` 
        });
        return;
      }

      const variantsData = loadVariantsData();
      const cachedProduct = variantsData[product.id.toString()];
      const cachedVariant = cachedProduct?.variants[variant.id.toString()];
      const cachedStock = cachedVariant?.stock || 0;

      if (cachedStock === 0) {
        await interaction.editReply({ 
          content: `❌ No hay stock en variante **${variant.name}** para **${product.name}**`
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

      const deliverablesArray = await getVariantStock(api, product.id, variant.id);

      // Validate we have enough items
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

      // Safely remove items and prepare new data
      const removedItems = deliverablesArray.splice(0, quantity);
      const newDeliverablesString = deliverablesArray.join('\n');
      const remainingStock = deliverablesArray.length;

      // Validate items were actually removed (double-check)
      if (removedItems.length !== quantity) {
        console.error(`[REMOVE ERROR] Expected ${quantity} items, got ${removedItems.length}`);
        await interaction.editReply({ 
          content: `❌ Error crítico: No se pudieron remover todos los items.` 
        });
        return;
      }

      // Try to update in API
      try {
        console.log(`[REPLACE] Updating ${product.id}/${variant.id}: Removing ${quantity} items, ${remainingStock} remaining`);
        await api.put(
          `shops/${api.shopId}/products/${product.id}/deliverables/overwrite/${variant.id}`,
          { deliverables: newDeliverablesString }
        );
      } catch (updateError) {
        console.error(`[REPLACE ERROR] API PUT failed: ${updateError.message}`);
        await interaction.editReply({ 
          content: `❌ Error guardando cambios en la API.\n` +
                   `Stock NO fue modificado. Intenta de nuevo.`
        });
        return;
      }

      // Update cache ONLY after successful API update
      try {
        const variantsData = loadVariantsData();
        if (variantsData[product.id.toString()]?.variants[variant.id.toString()]) {
          variantsData[product.id.toString()].variants[variant.id.toString()].stock = remainingStock;
          writeFileSync(variantsDataPath, JSON.stringify(variantsData, null, 2));
          console.log(`[CACHE] Updated: ${product.id}/${variant.id} - New stock: ${remainingStock}`);
        }
      } catch (cacheError) {
        console.error(`[CACHE ERROR] ${cacheError.message}`);
        // Cache error doesn't fail the operation since API was updated
      }

      addToHistory(product.id, product.name, removedItems, variant.id, variant.name);

      // Build items list - split into multiple fields if too long
      const embeds = [];
      const mainEmbed = new EmbedBuilder()
        .setColor(0x00AA00)
        .setTitle('✅ REPLACE COMPLETADO')
        .setDescription(`Stock removido exitosamente`)
        .addFields(
          { name: '📦 Producto', value: product.name, inline: false },
          { name: '🎮 Variante', value: variant.name, inline: false },
          { name: '📊 Items Removidos', value: quantity.toString(), inline: true },
          { name: '📈 Stock Restante', value: deliverablesArray.length.toString(), inline: true }
        )
        .setFooter({ text: `Timestamp: ${new Date().toLocaleTimeString()}` });

      // Add all items to embed, potentially split across multiple embeds
      let currentItemsList = '';
      let itemsEmbeds = [];
      
      for (let i = 0; i < removedItems.length; i++) {
        const line = `${i + 1}. ${removedItems[i]}\n`;
        
        if (currentItemsList.length + line.length < 1020) {
          currentItemsList += line;
        } else {
          // Save current embed and start new one
          if (currentItemsList) {
            itemsEmbeds.push(currentItemsList);
          }
          currentItemsList = line;
        }
      }
      
      // Add last chunk
      if (currentItemsList) {
        itemsEmbeds.push(currentItemsList);
      }

      // Add items to main embed or create additional embeds
      if (itemsEmbeds.length === 1) {
        mainEmbed.addFields({ name: '📋 Items', value: itemsEmbeds[0], inline: false });
        embeds.push(mainEmbed);
      } else if (itemsEmbeds.length > 1) {
        mainEmbed.addFields({ name: '📋 Items (Part 1)', value: itemsEmbeds[0], inline: false });
        embeds.push(mainEmbed);
        
        for (let i = 1; i < itemsEmbeds.length; i++) {
          const partEmbed = new EmbedBuilder()
            .setColor(0x00AA00)
            .addFields({ name: `📋 Items (Part ${i + 1})`, value: itemsEmbeds[i], inline: false })
            .setFooter({ text: `Timestamp: ${new Date().toLocaleTimeString()}` });
          embeds.push(partEmbed);
        }
      } else {
        mainEmbed.addFields({ name: '📋 Items', value: 'Sin items', inline: false });
        embeds.push(mainEmbed);
      }

      await interaction.editReply({ embeds: embeds });

    } catch (error) {
      await interaction.editReply({ 
        content: `❌ Error: ${error.message}` 
      });
    }
  }
};
