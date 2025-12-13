import { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const formatCoupon = (coupon, isSingle) => {
  const { code, type, discount, expiration_date, uses, max_uses, products } = coupon;

  const valueStr = `${type === 'percentage' ? `${discount}%` : `$${discount}`}`;
  const expirationStr = expiration_date
    ? `Expires at ${new Date(expiration_date).toLocaleString()}`
    : 'No Expiration Date';
  const redeemedStr = `${uses}/${max_uses || '∞'}`;
  const allowedEmailsStr = coupon.allowed_emails?.length ? coupon.allowed_emails.join(', ') : 'All Emails';

  let productStr = '';

  if (global) {
    productStr = 'All Products';
  } else if (products.length === 0) {
    productStr = 'No Products';
  } else if (isSingle) {
    productStr = products.map((product) => product.name).join(', ');
  } else {
    // When listing multiple coupons, only show the first 2 products
    productStr = products
      .slice(0, 2)
      .map((product) => product.name)
      .join(', ');
    if (products.length > 2) {
      productStr += ` and ${products.length - 2} more`;
    }
  }

  return `**${code}**: ${valueStr} • ${expirationStr} • ${redeemedStr} • ${allowedEmailsStr} • ${productStr}`;
};

export default {
  data: new SlashCommandBuilder().setName('coupon-list').setDescription('List all coupons.'),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction, api) {
    const shopId = api.shopId;
    const pageSize = 10; // Number of coupons per page
    let page = 1; // Current page

    try {
      // TODO: Implement server-side pagination for the next update.

      let couponsResponse = await api.get(`shops/${shopId}/coupons`);
      
      // Handle if API returns an object with data property or direct array
      let coupons = Array.isArray(couponsResponse) ? couponsResponse : (couponsResponse?.data || []);

      const totalPages = Math.ceil(coupons.length / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = Math.min(startIndex + pageSize, coupons.length);
      const currentCoupons = coupons.slice(startIndex, endIndex);

      const embed = new EmbedBuilder().setTitle('Coupon List').setColor('#6571ff');

      if (currentCoupons.length === 0) {
        embed.setDescription('No coupons found.');
      } else {
        embed.setDescription(currentCoupons.map((coupon) => formatCoupon(coupon, false)).join('\n'));
        embed.setFooter({ text: `Page ${page} of ${totalPages}` });
      }

      const components = [];
      if (totalPages > 1) {
        const row = new ActionRowBuilder();
        if (page > 1) {
          row.addComponents(
            new ButtonBuilder().setCustomId('coupon-list-prev').setLabel('Previous').setStyle(ButtonStyle.Primary)
          );
        }
        if (page < totalPages) {
          row.addComponents(
            new ButtonBuilder().setCustomId('coupon-list-next').setLabel('Next').setStyle(ButtonStyle.Primary)
          );
        }
        components.push(row);
      }

      const initialResponse = await interaction.reply({ embeds: [embed], components: components, fetchReply: true });

      if (totalPages > 1) {
        const collector = interaction.channel.createMessageComponentCollector({
          filter: (i) => i.user.id === interaction.user.id && i.message.id === initialResponse.id,
          time: 15000
        });

        collector.on('collect', async (i) => {
          if (i.customId === 'coupon-list-prev') page--;
          else if (i.customId === 'coupon-list-next') page++;

          const startIndex = (page - 1) * pageSize;
          const endIndex = Math.min(startIndex + pageSize, coupons.length);
          const currentCoupons = coupons.slice(startIndex, endIndex);

          embed.setDescription(
            currentCoupons.length === 0
              ? 'No coupons found.'
              : currentCoupons.map((coupon) => formatCoupon(coupon, false)).join('\n')
          );
          embed.setFooter({ text: `Page ${page} of ${totalPages}` });

          const newComponents = [];
          const row = new ActionRowBuilder();
          if (page > 1)
            row.addComponents(
              new ButtonBuilder().setCustomId('coupon-list-prev').setLabel('Previous').setStyle(ButtonStyle.Primary)
            );
          if (page < totalPages)
            row.addComponents(
              new ButtonBuilder().setCustomId('coupon-list-next').setLabel('Next').setStyle(ButtonStyle.Primary)
            );
          if (row.components.length > 0) newComponents.push(row);

          await i.update({ embeds: [embed], components: newComponents });
        });

        collector.on('end', (collected) => {
          if (collected.size === 0) {
            interaction.editReply({ components: [] });
          }
        });
      }
    } catch (error) {
      console.error('Error listing coupons:', error);
      await interaction.reply({ content: 'Failed to list coupons.', ephemeral: true });
    }
  }
};
