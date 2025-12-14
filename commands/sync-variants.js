import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';
import { ErrorLog } from '../utils/errorLogger.js';

const variantsDataPath = join(process.cwd(), 'variantsData.json');

export default {
  data: new SlashCommandBuilder()
    .setName('sync-variants')
    .setDescription('Sync all product variants from SellAuth (Admin only)'),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction, api) {
    try {
      await AdvancedCommandLogger.logCommand(interaction, 'sync-variants');
      // Quick response to prevent timeout
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
      }

      const startTime = Date.now();
      const allVariants = {};
      let totalVariants = 0;
      let productsWithVariants = 0;
      const variantsList = [];
      const processedVariantIds = new Set();

      // STEP 1: Get all products with pagination
      console.log(`[SYNC] === STEP 1: Fetching all products ===`);
      let productList = [];
      let page = 1;
      let hasMoreProducts = true;

      while (hasMoreProducts && page <= 50) {
        try {
          const products = await api.get(`shops/${api.shopId}/products?limit=100&page=${page}`);
          const pageProducts = Array.isArray(products) ? products : products?.data || [];

          if (pageProducts.length === 0) {
            hasMoreProducts = false;
            console.log(`[SYNC] No more products (page ${page})`);
          } else {
            productList = productList.concat(pageProducts);
            console.log(`[SYNC] Page ${page}: +${pageProducts.length} products (total: ${productList.length})`);
            page++;
          }
        } catch (e) {
          console.error(`[SYNC] Error fetching products page ${page}:`, e.message);
          hasMoreProducts = false;
        }
      }

      console.log(`[SYNC] Total products loaded: ${productList.length}`);

      let processedProducts = 0;
      let updateInterval = null;
      let lastUpdate = Date.now();
      try {
        updateInterval = setInterval(async () => {
          try {
            // Throttle updates to every 3 seconds to avoid rate limits
            if (Date.now() - lastUpdate < 3000) return;
            lastUpdate = Date.now();
            
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            // Prevent division by zero
            const percentage = productList.length > 0 ? Math.round((processedProducts / productList.length) * 100) : 0;
            const filled = Math.round(percentage / 5);
            const bar = `[${'█'.repeat(filled)}${'░'.repeat(20 - filled)}] ${percentage}%`;

            const message =
              `🔄 **SINCRONIZACIÓN EN PROGRESO**\n\n` +
              `${bar}\n\n` +
              `📊 Productos: ${processedProducts}/${productList.length}\n` +
              `🎮 Variantes: ${totalVariants}\n` +
              `⏱️ Tiempo: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

            if (interaction.deferred || interaction.replied) {
              await interaction.editReply({ content: message }).catch((err) => {
                console.error(`[SYNC] Update progress failed: ${err.message}`);
              });
            }
          } catch (err) {
            console.error(`[SYNC] Interval error: ${err.message}`);
          }
        }, 2000);
      } catch (err) {
        console.error(`[SYNC] Failed to start progress interval: ${err.message}`);
      }

      // STEP 2: Process each product's variants
      console.log(`[SYNC] === STEP 2: Processing product variants ===`);
      let newProductsCount = 0;
      let productsWithoutVariants = 0;
      
      for (const product of productList) {
        try {
          const productId = product.id.toString();
          const variantMap = {};
          let hasVariants = false;

          // Check if product has variants array
          if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
            for (const variant of product.variants) {
              const stock = variant.stock || 0;
              const variantId = variant.id.toString();

              if (!processedVariantIds.has(variantId)) {
                variantMap[variantId] = {
                  id: variant.id,
                  name: variant.name || `Variant ${variant.id}`,
                  stock: stock
                };

                variantsList.push({
                  productName: product.name,
                  variantName: variant.name || `Variant ${variant.id}`,
                  stock: stock
                });

                processedVariantIds.add(variantId);
                totalVariants++;
                hasVariants = true;
              }
            }
          }

          // IMPORTANT: Add ALL products, even if they don't have variants yet
          // This ensures new products are detected even before they have variants
          if (!allVariants[productId]) {
            // This is a new product that wasn't in invoices
            newProductsCount++;
            
            if (!hasVariants) {
              productsWithoutVariants++;
              console.log(`[SYNC] New product without variants detected: ${product.name} (ID: ${productId})`);
            }
          }
          
          // Add or update product entry (even if it has no variants)
          allVariants[productId] = {
            productId: product.id,
            productName: product.name,
            variants: variantMap
          };
          
          if (hasVariants) {
            productsWithVariants++;
          }

          processedProducts++;
        } catch (e) {
          console.error(`Error processing product ${product.id}:`, e.message);
          processedProducts++;
        }
      }
      
      console.log(`[SYNC] New products detected: ${newProductsCount}`);
      console.log(`[SYNC] Products without variants: ${productsWithoutVariants}`);

      // STEP 3: Discover missing variants from invoices (with pagination)
      console.log(`[SYNC] === STEP 3: Discovering variants from invoices ===`);
      try {
        let invoiceList = [];
        let invPage = 1;
        let hasMoreInvoices = true;

        while (hasMoreInvoices && invPage <= 50) {
          try {
            const invoices = await api.get(`shops/${api.shopId}/invoices?limit=250&page=${invPage}`);
            const pageInvoices = Array.isArray(invoices) ? invoices : invoices?.data || [];

            if (pageInvoices.length === 0) {
              hasMoreInvoices = false;
              console.log(`[SYNC] No more invoices (page ${invPage})`);
            } else {
              invoiceList = invoiceList.concat(pageInvoices);
              console.log(
                `[SYNC] Invoices page ${invPage}: +${pageInvoices.length} invoices (total: ${invoiceList.length})`
              );
              invPage++;
            }
          } catch (e) {
            console.error(`[SYNC] Error fetching invoices page ${invPage}:`, e.message);
            hasMoreInvoices = false;
          }
        }

        console.log(`[SYNC] Total invoices loaded: ${invoiceList.length}`);

        for (const invoice of invoiceList) {
          try {
            if (!invoice.variant || !invoice.product) continue;

            const productId = invoice.product.id?.toString();
            const variantId = invoice.variant.id?.toString();

            if (!productId || !variantId) continue;
            if (processedVariantIds.has(variantId)) continue;

            // Add variant from invoice
            if (!allVariants[productId]) {
              allVariants[productId] = {
                productId: invoice.product.id,
                productName: invoice.product.name || `Product ${productId}`,
                variants: {}
              };
              productsWithVariants++;
            }

            allVariants[productId].variants[variantId] = {
              id: invoice.variant.id,
              name: invoice.variant.name || `Variant ${variantId}`,
              stock: invoice.variant.stock || 0
            };

            variantsList.push({
              productName: invoice.product.name,
              variantName: invoice.variant.name || `Variant ${variantId}`,
              stock: invoice.variant.stock || 0
            });

            processedVariantIds.add(variantId);
            totalVariants++;
          } catch (e) {
            // Silent fail for individual invoices
          }
        }
      } catch (e) {
        console.error(`[SYNC] Error discovering from invoices:`, e.message);
      }

      if (updateInterval) {
        clearInterval(updateInterval);
      }

      // Save to file
      try {
        writeFileSync(variantsDataPath, JSON.stringify(allVariants, null, 2));
      } catch (err) {
        console.error(`[SYNC] Error saving variantsData.json: ${err.message}`);
        ErrorLog.log('sync-variants', err, { stage: 'FILE_SAVE' });
      }
      const totalTime = Math.round((Date.now() - startTime) / 1000);

      console.log(`[SYNC] === SYNC COMPLETE ===`);
      console.log(`[SYNC] Scanned: ${productList.length} products`);
      console.log(`[SYNC] Total products in cache: ${Object.keys(allVariants).length}`);
      console.log(`[SYNC] Products with variants: ${productsWithVariants}`);
      console.log(`[SYNC] Products without variants: ${productsWithoutVariants}`);
      console.log(`[SYNC] Found: ${totalVariants} variants`);
      console.log(`[SYNC] Time: ${totalTime}s`);

      // Create detailed report message
      let reportText = `✅ **¡Sincronización Completada!**\n\n`;
      reportText += `**📊 Estadísticas:**\n`;
      reportText += `• Productos escaneados: ${productList.length}\n`;
      reportText += `• Productos totales en caché: ${Object.keys(allVariants).length}\n`;
      reportText += `• Productos con variantes: ${productsWithVariants}\n`;
      if (productsWithoutVariants > 0) {
        reportText += `• Productos nuevos sin variantes: ${productsWithoutVariants}\n`;
      }
      reportText += `• Variantes totales: ${totalVariants}\n`;
      reportText += `• Tiempo total: ${Math.floor(totalTime / 60)}m ${totalTime % 60}s\n\n`;
      reportText += `**🎮 Variantes Detectadas (primeras 30):**\n`;

      // Add first 30 variants safely
      for (let i = 0; i < Math.min(30, variantsList.length); i++) {
        const v = variantsList[i];
        const stockEmoji = v.stock > 0 ? '✅' : '❌';
        reportText += `${stockEmoji} ${v.productName} → ${v.variantName} (${v.stock})\n`;
      }

      if (variantsList.length > 30) {
        reportText += `\n... y ${variantsList.length - 30} variantes más\n`;
      }

      reportText += `\n💾 Datos guardados. Usa **/stock** para verificar.`;

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ ¡Sincronización Completada!')
        .setDescription(reportText.substring(0, 4096))
        .setTimestamp();

      if (updateInterval) {
        clearInterval(updateInterval);
      }

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [embed] }).catch((err) => {
          console.error(`[SYNC] Failed to send completion embed: ${err.message}`);
        });
      } else {
        await interaction.reply({ embeds: [embed], ephemeral: true }).catch((err) => {
          console.error(`[SYNC] Failed to reply with completion embed: ${err.message}`);
        });
      }
    } catch (error) {
      console.error('Sync error:', error);
      
      if (updateInterval) {
        clearInterval(updateInterval);
      }

      ErrorLog.log('sync-variants', error, { stage: 'OUTER_EXCEPTION' });

      if (interaction.deferred || interaction.replied) {
        await interaction
          .editReply({
            content: `❌ Error en sincronización: ${error.message}`
          })
          .catch((err) => {
            console.error(`[SYNC] Failed to send error reply: ${err.message}`);
          });
      } else {
        await interaction
          .reply({
            content: `❌ Error en sincronización: ${error.message}`,
            ephemeral: true
          })
          .catch((err) => {
            console.error(`[SYNC] Failed to reply with error: ${err.message}`);
          });
      }
    }
  }
};
