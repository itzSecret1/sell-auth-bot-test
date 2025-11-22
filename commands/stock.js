import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
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

async function getVariantRealItems(api, productId, variantId) {
  try {
    console.log(`[STOCK] Fetching items for product ${productId}, variant ${variantId}`);
    
    // Try to fetch items from deliverables endpoint
    const endpoint = `shops/${api.shopId}/products/${productId}/deliverables/${variantId}`;
    const response = await api.get(endpoint);
    
    let items = [];
    
    // Parse response - handle multiple formats
    if (Array.isArray(response)) {
      items = response;
    } else if (response?.data && Array.isArray(response.data)) {
      items = response.data;
    } else if (typeof response === 'string') {
      items = response.split('\n').filter(line => line.trim());
    } else if (response?.items && Array.isArray(response.items)) {
      items = response.items;
    } else if (response?.deliverables) {
      if (Array.isArray(response.deliverables)) {
        items = response.deliverables;
      } else if (typeof response.deliverables === 'string') {
        items = response.deliverables.split('\n').filter(line => line.trim());
      }
    }

    console.log(`[STOCK] API returned ${items.length} items`);
    return items;
  } catch (e) {
    console.error(`[STOCK] Error fetching items:`, e.message);
    return [];
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('stock')
    .setDescription('Check stock of products and see real items')
    .addStringOption(option => 
      option.setName('product')
        .setDescription('Product name or ID (optional)')
        .setRequired(false)
        .setAutocomplete(true))
    .addStringOption(option => 
      option.setName('variant')
        .setDescription('Variant name or ID (optional, requires product)')
        .setRequired(false)
        .setAutocomplete(true)),

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
            .map(p => ({ name: p.productName, id: p.productId }))
            .filter(p => p.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
            .slice(0, 25);

          await interaction.respond(products.map(p => ({ name: p.name, value: p.id.toString() })));
          responded = true;
        } 
        else if (focusedOption.name === 'variant') {
          const productInput = interaction.options.getString('product');
          if (!productInput) {
            await interaction.respond([]);
            return;
          }

          const variantsData = loadVariantsData();
          const productData = Object.values(variantsData).find(p => p.productId.toString() === productInput);

          if (!productData?.variants) {
            await interaction.respond([]);
            return;
          }

          const variants = Object.values(productData.variants)
            .map(v => ({ name: `${v.name} (${v.stock})`, value: v.id.toString() }))
            .slice(0, 25);

          await interaction.respond(variants);
          responded = true;
        }
      } catch (e) {
        if (!responded) await interaction.respond([]).catch(() => {});
      }
    } catch (error) {
      // Silent fail
    }
  },

  async execute(interaction, api) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
      }

      const productInput = interaction.options.getString('product');
      const variantInput = interaction.options.getString('variant');
      const variantsData = loadVariantsData();

      // Case 1: No parameters
      if (!productInput && !variantInput) {
        const embeds = [];
        
        Object.entries(variantsData).forEach(([, productData]) => {
          const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`📦 ${productData.productName}`);

          const variants = Object.values(productData.variants || {});
          let description = '';
          
          for (const v of variants) {
            const line = `• ${v.name}: ${v.stock} items\n`;
            if ((description + line).length <= 1024) {
              description += line;
            }
          }

          embed.setDescription(description || 'No variants');
          embeds.push(embed);
        });

        if (embeds.length === 0) {
          const msg = `❌ No hay datos de stock. Ejecuta /sync-variants primero.`;
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: msg }).catch(() => {});
          } else {
            await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
          }
          return;
        }

        const firstBatch = embeds.slice(0, 10);
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ embeds: firstBatch }).catch(() => {});
        } else {
          await interaction.reply({ embeds: firstBatch, ephemeral: true }).catch(() => {});
        }

        for (let i = 10; i < embeds.length; i += 10) {
          const batch = embeds.slice(i, i + 10);
          await interaction.followUp({ embeds: batch, ephemeral: true });
        }
        return;
      }

      // Case 2: Product only
      if (productInput && !variantInput) {
        const productData = Object.values(variantsData).find(p => p.productId.toString() === productInput);

        if (!productData) {
          const msg = `❌ Producto no encontrado.`;
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: msg }).catch(() => {});
          } else {
            await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
          }
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle(`📦 ${productData.productName}`);

        const variants = Object.values(productData.variants || {});
        let description = '';
        
        for (const v of variants) {
          const line = `• ${v.name}: ${v.stock} items\n`;
          if ((description + line).length <= 1024) {
            description += line;
          }
        }

        embed.setDescription(description || 'No variants');

        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ embeds: [embed] }).catch(() => {});
        } else {
          await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
        }
        return;
      }

      // Case 3: Product + Variant
      if (productInput && variantInput) {
        const productData = Object.values(variantsData).find(p => p.productId.toString() === productInput);

        if (!productData) {
          const msg = `❌ Producto no encontrado.`;
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: msg }).catch(() => {});
          } else {
            await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
          }
          return;
        }

        const variant = productData.variants?.[variantInput];

        if (!variant) {
          const msg = `❌ Variante no encontrada.`;
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: msg }).catch(() => {});
          } else {
            await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
          }
          return;
        }

        // Fetch items
        const realItems = await getVariantRealItems(api, productData.productId, variantInput);
        
        const embed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle(`📦 ${variant.name}`);

        // Add fields
        embed.addField('🏪 Producto', productData.productName.substring(0, 1024), false);
        embed.addField('🎮 Variante', variant.name.substring(0, 1024), false);
        embed.addField('📊 Stock Total', `${variant.stock} items disponibles`, false);

        // Add items if found
        if (realItems.length > 0) {
          let itemsText = '';
          for (let i = 0; i < Math.min(realItems.length, 20); i++) {
            const item = realItems[i];
            const itemLine = typeof item === 'string' ? item : JSON.stringify(item);
            itemsText += `${i + 1}. ${itemLine.substring(0, 100)}\n`;
          }

          if (realItems.length > 20) {
            itemsText += `\n✅ ... y ${realItems.length - 20} items más`;
          }

          embed.addField(`📋 Credenciales (${realItems.length})`, itemsText.substring(0, 1024), false);
        } else {
          embed.addField('📋 Credenciales', `No se encontraron items. Disponibles: ${variant.stock}`, false);
        }

        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ embeds: [embed] }).catch(() => {});
        } else {
          await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
        }
        return;
      }

    } catch (error) {
      console.error('[STOCK] Error:', error);
      const msg = `❌ Error: ${error.message}`;
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: msg }).catch(() => {});
      } else {
        await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
      }
    }
  }
};
