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

export default {
  data: new SlashCommandBuilder()
    .setName('replace-test')
    .setDescription('[DEBUG] Test - shows stock info only')
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
        await interaction.editReply({ content: `❌ Product not found` });
        return;
      }

      const variant = product.variants?.find(v => v.id.toString() === variantInput);
      if (!variant) {
        await interaction.editReply({ content: `❌ Variant not found` });
        return;
      }

      const variantsData = loadVariantsData();
      const cachedProduct = variantsData[product.id.toString()];
      const cachedVariant = cachedProduct?.variants[variant.id.toString()];
      const cachedStock = cachedVariant?.stock || 0;

      try {
        const deliverablesData = await api.get(
          `shops/${api.shopId}/products/${product.id}/deliverables/${variant.id}`
        );
        
        let realStock = 0;
        if (typeof deliverablesData === 'string') {
          realStock = deliverablesData.split('\n').filter(item => item.trim()).length;
        } else if (deliverablesData?.deliverables && typeof deliverablesData.deliverables === 'string') {
          realStock = deliverablesData.deliverables.split('\n').filter(item => item.trim()).length;
        } else if (Array.isArray(deliverablesData)) {
          realStock = deliverablesData.filter(item => item).length;
        }

        const response = `📦 **${product.name}**
🎮 **${variant.name}**

💾 Cached: ${cachedStock} items
🔍 Real API: ${realStock} items

${cachedStock === realStock ? '✅ Match' : '⚠️ Mismatch'}`;

        await interaction.editReply({ content: response });
      } catch (e) {
        await interaction.editReply({ 
          content: `📦 **${product.name}**\n🎮 **${variant.name}**\n\n💾 Cached: ${cachedStock} items\n\n❌ API Error: Could not fetch real stock` 
        });
      }

    } catch (error) {
      await interaction.editReply({ content: `❌ Error: ${error.message}` });
    }
  }
};
