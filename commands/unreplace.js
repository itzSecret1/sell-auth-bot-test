import { SlashCommandBuilder } from 'discord.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const historyFilePath = join(process.cwd(), 'replaceHistory.json');

let historyData = [];

if (existsSync(historyFilePath)) {
  historyData = JSON.parse(readFileSync(historyFilePath, 'utf-8'));
}

function saveHistory() {
  writeFileSync(historyFilePath, JSON.stringify(historyData, null, 2));
}

export default {
  data: new SlashCommandBuilder()
    .setName('unreplace')
    .setDescription('Restore the last item(s) removed from stock')
    .addIntegerOption(option => 
      option.setName('count')
        .setDescription('Number of recent removals to restore (default: 1)')
        .setRequired(false)
        .setMinValue(1)),

  onlyWhitelisted: true,
  requiredRole: 'staff',

  async execute(interaction, api) {
    const count = interaction.options.getInteger('count') || 1;

    try {
      await interaction.deferReply({ ephemeral: true });

      if (existsSync(historyFilePath)) {
        historyData = JSON.parse(readFileSync(historyFilePath, 'utf-8'));
      }

      if (historyData.length === 0) {
        await interaction.editReply({ 
          content: `❌ No se encontró historial de reemplazos. Nada que restaurar.` 
        });
        return;
      }

      if (count > historyData.length) {
        await interaction.editReply({ 
          content: `❌ Solo hay ${historyData.length} reemplazo(s) en el historial. No se pueden restaurar ${count}.` 
        });
        return;
      }

      const toRestore = historyData.splice(-count);
      const restoredInfo = [];
      let totalItemsRestored = 0;

      for (const replacement of toRestore) {
        try {
          const productId = replacement.productId;
          const productName = replacement.productName;
          const removedItems = replacement.removedItems || [];
          const variantId = replacement.variantId || '0';
          const variantName = replacement.variantName || 'Unknown';

          const endpoint = `shops/${api.shopId}/products/${productId}/deliverables/${variantId}`;

          let deliverablesData = await api.get(endpoint);
          let deliverablesArray = [];
          
          if (typeof deliverablesData === 'string') {
            deliverablesArray = deliverablesData.split('\n').filter(item => item.trim());
          } else if (deliverablesData?.deliverables && typeof deliverablesData.deliverables === 'string') {
            deliverablesArray = deliverablesData.deliverables.split('\n').filter(item => item.trim());
          } else if (Array.isArray(deliverablesData)) {
            deliverablesArray = deliverablesData.filter(item => item && item.trim?.());
          }

          // Restore the actual removed items
          const restoredArray = [...removedItems, ...deliverablesArray];
          const newDeliverablesString = restoredArray.join('\n');
          
          await api.put(
            `shops/${api.shopId}/products/${productId}/deliverables/overwrite/${variantId}`,
            { deliverables: newDeliverablesString }
          );

          restoredInfo.push({
            product: productName,
            variant: variantName,
            count: removedItems.length
          });
          totalItemsRestored += removedItems.length;
        } catch (error) {
          console.error(`[UNREPLACE] Error:`, error);
          await interaction.editReply({ 
            content: `❌ Error restaurando: ${error.message || 'Error desconocido'}` 
          });
          return;
        }
      }

      saveHistory();

      let responseMsg = `✅ Restaurados **${count}** reemplazo(s)!\n\n`;
      restoredInfo.forEach((info, idx) => {
        responseMsg += `${idx + 1}. **${info.product}** - ${info.variant}\n   → ${info.count} item(s) restaurado(s)\n`;
      });
      responseMsg += `\n📦 Total items restaurados: **${totalItemsRestored}**`;

      await interaction.editReply({ content: responseMsg });
    } catch (error) {
      console.error('[UNREPLACE] Error:', error);
      await interaction.editReply({ 
        content: `❌ Error: ${error.message || 'Error desconocido'}` 
      });
    }
  }
};
