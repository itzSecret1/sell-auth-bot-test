import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';
import { ErrorLog } from '../utils/errorLogger.js';
import { quickReply } from '../utils/quickResponse.js';

export default {
  data: new SlashCommandBuilder()
    .setName('balance-add')
    .setDescription('Add balance to a customer (Admin only)')
    .addStringOption((option) =>
      option
        .setName('email')
        .setDescription('Customer email address')
        .setRequired(true)
    )
    .addNumberOption((option) =>
      option
        .setName('amount')
        .setDescription('Amount to add (in shop currency)')
        .setRequired(true)
        .setMinValue(0.01)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Reason for adding balance (optional)')
        .setRequired(false)
    ),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction, api) {
    const email = interaction.options.getString('email')?.trim();
    const amount = interaction.options.getNumber('amount');
    const reason = interaction.options.getString('reason') || 'Manual balance adjustment';
    const userEmail = interaction.user.username;

    // Use quick reply to ensure response within 3 seconds
    await quickReply(interaction, async () => {
      const startTime = Date.now();
      try {

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return {
            content: `❌ Email inválido: \`${email}\`\n✅ Formato válido: usuario@ejemplo.com`
          };
        }

        // Validate amount
        if (!Number.isFinite(amount) || amount <= 0) {
          return {
            content: `❌ Monto inválido: \`${amount}\`\n✅ Debe ser un número positivo`
          };
        }

        console.log(`[BALANCE-ADD] Adding ${amount} to ${email} by ${userEmail}`);

        // Call API to add balance
        const response = await api.post(`shops/${api.shopId}/customers/balance/add`, {
          email,
          amount,
          reason,
          admin_user: userEmail
        });

        // Success response
        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✅ Balance Agregado')
          .addFields(
            { name: '👤 Cliente', value: email, inline: true },
            { name: '💰 Monto Agregado', value: `$${amount}`, inline: true },
            { name: '📝 Razón', value: reason, inline: false },
            { name: '✓ Admin', value: userEmail, inline: true }
          )
          .setFooter({ text: 'SellAuth Bot | Balance Management' })
          .setTimestamp();

        // Add old and new balance if available
        if (response?.old_balance !== undefined && response?.new_balance !== undefined) {
          embed.addFields(
            { name: '💾 Balance Anterior', value: `$${response.old_balance}`, inline: true },
            { name: '💾 Balance Nuevo', value: `$${response.new_balance}`, inline: true }
          );
        }

        // Log success
        await AdvancedCommandLogger.logCommand(interaction, 'balance-add', {
          status: 'EXECUTED',
          result: 'Balance added successfully',
          executionTime: Date.now() - startTime,
          metadata: {
            'Email': email,
            'Amount Added': `$${amount}`,
            'Reason': reason,
            'New Balance': response?.new_balance ? `$${response.new_balance}` : 'N/A',
            'Admin': userEmail
          }
        });

        console.log(`[BALANCE-ADD] ✅ Successfully added ${amount} to ${email}`);
        return { embeds: [embed] };
      } catch (error) {
        console.error('[BALANCE-ADD] Error:', error);

        let errorMsg = error.message || 'Unknown error';
        if (error.status === 404) {
          errorMsg = 'Cliente no encontrado (404)';
        } else if (error.status === 429) {
          errorMsg = 'Rate limited - intenta de nuevo en unos segundos';
        } else if (error.status === 400) {
          errorMsg = error.data?.message || 'Solicitud inválida (400)';
        }

        await AdvancedCommandLogger.logCommand(interaction, 'balance-add', {
          status: 'ERROR',
          result: errorMsg,
          executionTime: Date.now() - startTime,
          metadata: {
            'Email': email,
            'Amount': amount.toString(),
            'Error Status': error.status || 'Unknown',
            'Error': error.message
          },
          errorCode: error.name || 'API_ERROR',
          stackTrace: error.stack
        });

        ErrorLog.log('balance-add', error, {
          email,
          amount,
          admin: userEmail
        });

        return { content: `❌ Error al agregar balance: \`${errorMsg}\`` };
      }
    });
  }
};