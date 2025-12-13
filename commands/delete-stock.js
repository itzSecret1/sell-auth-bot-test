import { SlashCommandBuilder } from 'discord.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const variantsDataPath = join(process.cwd(), 'variantsData.json');

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
    .setName('delete-stock')
    .setDescription('Delete items from product stock')
    .addStringOption(option => 
      option.setName('product')
        .setDescription('Product name or ID')
        .setRequired(true)
        .setAutocomplete(true))
    .addStringOption(option => 
      option.setName('variant')
        .setDescription('Select variant')
        .setRequired(true)
        .setAutocomplete(true))
    .addIntegerOption(option => 
      option.setName('quantity')
        .setDescription('How many items to delete from stock')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1000)),

  onlyWhitelisted: true,
  requiredRole: 'admin',

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
    const variantInput = interaction.options.getString('variant');
    const quantity = interaction.options.getInteger('quantity');

    try {
      await interaction.deferReply({ ephemeral: true });

      // Get product
      const products = await api.get(`shops/${api.shopId}/products`);
      const productList = Array.isArray(products) ? products : (products?.data || []);
      
      let product = productList.find(p => p.id.toString() === productInput);

      if (!product) {
        await interaction.editReply({ 
          content: `❌ Producto no encontrado` 
        });
        return;
      }

      // Find variant
      const variant = product.variants?.find(v => v.id.toString() === variantInput);
      if (!variant) {
        await interaction.editReply({ 
          content: `❌ Variante no encontrada` 
        });
        return;
      }

      // Get current stock
      const currentItems = await getVariantStock(api, product.id, variant.id);

      if (currentItems.length === 0) {
        await interaction.editReply({ 
          content: `❌ No hay items en el stock para eliminar` 
        });
        return;
      }

      if (currentItems.length < quantity) {
        await interaction.editReply({ 
          content: `❌ No hay suficientes items\n` +
                   `Stock disponible: ${currentItems.length}\n` +
                   `Cantidad a eliminar: ${quantity}`
        });
        return;
      }

      // Remove items from end
      const deletedItems = currentItems.splice(-quantity);
      const newDeliverablesString = currentItems.join('\n');

      // Update
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

      // Build message respecting Discord 2000 char limit
      let message = `✅ **STOCK ELIMINADO**\n\n`;
      message += `📦 Producto: ${product.name}\n`;
      message += `🎮 Variante: ${variant.name}\n`;
      message += `➖ Items eliminados: ${quantity}\n`;
      message += `📊 Stock anterior: ${currentItems.length + deletedItems.length}\n`;
      message += `📊 Stock nuevo: ${currentItems.length}\n\n`;
      message += `**ITEMS ELIMINADOS:**\n\`\`\`\n`;

      let charCount = message.length + 10; // +10 for closing ```
      let itemsPreview = '';
      let itemsShown = 0;

      for (let i = 0; i < deletedItems.length; i++) {
        const line = `${i + 1}. ${deletedItems[i]}\n`;
        if (charCount + line.length < 1800) {
          itemsPreview += line;
          charCount += line.length;
          itemsShown++;
        } else {
          itemsPreview += `...\n[${deletedItems.length - itemsShown} items más no mostrados por límite de caracteres]`;
          break;
        }
      }

      message += itemsPreview + '```';

      await interaction.editReply({ content: message });

    } catch (error) {
      await interaction.editReply({ 
        content: `❌ Error: ${error.message}` 
      });
    }
  }
};
