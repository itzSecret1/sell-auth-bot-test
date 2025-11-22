import { SlashCommandBuilder } from 'discord.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const historyFilePath = join(process.cwd(), 'replaceHistory.json');
const variantsDataPath = join(process.cwd(), 'variantsData.json');

let historyData = [];

if (existsSync(historyFilePath)) {
  historyData = JSON.parse(readFileSync(historyFilePath, 'utf-8'));
}

function saveHistory() {
  writeFileSync(historyFilePath, JSON.stringify(historyData, null, 2));
}

function loadVariantsData() {
  if (existsSync(variantsDataPath)) {
    try {
      return JSON.parse(readFileSync(variantsDataPath, 'utf-8'));
    } catch (e) {
      return {};
    }
  }
  return {};
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
          } else if (deliverablesData?.content && typeof deliverablesData.content === 'string') {
            deliverablesArray = deliverablesData.content.split('\n').filter(item => item.trim());
          } else if (Array.isArray(deliverablesData)) {
            deliverablesArray = deliverablesData.map(item => {
              if (typeof item === 'string') return item.trim();
              if (typeof item === 'object' && item?.value) return item.value;
              return String(item).trim();
            }).filter(item => item);
          } else if (deliverablesData?.items && Array.isArray(deliverablesData.items)) {
            deliverablesArray = deliverablesData.items.map(item => {
              if (typeof item === 'string') return item.trim();
              if (typeof item === 'object' && item?.value) return item.value;
              return String(item).trim();
            }).filter(item => item);
          }

          // Restore the actual removed items
          const restoredArray = [...removedItems, ...deliverablesArray];
          const newDeliverablesString = restoredArray.join('\n');
          const newStock = restoredArray.length;
          
          // Update API
          try {
            await api.put(
              `shops/${api.shopId}/products/${productId}/deliverables/overwrite/${variantId}`,
              { deliverables: newDeliverablesString }
            );
            console.log(`[UNREPLACE] API updated: ${productId}/${variantId}`);
          } catch (putError) {
            console.error(`[UNREPLACE] API PUT failed: ${putError.message}`);
            throw putError;
          }

          // Update cache ONLY after successful API update
          try {
            const variantsData = loadVariantsData();
            if (variantsData[productId.toString()]?.variants[variantId.toString()]) {
              variantsData[productId.toString()].variants[variantId.toString()].stock = newStock;
              writeFileSync(variantsDataPath, JSON.stringify(variantsData, null, 2));
              console.log(`[UNREPLACE CACHE] Updated: ${productId}/${variantId} - New stock: ${newStock}`);
            }
          } catch (cacheError) {
            console.error(`[UNREPLACE] Cache update error: ${cacheError.message}`);
            // Don't fail - API was already updated
          }

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
