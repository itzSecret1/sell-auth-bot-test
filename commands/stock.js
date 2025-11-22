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
    console.log(`[STOCK] === FETCHING ITEMS ===`);
    console.log(`[STOCK] Product: ${productId}, Variant: ${variantId}`);
    
    let allItems = [];
    let page = 1;
    let hasMore = true;
    let maxPages = 100;

    while (hasMore && page <= maxPages) {
      try {
        // Correct API call with query parameters for pagination
        const endpoint = `shops/${api.shopId}/products/${productId}/deliverables/${variantId}`;
        const response = await api.get(endpoint, { page, perPage: 100 });
        
        console.log(`[STOCK] Page ${page} - Response type: ${typeof response}`);
        
        let pageItems = [];
        
        // Parse Laravel pagination response structure
        if (response?.data && Array.isArray(response.data)) {
          // Standard Laravel pagination: { data: [...], total, page, ... }
          pageItems = response.data;
          console.log(`[STOCK] Page ${page}: Parsed from response.data array`);
        } else if (Array.isArray(response)) {
          // Direct array response
          pageItems = response;
          console.log(`[STOCK] Page ${page}: Direct array response`);
        } else if (typeof response === 'string') {
          // String with newlines (fallback)
          pageItems = response
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
          console.log(`[STOCK] Page ${page}: Parsed from string with newlines`);
        }

        if (pageItems.length === 0) {
          hasMore = false;
          console.log(`[STOCK] Page ${page}: No more items`);
        } else {
          // Filter out non-string items and ensure they're actual deliverables
          const validItems = pageItems
            .map(item => {
              if (typeof item === 'string') return item.trim();
              if (typeof item === 'object' && item?.value) return String(item.value).trim();
              if (typeof item === 'object' && item?.deliverable) return String(item.deliverable).trim();
              return null;
            })
            .filter(item => item && item.length > 0);

          allItems = allItems.concat(validItems);
          console.log(`[STOCK] Page ${page}: +${validItems.length} valid items (total: ${allItems.length})`);
          
          // Check if there are more pages
          if (response?.next_page_url || pageItems.length === 100) {
            page++;
          } else {
            hasMore = false;
          }
        }
      } catch (e) {
        console.error(`[STOCK] Page ${page} error:`, e.message);
        hasMore = false;
      }
    }

    console.log(`[STOCK] === FINAL RESULT: ${allItems.length} items ===`);
    if (allItems.length > 0) {
      console.log(`[STOCK] First item sample:`, allItems[0].substring(0, 100));
    }
    
    return allItems;
  } catch (e) {
    console.error(`[STOCK] ❌ Error fetching items for ${productId}/${variantId}:`, e.message);
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
    try {
      // Quick response to prevent timeout
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
      }

      const productInput = interaction.options.getString('product');
      const variantInput = interaction.options.getString('variant');

      const variantsData = loadVariantsData();

      // Case 1: No parameters - show ALL stock
      if (!productInput && !variantInput) {
        const embeds = [];
        
        Object.entries(variantsData).forEach(([productId, productData]) => {
          const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`📦 ${productData.productName}`);

          const variants = Object.values(productData.variants || {});
          let description = '';
          
          for (const v of variants) {
            const line = `• **${v.name}**: ${v.stock} items\n`;
            // Discord field limit: 1024 chars
            if ((description + line).length <= 1024) {
              description += line;
            } else {
              break;
            }
          }

          embed.setDescription(description || 'No variants');
          embeds.push(embed);
        });

        if (embeds.length === 0) {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
              content: `❌ No hay datos de stock. Ejecuta /sync-variants primero.`
            }).catch(() => {});
          } else {
            await interaction.reply({
              content: `❌ No hay datos de stock. Ejecuta /sync-variants primero.`,
              ephemeral: true
            }).catch(() => {});
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

      // Case 2: Product specified but not variant - show all variants of that product
      if (productInput && !variantInput) {
        const productData = Object.values(variantsData).find(p => 
          p.productId.toString() === productInput
        );

        if (!productData) {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
              content: `❌ Producto no encontrado.`
            }).catch(() => {});
          } else {
            await interaction.reply({
              content: `❌ Producto no encontrado.`,
              ephemeral: true
            }).catch(() => {});
          }
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle(`📦 Stock: ${productData.productName}`);

        const variants = Object.values(productData.variants || {});
        let description = '';
        
        for (const v of variants) {
          const line = `• **${v.name}**: ${v.stock} items\n`;
          if ((description + line).length <= 1024) {
            description += line;
          } else {
            break;
          }
        }

        embed.setDescription(description || 'No hay variantes');

        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ embeds: [embed] }).catch(() => {});
        } else {
          await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
        }
        return;
      }

      // Case 3: Both product and variant specified - show REAL items
      if (productInput && variantInput) {
        const productData = Object.values(variantsData).find(p => 
          p.productId.toString() === productInput
        );

        if (!productData) {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
              content: `❌ Producto no encontrado.`
            }).catch(() => {});
          } else {
            await interaction.reply({
              content: `❌ Producto no encontrado.`,
              ephemeral: true
            }).catch(() => {});
          }
          return;
        }

        const variant = productData.variants?.[variantInput];

        if (!variant) {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
              content: `❌ Variante no encontrada.`
            }).catch(() => {});
          } else {
            await interaction.reply({
              content: `❌ Variante no encontrada.`,
              ephemeral: true
            }).catch(() => {});
          }
          return;
        }

        // Fetch REAL items from API with proper pagination
        console.log(`[STOCK] User requested items for ${productData.productName} → ${variant.name}`);
        const realItems = await getVariantRealItems(api, productData.productId, variantInput);
        
        const embed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle(`📦 Stock: ${variant.name}`);

        // Build fields safely without exceeding 1024 char limit
        const fields = [
          { name: '🏪 Producto', value: productData.productName.substring(0, 1024), inline: false },
          { name: '🎮 Variante', value: variant.name.substring(0, 1024), inline: false },
          { name: '📊 Stock en Caché', value: variant.stock.toString().substring(0, 1024), inline: false },
          { name: '🔍 Stock Real (Items)', value: realItems.length.toString().substring(0, 1024), inline: false }
        ];

        // Add items if any - TRUNCATE TO 1024 CHARS MAX
        if (realItems.length > 0) {
          let itemsText = '';
          let itemCount = 0;
          
          // Build items string respecting 1024 char limit
          for (let i = 0; i < realItems.length; i++) {
            const itemLine = `${i + 1}. ${realItems[i]}\n`;
            if ((itemsText + itemLine).length <= 1000) {
              itemsText += itemLine;
              itemCount++;
            } else {
              break;
            }
          }

          if (realItems.length > itemCount) {
            itemsText += `\n... y ${realItems.length - itemCount} items más`;
          }

          fields.push({
            name: '📋 Items',
            value: itemsText.substring(0, 1024),
            inline: false
          });
        } else {
          fields.push({
            name: '📋 Items',
            value: '❌ No hay items disponibles',
            inline: false
          });
        }

        // Add discrepancy warning if needed
        if (realItems.length !== variant.stock) {
          embed.setColor(0xFF6600);
          fields.push({
            name: '⚠️ DISCREPANCIA DETECTADA',
            value: `Caché: ${variant.stock} vs Real: ${realItems.length}. Ejecuta /sync-variants para actualizar.`.substring(0, 1024),
            inline: false
          });
        }

        // Add fields (max 25 fields per embed)
        if (fields.length > 25) {
          fields.length = 25;
        }
        embed.addFields(fields);

        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ embeds: [embed] }).catch((e) => {
            console.error('[STOCK] EditReply error:', e.message);
          });
        } else {
          await interaction.reply({ embeds: [embed], ephemeral: true }).catch((e) => {
            console.error('[STOCK] Reply error:', e.message);
          });
        }
        return;
      }

    } catch (error) {
      console.error('[STOCK] Error:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ 
          content: `❌ Error: ${error.message}` 
        }).catch(() => {});
      } else {
        await interaction.reply({
          content: `❌ Error: ${error.message}`,
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
};
