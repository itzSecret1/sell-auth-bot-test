import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('test-deliverables')
    .setDescription('Test deliverables endpoint (Admin only)')
    .addStringOption(option => 
      option.setName('product-id')
        .setDescription('Product ID')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('variant-id')
        .setDescription('Variant ID')
        .setRequired(true)),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction, api) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const productId = interaction.options.getString('product-id');
      const variantId = interaction.options.getString('variant-id');

      console.log(`[TEST] Testing deliverables for product ${productId}, variant ${variantId}`);

      const response = await api.get(
        `shops/${api.shopId}/products/${productId}/deliverables/${variantId}`
      );

      console.log(`[TEST] Response type:`, typeof response);
      console.log(`[TEST] Response:`, response);
      console.log(`[TEST] Response keys:`, response ? Object.keys(response) : 'null');

      let result = `**Response Type:** ${typeof response}\n\n`;
      result += `**Raw Response:**\n\`\`\`json\n${JSON.stringify(response, null, 2).slice(0, 1000)}\n\`\`\``;

      await interaction.editReply({ content: result });
    } catch (error) {
      console.error('Test error:', error);
      await interaction.editReply({ 
        content: `❌ Error: ${error.message}\n\nFull error: ${JSON.stringify(error, null, 2).slice(0, 500)}` 
      });
    }
  }
};
