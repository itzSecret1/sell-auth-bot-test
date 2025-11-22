import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { loadVariantsData } from '../utils/dataLoader.js';
import { parseDeliverables } from '../utils/parseDeliverables.js';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';

async function getVariantRealItems(api, productId, variantId) {
  if (!productId || !variantId) {
    console.error('[STOCK] Missing productId or variantId');
    return [];
  }

  try {
    console.log(`[STOCK] Fetching items for product ${productId}, variant ${variantId}`);

    const endpoint = `shops/${api.shopId}/products/${productId}/deliverables/${variantId}`;
    const response = await api.get(endpoint);
    const items = parseDeliverables(response);

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
    .addStringOption((option) =>
      option.setName('product').setDescription('Product name or ID (optional)').setRequired(false).setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName('variant')
        .setDescription('Variant name or ID (optional, requires product)')
        .setRequired(false)
        .setAutocomplete(true)
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
            .map((p) => ({ name: p.productName, id: p.productId }))
            .filter((p) => p.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
            .slice(0, 25);

          await interaction.respond(products.map((p) => ({ name: p.name, value: p.id.toString() })));
          responded = true;
        } else if (focusedOption.name === 'variant') {
          const productInput = interaction.options.getString('product');
          if (!productInput) {
            await interaction.respond([]);
            return;
          }

          const variantsData = loadVariantsData();
          const productData = Object.values(variantsData).find((p) => p.productId.toString() === productInput);

          if (!productData?.variants) {
            await interaction.respond([]);
            return;
          }

          const variants = Object.values(productData.variants)
            .map((v) => ({ name: `${v.name} (${v.stock})`, value: v.id.toString() }))
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
    const startTime = Date.now();
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
          const embed = new EmbedBuilder().setColor(0x0099ff).setTitle(`📦 ${productData.productName}`);

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
        
        const executionTime = Date.now() - startTime;
        await AdvancedCommandLogger.logCommand(interaction, 'stock', {
          status: 'EXECUTED',
          result: `Showed ${embeds.length} products`,
          executionTime,
          metadata: {
            'Products': embeds.length,
            'Mode': 'All products',
            'Filter': 'None'
          }
        });
        return;
      }

      // Case 2: Product only
      if (productInput && !variantInput) {
        const productData = Object.values(variantsData).find((p) => p.productId.toString() === productInput);

        if (!productData) {
          const msg = `❌ Producto no encontrado.`;
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: msg }).catch(() => {});
          } else {
            await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
          }
          return;
        }

        const embed = new EmbedBuilder().setColor(0x0099ff).setTitle(`📦 ${productData.productName}`);

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
        
        const executionTime = Date.now() - startTime;
        await AdvancedCommandLogger.logCommand(interaction, 'stock', {
          status: 'EXECUTED',
          result: `Showed ${productData.productName}`,
          executionTime,
          metadata: {
            'Product': productData.productName,
            'Product ID': productData.productId,
            'Variants': Object.keys(productData.variants || {}).length
          }
        });
        return;
      }

      // Case 3: Product + Variant
      if (productInput && variantInput) {
        const productData = Object.values(variantsData).find((p) => p.productId.toString() === productInput);

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

        const embed = new EmbedBuilder().setColor(0x0099ff).setTitle(`📦 ${variant.name}`);

        // Build items text
        let itemsText = '';
        if (realItems.length > 0) {
          for (let i = 0; i < Math.min(realItems.length, 20); i++) {
            const item = realItems[i];
            const itemLine = typeof item === 'string' ? item : JSON.stringify(item);
            itemsText += `${i + 1}. ${itemLine.substring(0, 100)}\n`;
          }
          if (realItems.length > 20) {
            itemsText += `\n✅ ... y ${realItems.length - 20} items más`;
          }
        } else {
          itemsText = `No se encontraron items. Disponibles: ${variant.stock}`;
        }

        // Add fields
        embed.addFields([
          { name: '🏪 Producto', value: productData.productName.substring(0, 1024), inline: false },
          { name: '🎮 Variante', value: variant.name.substring(0, 1024), inline: false },
          { name: '📊 Stock Total', value: `${variant.stock} items disponibles`, inline: false },
          { name: `📋 Credenciales (${realItems.length})`, value: itemsText.substring(0, 1024), inline: false }
        ]);

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
