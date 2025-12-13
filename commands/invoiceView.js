import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { formatPrice } from '../utils/formatPrice.js';

const formatCoupon = (coupon) => {
  if (!coupon) return 'N/A';
  return `${coupon.code} (${coupon.discount}${coupon.type == 'percentage' ? '%' : coupon.type == 'fixed' ? coupon.currency : ''})`;
};

const formatCustomFields = (customFields) => {
  if (!customFields || Object.entries(customFields).length === 0) return 'N/A';
  return Object.entries(customFields)
    .map(([key, value]) => `${key}: "${value}"`)
    .join(', ');
};

const formatDelivered = (delivered) => {
  if (!delivered) return 'N/A';
  
  try {
    const data = JSON.parse(delivered);
    if (Array.isArray(data)) {
      return data.join('\n');
    }
  } catch (e) {
    if (typeof delivered === 'string') {
      const lines = delivered.split('\n').filter(l => l.trim());
      return lines.join('\n');
    }
  }
  return delivered.toString();
};

const getPaymentTime = (completedAt) => {
  if (!completedAt) return 'N/A';
  const date = new Date(completedAt);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const formatGatewayInfo = (invoice) => {
  switch (invoice.gateway) {
    case 'CASHAPP':
      return `Transaction ID: "${invoice.cashapp_transaction_id || 'N/A'}"`;
    case 'STRIPE':
      return invoice.stripe_pi_id
        ? `[https://dashboard.stripe.com/payments/${invoice.stripe_pi_id}](https://dashboard.stripe.com/payments/${invoice.stripe_pi_id})`
        : 'N/A';
    case 'PAYPALFF':
      return invoice.paypalff_note ? `Note: "${invoice.paypalff_note}"` : 'N/A';
    case 'SUMUP':
      return invoice.sumup_checkout_id ? `Checkout ID: "${invoice.sumup_checkout_id}"` : 'N/A';
    case 'MOLLIE':
      return invoice.mollie_transaction_id ? `Payment ID: "${invoice.mollie_transaction_id}"` : 'N/A';
    case 'SKRILL':
      return invoice.skrill_transaction_id ? `Transaction ID: "${invoice.skrill_transaction_id}"` : 'N/A';
    default:
      return 'N/A';
  }
};

export default {
  data: new SlashCommandBuilder()
    .setName('invoice-view')
    .setDescription('View an invoice details.')
    .addStringOption((option) => option.setName('id').setDescription('The invoice ID to search for').setRequired(true))
    .addStringOption(option =>
      option.setName('visibility')
        .setDescription('Who can see the result?')
        .setRequired(false)
        .addChoices(
          { name: '🔒 Only me (private)', value: 'private' },
          { name: '👥 Everyone (public)', value: 'public' }
        )),

  onlyWhitelisted: true,
  requiredRole: 'staff',

  async execute(interaction, api) {
    const shopId = api.shopId;
    const id = interaction.options.getString('id');
    const visibility = interaction.options.getString('visibility') || 'private';
    const isPrivate = visibility === 'private';

    let invoiceId = id;

    if (invoiceId.includes('-')) {
      invoiceId = Number(id.split('-')[1]);
    }

    try {
      await interaction.deferReply({ ephemeral: isPrivate });

      let invoice = await api.get(`shops/${shopId}/invoices/${invoiceId}`);

      if (!invoice) {
        await interaction.editReply({ content: `❌ No invoice found with the id: ${id}` });
        return;
      }

      // Extract product and variant from items array if available
      let productName = 'N/A';
      let variantName = 'N/A';
      let deliverables = 'N/A';
      let deliverableItems = [];
      let customerDelivered = 'N/A';
      let customerDeliveredItems = [];

      if (invoice.items && Array.isArray(invoice.items) && invoice.items.length > 0) {
        const item = invoice.items[0];
        productName = item.product?.name || 'N/A';
        variantName = item.variant?.name || 'N/A';
        
        // Try to get deliverables for this item
        if (item.product_id && item.variant_id) {
          try {
            const deliverablesData = await api.get(
              `shops/${shopId}/products/${item.product_id}/deliverables/${item.variant_id}`
            );
            
            let items = [];
            if (typeof deliverablesData === 'string') {
              items = deliverablesData.split('\n').filter(i => i.trim());
            } else if (deliverablesData?.deliverables && typeof deliverablesData.deliverables === 'string') {
              items = deliverablesData.deliverables.split('\n').filter(i => i.trim());
            }
            
            if (items.length > 0) {
              deliverableItems = items;
              deliverables = items.join('\n');
            }
          } catch (e) {
            // Silently fail
          }
        }
      }

      // Get what was actually delivered to this customer
      if (invoice.delivered) {
        const delivered = formatDelivered(invoice.delivered);
        if (delivered !== 'N/A') {
          const lines = delivered.split('\n').filter(l => l.trim());
          customerDeliveredItems = lines;
          customerDelivered = delivered;
        }
      }

      const paymentTime = getPaymentTime(invoice.completed_at);

      const fields = [
        { name: 'ID', value: `\`${invoice.unique_id}\`` },
        { name: 'Status', value: invoice.status.replace(/_/g, ' ').toUpperCase(), inline: true },
        { name: 'Price', value: formatPrice(invoice.price, invoice.currency), inline: true },
        { name: '⏰ Payment Time', value: paymentTime, inline: true },
        { name: '📦 Product', value: productName, inline: true },
        { name: '🎮 Variant', value: variantName, inline: true },
        { name: 'Email', value: `\`${invoice.email}\``, inline: true },
        { name: 'Coupon', value: formatCoupon(invoice.coupon) },
        { name: 'Custom Fields', value: formatCustomFields(invoice.custom_fields) },
        { name: 'Gateway', value: invoice.gateway, inline: true },
        { name: 'Gateway Info', value: formatGatewayInfo(invoice), inline: true },
        { 
          name: `✅ Delivered to Customer (${customerDeliveredItems.length} items)`, 
          value: customerDelivered !== 'N/A' ? `\`\`\`\n${customerDelivered}\`\`\`` : 'N/A' 
        },
        { 
          name: `📦 Current Stock (${deliverableItems.length} items)`, 
          value: deliverables.length > 0 ? `\`\`\`\n${deliverables}\`\`\`` : 'N/A' 
        },
        { name: 'Created At', value: `<t:${Math.floor(new Date(invoice.created_at).getTime() / 1000)}:F>`, inline: true },
        {
          name: 'Completed At',
          value: invoice.completed_at ? `<t:${Math.floor(new Date(invoice.completed_at).getTime() / 1000)}:F>` : 'N/A',
          inline: true
        },
        { name: 'IP Address', value: `\`${invoice.ip}\`` }
      ];

      const embed = new EmbedBuilder()
        .setTitle('📋 Invoice Details')
        .setColor('#6571ff')
        .setTimestamp()
        .addFields(fields);

      await interaction.editReply({ embeds: [embed] });

      console.log(`[INVOICE-VIEW] User ${interaction.user.username} viewed invoice ${invoice.unique_id}`);
    } catch (error) {
      console.error('Error viewing invoice:', error);
      await interaction.editReply({ content: `❌ Failed to view invoice: ${error.message}` });
    }
  }
};
