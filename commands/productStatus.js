import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

// emoji for status colors
const COLOR_EMOJIS = {
  '#e74c3c': '🔴',
  '#e67e22': '🟠',
  '#f1c40f': '🟡',
  '#2ecc71': '🟢',
  '#3498db': '🔵',
  'null': '⚪'
};

export default {
  data: new SlashCommandBuilder()
    .setName('product-status')
    .setDescription('Edit a product status.')
    .addStringOption((option) => 
      option.setName('id')
        .setDescription('The product ID')
        .setRequired(true))
    .addStringOption((option) => 
      option.setName('text')
        .setDescription('The status text')
        .setRequired(true))
    .addStringOption((option) =>
      option.setName('color')
        .setDescription('The status color')
        .setRequired(true)
        .addChoices(
          { name: '🔴 Red', value: '#e74c3c' },
          { name: '🟠 Orange', value: '#e67e22' },
          { name: '🟡 Yellow', value: '#f1c40f' },
          { name: '🟢 Green', value: '#2ecc71' },
          { name: '🔵 Blue', value: '#3498db' },
          { name: '⚪ Default', value: 'null' }
        )),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction, api) {
    const productId = interaction.options.getString('id');
    const statusText = interaction.options.getString('text');
    const statusColor = interaction.options.getString('color');
    
    try {
      await api.put(`shops/${api.shopId}/products/bulk-update/status`, {
        product_ids: [productId],
        status_color: statusColor === 'null' ? null : statusColor,
        status_text: statusText
      });

      const colorEmoji = COLOR_EMOJIS[statusColor] || '⚪';
      const embed = new EmbedBuilder()
        .setTitle('Product Status Updated')
        .setDescription(`Status updated for product: ${productId}`)
        .addFields(
          { name: 'Status Text', value: statusText, inline: true },
          { name: 'Status Color', value: colorEmoji, inline: true }
        )
        .setColor(statusColor === 'null' ? '#6571ff' : statusColor)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Error updating product status:', error);

      if (error.message == 'Invalid response') {
        if (error.response.status === 500) {
          return interaction.reply({ 
            content: 'Failed to update product status. Product not found.',
            ephemeral: true 
          });
        }
      }

      return interaction.reply({ 
        content: 'Failed to update product status. Error: ' + error.message,
        ephemeral: true 
      });
    }
  }
}; 
