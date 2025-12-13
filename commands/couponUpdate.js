import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('coupon-update')
    .setDescription('Edit an existing coupon.')
    .addStringOption((option) => option.setName('code').setDescription('Coupon code').setRequired(true))
    .addBooleanOption((option) => option.setName('global').setDescription('Is the coupon global?').setRequired(false))
    .addNumberOption((option) => option.setName('discount').setDescription('Discount amount').setRequired(false))
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Discount type: percentage or fixed')
        .setRequired(false)
        .addChoices({ name: 'Percentage', value: 'percentage' }, { name: 'Fixed', value: 'fixed' })
    )
    .addNumberOption((option) =>
      option.setName('max_uses').setDescription('Maximum uses for the coupon').setRequired(false)
    )
    .addStringOption((option) =>
      option.setName('expiration_date').setDescription('Expiration date (e.g., 2024-09-25T12:35:22)').setRequired(false)
    )
    .addStringOption((option) =>
      option.setName('allowed_emails').setDescription('Allowed emails (comma-separated)').setRequired(false)
    )
    .addStringOption((option) =>
      option.setName('products').setDescription('Applicable product IDs (comma-separated)').setRequired(false)
    ),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction, api) {
    const shopId = api.shopId;
    const code = interaction.options.getString('code');

    // TODO: Add endpoint to get a single coupon by code

    // Get all coupons and find the one with the provided code
    let couponData;
    try {
      const coupons = await api.get(`shops/${shopId}/coupons`);
      couponData = coupons.find((coupon) => coupon.code === code);
    } catch (error) {
      console.error(error);
      return interaction.reply({ content: 'Failed to load coupons.', ephemeral: true });
    }

    // Check if the coupon was found
    if (!couponData) {
      return interaction.reply({ content: 'Coupon not found.', ephemeral: true });
    }

    // Update the coupon data with the provided options
    const global = interaction.options.getBoolean('global') ?? couponData.global;
    const discount = interaction.options.getNumber('discount') ?? couponData.discount;
    const type = interaction.options.getString('type') ?? couponData.type;
    const maxUses = interaction.options.getNumber('max_uses') ?? couponData.max_uses;
    const expirationDate = interaction.options.getString('expiration_date') ?? couponData.expiration_date;
    const allowedEmails = interaction.options.getString('allowed_emails')?.split(',') ?? couponData.allowed_emails;
    let products = interaction.options.getString('products')?.split(',') ?? couponData.products;

    // Remove products if the coupon is global
    if (global) {
      products = [];
    }

    // Create the updated coupon data object
    const updatedCouponData = {
      code,
      global,
      discount,
      type,
      max_uses: maxUses,
      expiration_date: expirationDate,
      allowed_emails: allowedEmails,
      products
    };

    // Send the updated coupon data to the server
    try {
      await api.put(`shops/${shopId}/coupons/${couponData.id}/update`, updatedCouponData);

      const embed = new EmbedBuilder()
        .setTitle('Coupon Updated')
        .setDescription(`Coupon \`${code}\` has been successfully updated.`)
        .setColor('#6571ff')
        .addFields(
          { name: 'Discount', value: `${discount} (${type})`, inline: true },
          { name: 'Global', value: global ? 'Yes' : 'No', inline: true },
          { name: 'Max Uses', value: maxUses?.toString() ?? '∞', inline: true },
          { name: 'Expires On', value: expirationDate, inline: true }
        );

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error(error);
      return interaction.reply({ content: 'There was an error updating the coupon.', ephemeral: true });
    }
  }
};
