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

async function getVariantStockWithDebug(api, productId, variantId, productName, variantName) {
  const debugInfo = {
    productId,
    productName,
    variantId,
    variantName,
    steps: []
  };

  try {
    debugInfo.steps.push('📍 Fetching from API endpoint: `/shops/${shopId}/products/${productId}/deliverables/${variantId}`');
    
    const deliverablesData = await api.get(
      `shops/${api.shopId}/products/${productId}/deliverables/${variantId}`
    );

    debugInfo.steps.push(`✅ API Response received`);
    debugInfo.steps.push(`📊 Response type: ${typeof deliverablesData}`);
    
    if (typeof deliverablesData === 'object' && deliverablesData !== null) {
      const keys = Object.keys(deliverablesData);
      debugInfo.steps.push(`🔑 Response keys: [${keys.join(', ')}]`);
    }

    const jsonStr = JSON.stringify(deliverablesData);
    debugInfo.steps.push(`📏 Response size: ${jsonStr.length} characters`);
    debugInfo.steps.push(`📝 Response (first 300 chars): ${jsonStr.substring(0, 300)}${jsonStr.length > 300 ? '...' : ''}`);

    let items = [];
    let parseMethod = 'UNKNOWN';

    if (typeof deliverablesData === 'string') {
      parseMethod = 'String (split by newline)';
      items = deliverablesData.split('\n').filter(item => item.trim());
      debugInfo.steps.push(`✨ Parsed as STRING - found ${items.length} items`);
    } else if (deliverablesData?.deliverables && typeof deliverablesData.deliverables === 'string') {
      parseMethod = 'deliverables property (string)';
      items = deliverablesData.deliverables.split('\n').filter(item => item.trim());
      debugInfo.steps.push(`✨ Parsed from .deliverables property - found ${items.length} items`);
    } else if (deliverablesData?.content && typeof deliverablesData.content === 'string') {
      parseMethod = 'content property (string)';
      items = deliverablesData.content.split('\n').filter(item => item.trim());
      debugInfo.steps.push(`✨ Parsed from .content property - found ${items.length} items`);
    } else if (Array.isArray(deliverablesData)) {
      parseMethod = 'Array';
      items = deliverablesData.filter(item => item && (typeof item === 'string' ? item.trim() : item));
      debugInfo.steps.push(`✨ Parsed as ARRAY - found ${items.length} items`);
    } else if (deliverablesData?.data && typeof deliverablesData.data === 'string') {
      parseMethod = 'data property (string)';
      items = deliverablesData.data.split('\n').filter(item => item.trim());
      debugInfo.steps.push(`✨ Parsed from .data property - found ${items.length} items`);
    } else if (deliverablesData?.items && Array.isArray(deliverablesData.items)) {
      parseMethod = 'items property (array)';
      items = deliverablesData.items.filter(item => item);
      debugInfo.steps.push(`✨ Parsed from .items array - found ${items.length} items`);
    } else {
      debugInfo.steps.push(`⚠️  Could not parse response - no matching format found`);
    }

    debugInfo.steps.push(`🎯 Final count: ${items.length} items`);
    debugInfo.steps.push(`📋 Parse method used: ${parseMethod}`);

    if (items.length > 0) {
      debugInfo.steps.push(`🔍 First 5 items: [${items.slice(0, 5).map(i => `"${i}"`).join(', ')}]`);
    }

    debugInfo.items = items;
    debugInfo.itemCount = items.length;

  } catch (e) {
    debugInfo.steps.push(`❌ ERROR: ${e.message}`);
    debugInfo.error = e.message;
  }

  return debugInfo;
}

export default {
  data: new SlashCommandBuilder()
    .setName('replace-test')
    .setDescription('[DEBUG] Test replace - shows all debug info')
    .addStringOption(option => 
      option.setName('product')
        .setDescription('Product name or ID')
        .setRequired(true)
        .setAutocomplete(true))
    .addStringOption(option => 
      option.setName('variant')
        .setDescription('Select variant')
        .setRequired(true)
        .setAutocomplete(true)),

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
    const variantInput = interaction.options.getString('variant');

    try {
      await interaction.deferReply({ ephemeral: true });

      const products = await api.get(`shops/${api.shopId}/products`);
      const productList = Array.isArray(products) ? products : (products?.data || []);
      
      let product = productList.find(p => p.id.toString() === productInput);

      if (!product) {
        await interaction.editReply({ 
          content: `❌ Product not found` 
        });
        return;
      }

      const variant = product.variants?.find(v => v.id.toString() === variantInput);
      if (!variant) {
        await interaction.editReply({ 
          content: `❌ Variant not found` 
        });
        return;
      }

      const variantsData = loadVariantsData();
      const cachedProduct = variantsData[product.id.toString()];
      const cachedVariant = cachedProduct?.variants[variant.id.toString()];
      const cachedStock = cachedVariant?.stock || 0;

      // Get debug info
      const debug = await getVariantStockWithDebug(api, product.id, variant.id, product.name, variant.name);

      // Build debug embed
      const debugStepsText = debug.steps.slice(0, 8).map(s => `• ${s}`).join('\n');
      const hasMoreSteps = debug.steps.length > 8;
      
      const embed = new EmbedBuilder()
        .setColor(0x00AAFF)
        .setTitle('🔧 REPLACE TEST - DEBUG INFO')
        .addFields(
          { 
            name: '📦 Product', 
            value: `${product.name} (ID: ${product.id})`, 
            inline: false 
          },
          { 
            name: '🎮 Variant', 
            value: `${variant.name} (ID: ${variant.id})`, 
            inline: false 
          },
          { 
            name: '💾 Cached Stock', 
            value: `${cachedStock} items`, 
            inline: true 
          },
          { 
            name: '🔍 API Real Stock', 
            value: `${debug.itemCount || 0} items`, 
            inline: true 
          }
        );

      // Add debug steps, truncated if needed
      const stepsDisplay = debugStepsText + (hasMoreSteps ? '\n... (more steps)' : '');
      embed.addFields({
        name: '🐛 Debug Steps',
        value: stepsDisplay || 'No steps',
        inline: false
      });

      if (debug.error) {
        embed.addFields({
          name: '❌ Error',
          value: debug.error.substring(0, 1024),
          inline: false
        });
      }

      // Only show items if available and not too many
      if (debug.items && debug.items.length > 0 && debug.items.length <= 20) {
        const itemsList = debug.items.slice(0, 5).map((item, i) => `${i + 1}. \`${item.substring(0, 50)}\``).join('\n');
        embed.addFields({
          name: `📋 Sample Items (${debug.items.length} total)`,
          value: itemsList,
          inline: false
        });
      } else if (debug.items && debug.items.length > 20) {
        embed.addFields({
          name: `📋 Items Found`,
          value: `${debug.items.length} items (too many to display)`,
          inline: false
        });
      }

      embed.setFooter({ text: `Timestamp: ${new Date().toLocaleTimeString()}` });

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      await interaction.editReply({ 
        content: `❌ Error: ${error.message}` 
      });
    }
  }
};
