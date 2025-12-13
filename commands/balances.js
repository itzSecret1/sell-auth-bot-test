import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { formatPrice } from '../utils/formatPrice.js';

export default {
  data: new SlashCommandBuilder().setName('balances').setDescription('View your cryptocurrency balances.'),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction, api) {
    const shopId = api.shopId;

    try {
      const balances = (await api.get(`shops/${shopId}/payouts/balances`)) || [];

      const embed = new EmbedBuilder()
        .setTitle('Balances')
        .setColor('#6571ff')
        .setTimestamp()
        .addFields([
          { name: 'Bitcoin', value: `${balances.btc.btc} ₿ (${formatPrice(balances.btc.usd, 'USD')})` },
          { name: 'Litecoin', value: `${balances.ltc.ltc} Ł (${formatPrice(balances.ltc.usd, 'USD')})` }
        ]);

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error viewing balances:', error);
      await interaction.reply({ content: 'Failed to view balances.', ephemeral: true });
    }
  }
};
