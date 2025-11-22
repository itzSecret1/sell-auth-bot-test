import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { ErrorLog } from '../utils/errorLogger.js';
import { Api } from '../classes/Api.js';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('invoice-view')
    .setDescription('📋 Ver detalles completos de un invoice')
    .addStringOption((option) => 
      option.setName('id')
        .setDescription('Invoice ID (formato: b30/xxxxx o similar)')
        .setRequired(true)
    ),

  onlyWhitelisted: true,
  requiredRole: 'staff',

  async execute(interaction) {
    const startTime = Date.now();
    try {
      await interaction.deferReply({ ephemeral: true });

      const inputId = interaction.options.getString('id');

      // Validate input
      if (!inputId || inputId.trim() === '') {
        await interaction.editReply({
          content: '❌ Debes proporcionar un Invoice ID\n💡 Formato: `b30/xxxxxxx`\n💡 Ejemplo: `b30/0aaa28c0694-000000080165178`'
        });
        return;
      }

      const cleanId = inputId.trim();
      console.log(`[INVOICE-VIEW] Searching invoice: "${cleanId}"`);

      // Validate invoice format (must contain /)
      if (!cleanId.includes('/')) {
        await interaction.editReply({
          content: `❌ Formato incorrecto: \`${cleanId}\`\n✅ Formato correcto: \`b30/xxxxxxx\`\n\n💡 El Invoice ID debe contener una "/" (ejemplo: b30/0aaa28c0694-000000080165178)`
        });

        await AdvancedCommandLogger.logCommand(interaction, 'invoice-view', {
          status: 'EXECUTED',
          result: `Invalid format: ${cleanId}`,
          executionTime: Date.now() - startTime,
          metadata: {
            'Invoice ID': cleanId,
            'Result': 'Invalid Format'
          }
        });
        return;
      }

      // Validate format parts - allow alphanumeric and hyphens in second part
      const invoiceParts = cleanId.split('/');
      if (invoiceParts.length !== 2 || !invoiceParts[0] || !invoiceParts[1]) {
        await interaction.editReply({
          content: `❌ Formato inválido: \`${cleanId}\`\n✅ Debe ser: \`PREFIX/CODE\`\n💡 Ejemplo: \`b30/0aaa28c0694-000000080165178\``
        });

        await AdvancedCommandLogger.logCommand(interaction, 'invoice-view', {
          status: 'EXECUTED',
          result: `Invalid format parts: ${cleanId}`,
          executionTime: Date.now() - startTime,
          metadata: {
            'Invoice ID': cleanId,
            'Result': 'Invalid Parts'
          }
        });
        return;
      }

      // Validate that second part contains only alphanumeric, hyphens, underscores
      const prefix = invoiceParts[0];
      const code = invoiceParts[1];
      if (!/^[a-zA-Z0-9\-_]+$/.test(code)) {
        await interaction.editReply({
          content: `❌ Código inválido: \`${code}\`\n✅ Solo caracteres alfanuméricos, guiones y guiones bajos permitidos`
        });

        await AdvancedCommandLogger.logCommand(interaction, 'invoice-view', {
          status: 'EXECUTED',
          result: `Invalid code characters: ${code}`,
          executionTime: Date.now() - startTime,
          metadata: {
            'Invoice ID': cleanId,
            'Result': 'Invalid Characters'
          }
        });
        return;
      }

      try {
        // Search invoice via API
        const api = new Api();
        const encodedId = encodeURIComponent(cleanId);
        console.log(`[INVOICE-VIEW] API call: invoices/${encodedId}`);

        let invoiceData = null;
        try {
          invoiceData = await api.get(`invoices/${encodedId}`);
          console.log(`[INVOICE-VIEW] API Response:`, invoiceData);
        } catch (apiError) {
          console.error(`[INVOICE-VIEW] API error:`, apiError);
          throw apiError;
        }

        // Check if invoice was found
        if (!invoiceData) {
          await interaction.editReply({
            content: `❌ Invoice **no encontrado**: \`${cleanId}\`\n\n💡 Verifica:\n  • El ID sea correcto\n  • El invoice exista en el sistema SellAuth\n  • Contacta al admin si el problema persiste`
          });

          await AdvancedCommandLogger.logCommand(interaction, 'invoice-view', {
            status: 'EXECUTED',
            result: `Invoice not found`,
            executionTime: Date.now() - startTime,
            metadata: {
              'Invoice ID': cleanId,
              'Result': 'Not Found'
            }
          });
          return;
        }

        // Check if response is empty object
        if (typeof invoiceData === 'object' && Object.keys(invoiceData).length === 0) {
          await interaction.editReply({
            content: `❌ Invoice vacío o no encontrado: \`${cleanId}\``
          });

          await AdvancedCommandLogger.logCommand(interaction, 'invoice-view', {
            status: 'EXECUTED',
            result: `Empty invoice response`,
            executionTime: Date.now() - startTime,
            metadata: {
              'Invoice ID': cleanId,
              'Result': 'Empty Response'
            }
          });
          return;
        }

        // Build invoice embed with ALL available data
        const embed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle('📋 DETALLES DEL INVOICE')
          .setDescription(`Invoice: \`${cleanId}\``);

        // Add all available fields
        if (invoiceData.product_name || invoiceData.product) {
          embed.addFields({
            name: '🛍️ Producto',
            value: (invoiceData.product_name || invoiceData.product).substring(0, 100),
            inline: true
          });
        }

        if (invoiceData.amount) {
          embed.addFields({
            name: '💰 Monto',
            value: `$${invoiceData.amount}`,
            inline: true
          });
        }

        if (invoiceData.created_at) {
          embed.addFields({
            name: '📅 Fecha Creación',
            value: invoiceData.created_at.substring(0, 10),
            inline: true
          });
        }

        if (invoiceData.status) {
          embed.addFields({
            name: '✅ Estado',
            value: invoiceData.status.toUpperCase(),
            inline: true
          });
        }

        if (invoiceData.order_id) {
          embed.addFields({
            name: '📦 Order ID',
            value: invoiceData.order_id.toString(),
            inline: true
          });
        }

        if (invoiceData.customer_name || invoiceData.customer_email) {
          const customerInfo = `${invoiceData.customer_name || 'N/A'} (${invoiceData.customer_email || 'N/A'})`;
          embed.addFields({
            name: '👤 Cliente',
            value: customerInfo.substring(0, 100),
            inline: false
          });
        }

        if (invoiceData.notes || invoiceData.description) {
          const notes = (invoiceData.notes || invoiceData.description).substring(0, 200);
          embed.addFields({
            name: '📝 Notas',
            value: notes,
            inline: false
          });
        }

        embed.setFooter({ text: 'SellAuth Bot | Invoice Lookup' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        const executionTime = Date.now() - startTime;
        await AdvancedCommandLogger.logCommand(interaction, 'invoice-view', {
          status: 'EXECUTED',
          result: `Invoice found successfully`,
          executionTime,
          metadata: {
            'Invoice ID': cleanId,
            'Product': invoiceData.product_name || 'N/A',
            'Amount': `$${invoiceData.amount || 0}`,
            'Status': invoiceData.status || 'Unknown',
            'Found': 'YES'
          }
        });

        console.log(`[INVOICE-VIEW] ✅ Invoice ${cleanId} retrieved successfully by ${interaction.user.username}`);
      } catch (invoiceError) {
        console.error('[INVOICE-VIEW] Invoice search error:', invoiceError);
        
        let errorMsg = invoiceError.message || 'Unknown error';
        if (invoiceError.status === 404) {
          errorMsg = `Invoice no encontrado (404)`;
        } else if (invoiceError.status === 429) {
          errorMsg = `Rate limited - intenta de nuevo en unos segundos`;
        } else if (invoiceError.status === 504) {
          errorMsg = `API timeout - intenta de nuevo`;
        }

        await interaction.editReply({
          content: `❌ Error al buscar invoice: \`${errorMsg}\``
        });

        await AdvancedCommandLogger.logCommand(interaction, 'invoice-view', {
          status: 'ERROR',
          result: errorMsg,
          executionTime: Date.now() - startTime,
          metadata: {
            'Invoice ID': cleanId,
            'Error Status': invoiceError.status || 'Unknown',
            'Error Type': invoiceError.name || 'API Error'
          },
          errorCode: invoiceError.name || 'API_ERROR',
          stackTrace: invoiceError.stack
        });
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
