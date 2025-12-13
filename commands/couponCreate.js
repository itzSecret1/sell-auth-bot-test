import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('coupon-create')
    .setDescription('Add a coupon.')
    .addStringOption((option) => option.setName('code').setDescription('Coupon code').setRequired(true))
    .addBooleanOption((option) => option.setName('global').setDescription('Is the coupon global?').setRequired(true))
    .addNumberOption((option) => option.setName('discount').setDescription('Discount amount').setRequired(true))
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Discount type: percentage or fixed')
        .setRequired(true)
        .addChoices({ name: 'Percentage', value: 'percentage' }, { name: 'Fixed', value: 'fixed' })
    )
    .addNumberOption((option) =>
      option.setName('max_uses').setDescription('Maximum uses for the coupon').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('expiration_date').setDescription('Expiration date (e.g., 2024-09-25T12:35:22)').setRequired(true)
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
    const code = interaction.options.getString('code');
    const global = interaction.options.getBoolean('global');
    const discount = interaction.options.getNumber('discount');
    const type = interaction.options.getString('type');
    const maxUses = interaction.options.getNumber('max_uses');
    const expirationDate = interaction.options.getString('expiration_date');
    const allowedEmails = interaction.options.getString('allowed_emails')?.split(',') || [];
    let products = interaction.options.getString('products')?.split(',') || [];

    // Remove products if the coupon is global
    if (global) {
      products = [];
    }

    const couponData = {
      code,
      global,
      discount,
      type,
      max_uses: maxUses,
      expiration_date: expirationDate,
      allowed_emails: allowedEmails,
      products
    };

    try {
      await api.post(`shops/${api.shopId}/coupons`, couponData);

      const embed = new EmbedBuilder()
        .setTitle('Coupon Created')
        .setDescription(`Coupon \`${code}\` has been successfully created.`)
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
      return interaction.reply({ content: 'There was an error creating the coupon.', ephemeral: true });
    }
  }
};
