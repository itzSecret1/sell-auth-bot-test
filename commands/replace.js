import { SlashCommandBuilder } from 'discord.js';
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
    } else if (Array.isArray(deliverablesData)) {
      items = deliverablesData.filter(item => item && item.trim?.());
    }
    
    return items;
  } catch (e) {
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

      if (deliverablesArray.length > 0) {
        if (deliverablesArray.length < quantity) {
          await interaction.editReply({ 
            content: `❌ Stock insuficiente. Disponible: ${deliverablesArray.length}`
          });
          return;
        }

        const removedItems = deliverablesArray.splice(0, quantity);
        const newDeliverablesString = deliverablesArray.join('\n');

        try {
          await api.put(
            `shops/${api.shopId}/products/${product.id}/deliverables/overwrite/${variant.id}`,
            { deliverables: newDeliverablesString }
          );
        } catch (updateError) {
          await interaction.editReply({ 
            content: `❌ Error actualizando stock: ${updateError.message}` 
          });
          return;
        }

        addToHistory(product.id, product.name, removedItems, variant.id, variant.name);

        // Format items with Discord message limit in mind
        let message = `✅ **REPLACE COMPLETADO**\n\n`;
        message += `📦 Producto: ${product.name}\n`;
        message += `🎮 Variante: ${variant.name}\n`;
        message += `📊 Items removidos: ${quantity}\n`;
        message += `📈 Stock restante: ${deliverablesArray.length}\n\n`;
        message += `**ITEMS:**\n\`\`\`\n`;

        let itemsList = '';
        let charCount = message.length + 10; // +10 for closing ```

        for (let i = 0; i < removedItems.length; i++) {
          const line = `${i + 1}. ${removedItems[i]}\n`;
          if (charCount + line.length < 1900) {
            itemsList += line;
            charCount += line.length;
          } else {
            itemsList += `... y ${removedItems.length - i} más`;
            break;
          }
        }

        message += itemsList + '```';

        await interaction.editReply({ content: message });
      } else {
        await interaction.editReply({
          content: `❌ No se pudieron obtener los items del stock en este momento. Intenta de nuevo.`
        });
      }

    } catch (error) {
      await interaction.editReply({ 
        content: `❌ Error: ${error.message}` 
      });
    }
  }
};
