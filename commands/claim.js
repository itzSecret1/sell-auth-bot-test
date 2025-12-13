import { SlashCommandBuilder } from 'discord.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { config } from '../utils/config.js';

// Initialize claims data storage
const claimsFilePath = join(process.cwd(), 'claims.json');
let claimsData = {};

if (existsSync(claimsFilePath)) {
  claimsData = JSON.parse(readFileSync(claimsFilePath, 'utf-8'));
} else {
  writeFileSync(claimsFilePath, JSON.stringify(claimsData));
}

export default {
  data: new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim a Customer role with a shop invoice')
    .addStringOption(option => 
      option.setName('invoice_id')
        .setDescription('Invoice ID')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('email')
        .setDescription('The email associated with the invoice')
        .setRequired(true)),

  async execute(interaction, api) {
    const invoiceIdInput = interaction.options.getString('invoice_id');
    const userEmail = interaction.options.getString('email');

    // Process the invoice ID
    let invoiceId = invoiceIdInput.includes('-') ? 
      invoiceIdInput.split('-').pop() : 
      invoiceIdInput;
    invoiceId = invoiceId.replace(/^0+/, ''); // Trim leading zeros

    // Check if already claimed
    if (claimsData[invoiceId]) {
      await interaction.reply({ 
        content: `Customer role has already been claimed via invoice ${invoiceId}.`, 
        ephemeral: true 
      });
      return;
    }

    try {
      const invoiceData = await api.get(`shops/${api.shopId}/invoices/${invoiceId}`);

      // Verify email matches
      if (invoiceData.email !== userEmail) {
        await interaction.reply({ 
          content: 'The provided email does not match the invoice\'s email.', 
          ephemeral: true 
        });
        return;
      }

      // Check if paid
      if (invoiceData.completed_at) {
        // Add role if configured
        if (config.BOT_CUSTOMER_ROLE_ID) {
          const customerRole = interaction.guild.roles.cache.get(config.BOT_CUSTOMER_ROLE_ID);
          if (customerRole) {
            await interaction.member.roles.add(customerRole);
          }
        }

        // Save claim
        claimsData[invoiceId] = interaction.user.id;
        writeFileSync(claimsFilePath, JSON.stringify(claimsData, null, 2));

        await interaction.reply({ 
          content: `Customer role claimed successfully via invoice ${invoiceId}!`, 
          ephemeral: true 
        });
      } else {
        await interaction.reply({ 
          content: `Invoice ${invoiceId} has not been paid yet.`, 
          ephemeral: true 
        });
      }
    } catch (error) {
      console.error('Error claiming role:', error);
      await interaction.reply({ 
        content: 'An error occurred while processing your request.', 
        ephemeral: true 
      });
    }
  }
};