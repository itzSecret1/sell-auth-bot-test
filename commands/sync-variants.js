import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

const variantsDataPath = join(process.cwd(), 'variantsData.json');

export default {
  data: new SlashCommandBuilder()
    .setName('sync-variants')
    .setDescription('Sync all product variants from SellAuth (Admin only)'),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction, api) {
    try {
      // Quick response to prevent timeout
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
      }

      const startTime = Date.now();
      const allVariants = {};
      let totalVariants = 0;
      let productsWithVariants = 0;
      const variantsList = [];

      // Get all products
      const products = await api.get(`shops/${api.shopId}/products`);
      const productList = Array.isArray(products) ? products : (products?.data || []);

      let processedProducts = 0;
      const updateInterval = setInterval(async () => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const percentage = Math.round((processedProducts / productList.length) * 100);
        const filled = Math.round(percentage / 5);
        const bar = `[${'█'.repeat(filled)}${'░'.repeat(20-filled)}] ${percentage}%`;
        
        const message = 
          `🔄 **SINCRONIZACIÓN EN PROGRESO**\n\n` +
          `${bar}\n\n` +
          `📊 Productos: ${processedProducts}/${productList.length}\n` +
          `🎮 Variantes: ${totalVariants}\n` +
          `⏱️ Tiempo: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

        await interaction.editReply({ content: message }).catch(() => {});
      }, 2000);

      // Process each product - DETECT ALL, not just those with variants
      for (const product of productList) {
        try {
          let hasVariants = false;
          const variantMap = {};

          // Check if product has variants array
          if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
            hasVariants = true;
            
            for (const variant of product.variants) {
              const stock = variant.stock || 0;
              variantMap[variant.id.toString()] = {
                id: variant.id,
                name: variant.name,
                stock: stock
              };
              
              variantsList.push({
                productName: product.name,
                variantName: variant.name,
                stock: stock
              });

              totalVariants++;
            }

            allVariants[product.id.toString()] = {
              productId: product.id,
              productName: product.name,
              variants: variantMap
            };

            productsWithVariants++;
          }

          processedProducts++;
        } catch (e) {
          console.error(`Error processing product ${product.id}:`, e.message);
          processedProducts++;
        }
      }

      clearInterval(updateInterval);

      // Save to file
      writeFileSync(variantsDataPath, JSON.stringify(allVariants, null, 2));
      const totalTime = Math.round((Date.now() - startTime) / 1000);

      console.log(`[SYNC] Complete! ${totalVariants} variants in ${productsWithVariants} products`);
      console.log(`[SYNC] Total products scanned: ${productList.length}`);
      console.log(`[SYNC] Variants detected:`, variantsList.slice(0, 10));

      // Create detailed report message
      let reportText = `✅ **¡Sincronización Completada!**\n\n`;
      reportText += `**📊 Estadísticas:**\n`;
      reportText += `• Productos totales: ${productList.length}\n`;
      reportText += `• Productos con variantes: ${productsWithVariants}\n`;
      reportText += `• Variantes totales: ${totalVariants}\n`;
      reportText += `• Tiempo total: ${Math.floor(totalTime / 60)}m ${totalTime % 60}s\n\n`;
      reportText += `**🎮 Variantes Detectadas (primeras 25):**\n`;

      // Add first 25 variants
      for (let i = 0; i < Math.min(25, variantsList.length); i++) {
        const v = variantsList[i];
        const stockEmoji = v.stock > 0 ? '✅' : '❌';
        reportText += `${stockEmoji} ${v.productName} → ${v.variantName} (${v.stock})\n`;
      }

      if (variantsList.length > 25) {
        reportText += `\n... y ${variantsList.length - 25} variantes más\n`;
      }

      reportText += `\n💾 Datos guardados. Usa **/stock** para verificar.`;

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ ¡Sincronización Completada!')
        .setDescription(reportText)
        .setTimestamp();

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [embed] }).catch(() => {});
      } else {
        await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
      }
    } catch (error) {
      console.error('Sync error:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ 
          content: `❌ Error en sincronización: ${error.message}` 
        }).catch(() => {});
      } else {
        await interaction.reply({
          content: `❌ Error en sincronización: ${error.message}`,
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
};
