import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { loadVariantsData } from '../utils/dataLoader.js';
import { ErrorLog } from '../utils/errorLogger.js';
import { Api } from '../classes/Api.js';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('invoice-view')
    .setDescription('🔍 Buscar detalles de Producto o Invoice')
    .addStringOption((option) => 
      option.setName('id')
        .setDescription('Product ID (ej: 433092) o Invoice ID (ej: b30/xxxxx)')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  onlyWhitelisted: true,
  requiredRole: 'staff',

  async autocomplete(interaction) {
    try {
      const focusedValue = interaction.options.getFocused(true).value;
      if (!focusedValue) {
        await interaction.respond([]);
        return;
      }

      const variantsData = loadVariantsData();
      const productIds = Object.keys(variantsData)
        .filter(id => id.includes(focusedValue) || variantsData[id].productName.toLowerCase().includes(focusedValue.toLowerCase()))
        .slice(0, 20)
        .map(id => ({
          name: `${variantsData[id].productName} (${id})`,
          value: id
        }));

      await interaction.respond(productIds);
    } catch (error) {
      console.error('[INVOICE-VIEW] Autocomplete error:', error);
      await interaction.respond([]).catch(() => {});
    }
  },

  async execute(interaction) {
    const startTime = Date.now();
    try {
      await interaction.deferReply({ ephemeral: true });

      const inputId = interaction.options.getString('id');

      // Validate input
      if (!inputId || inputId.trim() === '') {
        await interaction.editReply({
          content: '❌ Debes proporcionar un ID (producto o invoice)\n💡 Ejemplos:\n  • Producto: `433092`\n  • Invoice: `b30/xxxxx`'
        });
        return;
      }

      const cleanId = inputId.trim();
      console.log(`[INVOICE-VIEW] Search query: "${cleanId}"`);

      // Determine search type
      const isInvoiceId = cleanId.includes('/');

      if (isInvoiceId) {
        // ============ INVOICE ID SEARCH ============
        console.log(`[INVOICE-VIEW] Detected: INVOICE ID`);
        
        // Validate invoice format
        const invoiceParts = cleanId.split('/');
        if (invoiceParts.length !== 2 || !invoiceParts[0] || !invoiceParts[1]) {
          await interaction.editReply({
            content: `❌ Formato de Invoice inválido.\n✅ Formato correcto: \`b30/xxxxxxx\`\n💡 Ejemplo: \`b30/12345678\``
          });
          return;
        }

        try {
          const api = new Api();
          const encodedId = encodeURIComponent(cleanId);
          console.log(`[INVOICE-VIEW] API call: invoices/${encodedId}`);

          let invoiceData = null;
          try {
            invoiceData = await api.get(`invoices/${encodedId}`);
          } catch (apiError) {
            console.error(`[INVOICE-VIEW] API error:`, apiError);
            throw new Error(`API Error: ${apiError.message || 'Unknown error'}`);
          }

          if (!invoiceData || (typeof invoiceData === 'object' && Object.keys(invoiceData).length === 0)) {
            await interaction.editReply({
              content: `❌ Invoice **no encontrado**: \`${cleanId}\`\n\n💡 Verifica:\n  • El ID sea correcto\n  • El invoice exista en el sistema\n  • Contacta al admin si el problema persiste`
            });

            await AdvancedCommandLogger.logCommand(interaction, 'invoice-view', {
              status: 'EXECUTED',
              result: `Invoice not found: ${cleanId}`,
              executionTime: Date.now() - startTime,
              metadata: {
                'Search Type': 'Invoice',
                'Invoice ID': cleanId,
                'Result': 'Not Found'
              }
            });
            return;
          }

          // Build invoice embed
          const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('📋 DETALLES DE INVOICE')
            .setDescription(`Invoice: \`${cleanId}\``)
            .addFields(
              {
                name: '🛍️ Producto',
                value: (invoiceData.product_name || invoiceData.product || 'N/A').substring(0, 100),
                inline: true
              },
              {
                name: '💰 Monto',
                value: `$${invoiceData.amount || 0}`,
                inline: true
              },
              {
                name: '📅 Fecha',
                value: invoiceData.created_at?.substring(0, 10) || 'N/A',
                inline: true
              },
              {
                name: '✅ Estado',
                value: (invoiceData.status || 'Unknown').toUpperCase(),
                inline: true
              }
            )
            .setFooter({ text: 'SellAuth Bot | Invoice Lookup' })
            .setTimestamp();

          if (invoiceData.order_id) {
            embed.addFields({
              name: '📦 Order ID',
              value: invoiceData.order_id.toString(),
              inline: true
            });
          }

          await interaction.editReply({ embeds: [embed] });

          const executionTime = Date.now() - startTime;
          await AdvancedCommandLogger.logCommand(interaction, 'invoice-view', {
            status: 'EXECUTED',
            result: `Invoice found: ${cleanId}`,
            executionTime,
            metadata: {
              'Search Type': 'Invoice',
              'Invoice ID': cleanId,
              'Product': invoiceData.product_name || 'N/A',
              'Amount': `$${invoiceData.amount || 0}`,
              'Status': invoiceData.status || 'Unknown'
            }
          });

          console.log(`[INVOICE-VIEW] ✅ Invoice ${cleanId} retrieved successfully`);
        } catch (invoiceError) {
          console.error('[INVOICE-VIEW] Invoice search error:', invoiceError);
          await interaction.editReply({
            content: `❌ Error al buscar invoice: \`${invoiceError.message}\``
          });

          await AdvancedCommandLogger.logCommand(interaction, 'invoice-view', {
            status: 'ERROR',
            result: invoiceError.message,
            executionTime: Date.now() - startTime,
            metadata: {
              'Search Type': 'Invoice',
              'Invoice ID': cleanId,
              'Error Type': invoiceError.name
            },
            errorCode: invoiceError.name,
            stackTrace: invoiceError.stack
          });
        }
      } else {
        // ============ PRODUCT ID SEARCH ============
        console.log(`[INVOICE-VIEW] Detected: PRODUCT ID`);

        try {
          const variantsData = loadVariantsData();

          if (!variantsData || Object.keys(variantsData).length === 0) {
            await interaction.editReply({
              content: '❌ Cache de productos vacío.\n💡 Ejecuta `/sync-variants` para sincronizar.'
            });
            return;
          }

          // Search by product ID (string or number)
          let productData = variantsData[cleanId];
          if (!productData) {
            const numId = parseInt(cleanId);
            if (!isNaN(numId)) {
              productData = variantsData[numId.toString()];
            }
          }

          if (!productData) {
            // Show available products
            const availableIds = Object.keys(variantsData).slice(0, 10);
            const availableList = availableIds
              .map(id => `• \`${id}\` - ${variantsData[id].productName.substring(0, 30)}`)
              .join('\n');

            await interaction.editReply({
              content: `❌ Producto **no encontrado**: \`${cleanId}\`\n\n📝 Productos disponibles (primeros 10):\n${availableList}\n\n💡 Usa \`/stock\` para ver todos los productos`
            });

            await AdvancedCommandLogger.logCommand(interaction, 'invoice-view', {
              status: 'EXECUTED',
              result: `Product not found: ${cleanId}`,
              executionTime: Date.now() - startTime,
              metadata: {
                'Search Type': 'Product',
                'Product ID': cleanId,
                'Result': 'Not Found',
                'Available IDs': availableIds.length
              }
            });
            return;
          }

          // Build product embed
          let variantsText = '';
          let totalStock = 0;
          let variantCount = 0;

          if (productData.variants && typeof productData.variants === 'object') {
            const variantEntries = Object.entries(productData.variants);
            for (const [variantId, variantData] of variantEntries.slice(0, 15)) {
              variantCount++;
              const stock = variantData.stock || 0;
              totalStock += stock;
              const emoji = stock > 0 ? '✅' : '❌';
              const name = variantData.name || `Variant ${variantId}`;
              variantsText += `${emoji} **${name}**: ${stock}\n`;
            }
            if (variantEntries.length > 15) {
              variantsText += `\n... y ${variantEntries.length - 15} variantes más`;
            }
          }

          if (variantsText.length > 1024) {
            variantsText = variantsText.substring(0, 1021) + '...';
          }

          const embed = new EmbedBuilder()
            .setColor(totalStock > 0 ? 0x00aa00 : 0xaa0000)
            .setTitle(`📦 ${productData.productName || 'Producto'}`)
            .setDescription(`Product ID: \`${cleanId}\``)
            .addFields(
              {
                name: '📊 Estadísticas',
                value: `**Variantes:** ${variantCount}\n**Stock Total:** ${totalStock}`,
                inline: true
              },
              {
                name: '📈 Estado',
                value: totalStock > 0 ? '✅ **Con Stock**' : '❌ **Sin Stock**',
                inline: true
              },
              {
                name: '🎮 Primeras Variantes',
                value: variantsText || 'Sin variantes',
                inline: false
              }
            )
            .setFooter({ text: 'SellAuth Bot | Product Lookup' })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });

          const executionTime = Date.now() - startTime;
          await AdvancedCommandLogger.logCommand(interaction, 'invoice-view', {
            status: 'EXECUTED',
            result: `Product found: ${productData.productName}`,
            executionTime,
            metadata: {
              'Search Type': 'Product',
              'Product ID': cleanId,
              'Product Name': productData.productName,
              'Variants': variantCount,
              'Total Stock': totalStock
            }
          });

          console.log(`[INVOICE-VIEW] ✅ Product ${cleanId} retrieved by ${interaction.user.username}`);
        } catch (productError) {
          console.error('[INVOICE-VIEW] Product search error:', productError);
          await interaction.editReply({
            content: `❌ Error al buscar producto: \`${productError.message}\``
          });

          await AdvancedCommandLogger.logCommand(interaction, 'invoice-view', {
            status: 'ERROR',
            result: productError.message,
            executionTime: Date.now() - startTime,
            metadata: {
              'Search Type': 'Product',
              'Product ID': cleanId,
              'Error Type': productError.name
            },
            errorCode: productError.name,
            stackTrace: productError.stack
          });
        }
      }
    } catch (error) {
      console.error('[INVOICE-VIEW] Critical Error:', error);
      ErrorLog.log('invoice-view', error, {
        stage: 'OUTER_EXCEPTION',
        inputId: interaction.options.getString('id'),
        userId: interaction.user.id,
        userName: interaction.user.username
      });

      try {
        await interaction.editReply({
          content: `❌ Error crítico: ${error.message}`
        });
      } catch (e) {
        console.error('[INVOICE-VIEW] Reply failed:', e.message);
      }

      await AdvancedCommandLogger.logCommand(interaction, 'invoice-view', {
        status: 'ERROR',
        result: error.message,
        executionTime: Date.now() - startTime,
        metadata: {
          'Error Stage': 'CRITICAL',
          'Error Type': error.name
        },
        errorCode: error.name,
        stackTrace: error.stack
      });
    }
  }
};
