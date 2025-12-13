import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('coupon-view')
    .setDescription('View a coupon.')
    .addStringOption((option) =>
      option.setName('code').setDescription('The coupon code to search for').setRequired(true)
    ),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction, api) {
    const shopId = api.shopId;
    const code = interaction.options.getString('code');

    try {
      // TODO: Search by ?search parameter for the next update.

      let coupons = (await api.get(`shops/${shopId}/coupons`)) || [];

      const coupon = coupons.find((coupon) => coupon.code === code);

      if (!coupon) {
        await interaction.reply({ content: `No coupon found with the code: ${code}`, ephemeral: true });
        return;
      }

      // Create an embed for the single coupon
      const embed = new EmbedBuilder()
        .setTitle('Coupon Details')
        .setColor('#6571ff')
        .setTimestamp()
        .addFields([
          { name: 'Code', value: coupon.code },
          { name: 'Discount', value: coupon.type === 'percentage' ? `${coupon.discount}%` : `$${coupon.discount}` },
          {
            name: 'Expiration Date',
            value: coupon.expiration_date ? new Date(coupon.expiration_date).toLocaleString() : 'No Expiration Date'
          },
          { name: 'Uses', value: `${coupon.uses}/${coupon.max_uses || '∞'}` },
          {
            name: 'Allowed Emails',
            value: coupon.allowed_emails?.length ? coupon.allowed_emails.join(', ') : 'All Emails'
          },
          {
            name: 'Products',
            value: coupon.products.length ? coupon.products.map((product) => product.name).join(', ') : 'All Products'
          }
        ]);

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error viewing coupon:', error);
      await interaction.reply({ content: 'Failed to view coupon.', ephemeral: true });
    }
  }
};
