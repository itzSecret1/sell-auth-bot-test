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

export default {
  data: new SlashCommandBuilder()
    .setName('stock')
    .setDescription('Check stock of products')
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
      await interaction.deferReply({ ephemeral: true });

      const productInput = interaction.options.getString('product');
      const variantInput = interaction.options.getString('variant');

      const variantsData = loadVariantsData();

      // Case 1: No parameters - show ALL stock
      if (!productInput && !variantInput) {
        const embeds = [];
        
        // Group by product
        Object.entries(variantsData).forEach(([productId, productData]) => {
          const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`📦 ${productData.productName}`);

          const variantsList = Object.values(productData.variants || {})
            .map(v => `• **${v.name}**: ${v.stock} items`)
            .join('\n');

          if (variantsList) {
            embed.setDescription(variantsList || 'No variants');
          } else {
            embed.setDescription('No variants');
          }

          embeds.push(embed);
        });

        if (embeds.length === 0) {
          await interaction.editReply({
            content: `❌ No hay datos de stock. Ejecuta /sync-variants primero.`
          });
          return;
        }

        // Send up to 10 embeds (Discord limit)
        const firstBatch = embeds.slice(0, 10);
        await interaction.editReply({ embeds: firstBatch });

        // If more than 10 products, send the rest in follow-up messages
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
          await interaction.editReply({
            content: `❌ Producto no encontrado.`
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle(`📦 Stock: ${productData.productName}`);

        const variantsList = Object.values(productData.variants || {})
          .map(v => `• **${v.name}**: ${v.stock} items`)
          .join('\n');

        embed.setDescription(variantsList || 'No hay variantes');

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Case 3: Both product and variant specified
      if (productInput && variantInput) {
        const productData = Object.values(variantsData).find(p => 
          p.productId.toString() === productInput
        );

        if (!productData) {
          await interaction.editReply({
            content: `❌ Producto no encontrado.`
          });
          return;
        }

        const variant = productData.variants?.[variantInput];

        if (!variant) {
          await interaction.editReply({
            content: `❌ Variante no encontrada.`
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle(`📦 Stock Detallado`)
          .addFields(
            { name: '🏪 Producto', value: productData.productName, inline: false },
            { name: '🎮 Variante', value: variant.name, inline: false },
            { name: '📊 Stock', value: `**${variant.stock}** items`, inline: false }
          );

        await interaction.editReply({ embeds: [embed] });
        return;
      }

    } catch (error) {
      console.error('[STOCK] Error:', error);
      await interaction.editReply({ 
        content: `❌ Error: ${error.message}` 
      }).catch(() => {});
    }
  }
};
