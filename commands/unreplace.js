import { SlashCommandBuilder } from 'discord.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { loadVariantsData } from '../utils/dataLoader.js';
import { parseDeliverables } from '../utils/parseDeliverables.js';
import { ErrorLog } from '../utils/errorLogger.js';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';
import { getHistory, restoreFromHistory, saveHistory } from '../utils/historyManager.js';

const variantsDataPath = join(process.cwd(), 'variantsData.json');

export default {
  data: new SlashCommandBuilder()
    .setName('unreplace')
    .setDescription('Restore the last item(s) removed from stock')
    .addIntegerOption((option) =>
      option
        .setName('count')
        .setDescription('Number of recent removals to restore (default: 1)')
        .setRequired(false)
        .setMinValue(1)
    ),

  onlyWhitelisted: true,
  requiredRole: 'staff',

  async execute(interaction, api) {
    const startTime = Date.now();
    const count = interaction.options.getInteger('count') || 1;

    // Validate count
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      await interaction.reply({
        content: `❌ Número inválido. Debe ser entre 1 y 100.`,
        ephemeral: true
      });
      return;
    }

    try {
      await AdvancedCommandLogger.logCommand(interaction, 'unreplace');
      try {
        await interaction.deferReply({ ephemeral: true });
      } catch (deferError) {
        console.error(`[UNREPLACE] Defer error: ${deferError.message}`);
        return;
      }

      const historyData = getHistory();

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

      const toRestore = restoreFromHistory(count);
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
          const deliverablesArray = parseDeliverables(deliverablesData);

          // Restore the actual removed items
          const restoredArray = [...removedItems, ...deliverablesArray];
          const newDeliverablesString = restoredArray.join('\n');
          const newStock = restoredArray.length;

          // Update API
          try {
            await api.put(`shops/${api.shopId}/products/${productId}/deliverables/overwrite/${variantId}`, {
              deliverables: newDeliverablesString
            });
            console.log(`[UNREPLACE] API updated: ${productId}/${variantId}`);
          } catch (putError) {
            console.error(`[UNREPLACE] API PUT failed: ${putError.message}`);
            throw putError;
          }

          // Update cache ONLY after successful API update
          try {
            const variantsDataPath = join(process.cwd(), 'variantsData.json');
            const variantsData = loadVariantsData();
            if (variantsData[productId.toString()]?.variants[variantId.toString()]) {
              variantsData[productId.toString()].variants[variantId.toString()].stock = newStock;
              writeFileSync(variantsDataPath, JSON.stringify(variantsData, null, 2));
              console.log(`[UNREPLACE CACHE] Updated: ${productId}/${variantId} - New stock: ${newStock}`);
            }
          } catch (cacheError) {
            console.error(`[UNREPLACE] Cache update error: ${cacheError.message}`);
          }

          restoredInfo.push({
            product: productName,
            variant: variantName,
            count: removedItems.length
          });
          totalItemsRestored += removedItems.length;
        } catch (error) {
          console.error(`[UNREPLACE] Error restoring item:`, error);
          ErrorLog.log('unreplace', error, {
            stage: 'RESTORE_ITEM',
            productId,
            variantId,
            itemIndex: toRestore.indexOf(replacement),
            userId: interaction.user.id,
            userName: interaction.user.username
          });
          await interaction.editReply({
            content: `❌ Error restaurando: ${error.message || 'Error desconocido'}`
          });
          return;
        }
      }

      saveHistory();

      let responseMsg = `✅ Restaurados **${totalItemsRestored}** item(s)!\n\n`;
      restoredInfo.forEach((info, idx) => {
        responseMsg += `${idx + 1}. **${info.product}** - ${info.variant}\n   → ${info.count} item(s) restaurado(s)\n`;
      });

      await interaction.editReply({ content: responseMsg });
      console.log(`[UNREPLACE] ✅ SUCCESS: Restored ${totalItemsRestored} items`);
    } catch (error) {
      console.error('[UNREPLACE] Error:', error);
      ErrorLog.log('unreplace', error, {
        stage: 'OUTER_EXCEPTION',
        count,
        userId: interaction.user.id,
        userName: interaction.user.username
      });
      try {
        await interaction.editReply({
          content: `❌ Error: ${error.message || 'Error desconocido'}`
        });
      } catch (e) {
        console.error('[UNREPLACE] Could not send error message:', e.message);
        ErrorLog.log('unreplace', e, {
          stage: 'REPLY_FAILURE',
          userId: interaction.user.id,
          userName: interaction.user.username
        });
      }
    }
  }
};
