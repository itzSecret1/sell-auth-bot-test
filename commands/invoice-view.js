import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { loadVariantsData } from '../utils/dataLoader.js';
import { ErrorLog } from '../utils/errorLogger.js';
import { Api } from '../classes/Api.js';
import { CommandLogger } from '../utils/commandLogger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('invoice-view')
    .setDescription('Ver detalles de producto o invoice')
    .addStringOption((option) => 
      option.setName('id')
        .setDescription('Product ID (ej: 433092) o Invoice ID (ej: b30/xxxxx)')
        .setRequired(true)
    ),

  onlyWhitelisted: true,
  requiredRole: 'staff',

  async execute(interaction) {
    try {
      await CommandLogger.logCommand(interaction, 'invoice-view');
      const inputId = interaction.options.getString('id');

      try {
        await interaction.deferReply({ ephemeral: true });
      } catch (deferError) {
        console.error(`[INVOICE-VIEW] Defer error: ${deferError.message}`);
        return;
      }

      // Validate input
      if (!inputId || inputId.trim() === '') {
        await interaction.editReply({
          content: '❌ Debes proporcionar un ID (producto o invoice)'
        });
        return;
      }

      const cleanId = inputId.trim();
      const isInvoiceId = cleanId.includes('/');

      if (isInvoiceId) {
        // Invoice ID - query API
        try {
          const api = new Api();
          console.log(`[INVOICE-VIEW] Fetching invoice: ${cleanId}`);
          const invoiceData = await api.get(`invoices/${cleanId}`);

          if (!invoiceData || Object.keys(invoiceData).length === 0) {
            await interaction.editReply({
              content: `❌ Invoice no encontrado: ${cleanId}`
            });
            return;
          }

          const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('📋 Detalles de Invoice')
            .setDescription(`Invoice ID: \`${cleanId}\``)
            .addFields(
              {
                name: '🛍️ Producto',
                value: invoiceData.product_name || invoiceData.product || 'N/A',
                inline: true
              },
              {
                name: '💰 Monto',
                value: `$${invoiceData.amount || 0}`,
                inline: true
              },
              {
                name: '📅 Fecha',
                value: invoiceData.created_at || 'N/A',
                inline: true
              },
              {
                name: '✅ Estado',
                value: invoiceData.status || 'N/A',
                inline: true
              }
            )
            .setFooter({ text: 'SellAuth Bot | Invoice Details' })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          console.log(`[INVOICE-VIEW] ✅ Invoice ${cleanId} retrieved`);
        } catch (apiError) {
          console.error('[INVOICE-VIEW] API Error:', apiError.message);
          await interaction.editReply({
            content: `❌ Error: No se pudo obtener el invoice (${apiError.message})`
          });
        }
      } else {
        // Product ID - load from cache
        try {
          const variantsData = loadVariantsData();
          
          if (!variantsData || Object.keys(variantsData).length === 0) {
            await interaction.editReply({
              content: '❌ Error: Cache de productos vacío. Ejecuta `/sync-variants` primero.'
            });
            return;
          }

          // Try both as string key and number key
          let productData = variantsData[cleanId];
          if (!productData) {
            const numId = parseInt(cleanId);
            productData = variantsData[numId];
          }

          if (!productData) {
            const availableIds = Object.keys(variantsData).slice(0, 5).join(', ');
            await interaction.editReply({
              content: `❌ Producto no encontrado: ${cleanId}\n\n💡 Productos disponibles: ${availableIds}...`
            });
            return;
          }

          // Build product details
          let variantsText = '';
          let totalStock = 0;
          let variantCount = 0;

          if (productData.variants && typeof productData.variants === 'object') {
            for (const [variantId, variantData] of Object.entries(productData.variants)) {
              variantCount++;
              const stock = variantData.stock || 0;
              totalStock += stock;
              const emoji = stock > 0 ? '✅' : '❌';
              const name = variantData.name || `Variante ${variantId}`;
              variantsText += `${emoji} **${name}**: ${stock} items\n`;
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
                value: totalStock > 0 ? '✅ Con Stock' : '❌ Sin Stock',
                inline: true
              },
              {
                name: '🎮 Variantes',
                value: variantsText || 'Sin variantes',
                inline: false
              }
            )
            .setFooter({ text: 'SellAuth Bot | Product Details' })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          console.log(`[INVOICE-VIEW] ✅ Product ${cleanId} retrieved by ${interaction.user.username}`);
        } catch (cacheError) {
          console.error('[INVOICE-VIEW] Cache Error:', cacheError);
          await interaction.editReply({
            content: `❌ Error al cargar producto: ${cacheError.message}`
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
        ErrorLog.log('invoice-view', e, {
          stage: 'REPLY_FAILURE',
          userId: interaction.user.id
        });
      }
    }
  }
};
