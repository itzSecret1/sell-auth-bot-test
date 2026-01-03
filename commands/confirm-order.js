import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { PendingOrders } from '../utils/PendingOrders.js';
import { config } from '../utils/config.js';
import { GuildConfig } from '../utils/GuildConfig.js';
import { loadVariantsData } from '../utils/dataLoader.js';
import { parseDeliverables } from '../utils/parseDeliverables.js';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { addToHistory } from '../utils/historyManager.js';
import { ErrorLog } from '../utils/errorLogger.js';

const variantsDataPath = join(process.cwd(), 'variantsData.json');

async function getVariantStock(api, productId, variantId) {
  if (!productId || !variantId) {
    console.error('[STOCK CHECK] Missing productId or variantId');
    return [];
  }

  try {
    const deliverablesData = await api.get(`shops/${api.shopId}/products/${productId}/deliverables/${variantId}`);
    const items = parseDeliverables(deliverablesData);
    return items;
  } catch (e) {
    console.error(`[STOCK CHECK ERROR] Product ${productId}, Variant ${variantId}: ${e.message}`);
    return [];
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('confirm-order')
    .setDescription('Confirm a pending order (Owner only)')
    .addStringOption((option) =>
      option
        .setName('order_id')
        .setDescription('ID of the order to confirm')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  onlyWhitelisted: true,
  requiredRole: 'staff', // Trial staff can use this
  // No requiere requiredRole porque verificamos manualmente con GuildConfig

  async autocomplete(interaction, api) {
    try {
      const focusedValue = interaction.options.getFocused();
      const pendingOrders = PendingOrders.getAllPendingOrders();
      
      // NO mostrar información del ticket/producto, solo usuario y cantidad
      const filtered = pendingOrders
        .filter(order => 
          order.id.toLowerCase().includes(focusedValue.toLowerCase()) ||
          order.userName.toLowerCase().includes(focusedValue.toLowerCase())
        )
        .slice(0, 25)
        .map(order => ({
          name: `${order.id} - ${order.userName} (${order.quantity} items)`,
          value: order.id
        }));

      await interaction.respond(filtered);
    } catch (error) {
      console.error('[CONFIRM-ORDER] Autocomplete error:', error);
      await interaction.respond([]).catch(() => {});
    }
  },

  async execute(interaction, api) {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Verificar que el usuario tenga rol de admin en este servidor
      const guildConfig = GuildConfig.getConfig(interaction.guild.id);
      const adminRoleId = guildConfig?.adminRoleId || config.BOT_ADMIN_ROLE_ID;
      
      if (!adminRoleId || !interaction.member.roles.cache.has(adminRoleId)) {
        await interaction.editReply({
          content: '❌ You do not have permission to use this command. You need the administrator role.'
        });
        return;
      }

      const orderId = interaction.options.getString('order_id');
      const order = PendingOrders.getPendingOrder(orderId);

      if (!order) {
        await interaction.editReply({
          content: `❌ Order not found: ${orderId}`
        });
        return;
      }

      if (order.status !== 'pending') {
        await interaction.editReply({
          content: `❌ This order has already been processed (Status: ${order.status})`
        });
        return;
      }

      // Confirmar la orden
      const confirmResult = PendingOrders.confirmOrder(
        orderId,
        interaction.user.id,
        interaction.user.username
      );

      if (!confirmResult.success) {
        await interaction.editReply({
          content: `❌ Error confirming order: ${confirmResult.message}`
        });
        return;
      }

      // Obtener el usuario que hizo la orden
      const user = await interaction.guild.members.fetch(order.userId).catch(() => null);

      // Procesar el replace
      try {
        const variantsData = loadVariantsData();
        const productData = variantsData[order.productId.toString()];
        
        if (!productData) {
          await interaction.editReply({
            content: `❌ Product not found in cache`
          });
          return;
        }

        const variantData = productData.variants?.[order.variantId.toString()];
        if (!variantData) {
          await interaction.editReply({
            content: `❌ Variant not found in cache`
          });
          return;
        }

        // Obtener stock actual
        const deliverablesArray = await getVariantStock(api, order.productId, order.variantId);

        if (deliverablesArray.length < order.quantity) {
          await interaction.editReply({
            content: `❌ Insufficient stock. Available: ${deliverablesArray.length}, Requested: ${order.quantity}`
          });
          // Rechazar la orden
          PendingOrders.rejectOrder(orderId);
          return;
        }

        // Remover items
        const itemsCopy = [...deliverablesArray];
        const removedItems = itemsCopy.splice(0, order.quantity);
        const newDeliverablesString = itemsCopy.join('\n');
        const remainingStock = itemsCopy.length;

        // Actualizar API
        await api.put(
          `shops/${api.shopId}/products/${order.productId}/deliverables/overwrite/${order.variantId}`,
          { deliverables: newDeliverablesString }
        );

        // Actualizar caché
        variantsData[order.productId.toString()].variants[order.variantId.toString()].stock = remainingStock;
        writeFileSync(variantsDataPath, JSON.stringify(variantsData, null, 2));

        // Agregar al historial
        addToHistory(
          order.productId,
          order.productName,
          removedItems,
          order.variantId,
          order.variantName
        );

        // Enviar mensaje privado al usuario
        try {
          const userMember = await interaction.guild.members.fetch(order.userId);
          const dmChannel = await userMember.user.createDM();
          
          const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('✅ Order Confirmed')
            .setDescription(`Your order **${orderId}** has been confirmed and processed.`)
            .addFields(
              {
                name: '🏪 Product',
                value: order.productName,
                inline: true
              },
              {
                name: '🎮 Variant',
                value: order.variantName,
                inline: true
              },
              {
                name: '📦 Quantity',
                value: order.quantity.toString(),
                inline: true
              },
              {
                name: '📋 Extracted Items',
                value: removedItems.slice(0, 10).map((item, i) => `${i + 1}. ${item.substring(0, 80)}`).join('\n') + 
                  (removedItems.length > 10 ? `\n... and ${removedItems.length - 10} more` : ''),
                inline: false
              }
            )
            .setTimestamp();

          await dmChannel.send({ embeds: [embed] });
        } catch (dmError) {
          console.error('[CONFIRM-ORDER] Error sending DM:', dmError);
        }

        // Responder al owner (sin mostrar información del ticket, solo lo básico)
        const confirmEmbed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✅ Order Confirmed and Processed')
          .setDescription(`The order has been confirmed successfully.`)
          .addFields(
            {
              name: '👤 User',
              value: user ? `${user}` : order.userName,
              inline: true
            },
            {
              name: '📦 Processed Quantity',
              value: order.quantity.toString(),
              inline: true
            },
            {
              name: '📊 Remaining Stock',
              value: remainingStock.toString(),
              inline: true
            }
          )
          .setTimestamp();

        await interaction.editReply({
          content: `${user ? user : `Usuario ${order.userName}`}`,
          embeds: [confirmEmbed]
        });

        // Eliminar la orden
        PendingOrders.deleteOrder(orderId);

      } catch (processError) {
        console.error('[CONFIRM-ORDER] Error processing order:', processError);
        ErrorLog.log('confirm-order', processError, {
          orderId,
          userId: order.userId,
          productId: order.productId,
          variantId: order.variantId,
          quantity: order.quantity
        });

        await interaction.editReply({
          content: `❌ Error processing the order: ${processError.message}`
        });
      }

    } catch (error) {
      console.error('[CONFIRM-ORDER] Error:', error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`
      }).catch(() => {});
    }
  }
};

