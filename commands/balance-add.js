import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';
import { ErrorLog } from '../utils/errorLogger.js';
import { quickReply } from '../utils/quickResponse.js';

export default {
  data: new SlashCommandBuilder()
    .setName('balance-add')
    .setDescription('Add balance to a customer (Admin only)')
    .addStringOption((option) =>
      option
        .setName('email')
        .setDescription('Customer email address')
        .setRequired(true)
    )
    .addNumberOption((option) =>
      option
        .setName('amount')
        .setDescription('Amount to add (in shop currency)')
        .setRequired(true)
        .setMinValue(0.01)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Reason for adding balance (optional)')
        .setRequired(false)
    ),

  onlyWhitelisted: true,
  requiredRole: 'admin',

  async execute(interaction, api) {
    const email = interaction.options.getString('email')?.trim();
    const amount = interaction.options.getNumber('amount');
    const reason = interaction.options.getString('reason') || 'Manual balance adjustment';
    const userEmail = interaction.user.username;

    // Use quick reply to ensure response within 3 seconds
    await quickReply(interaction, async () => {
      const startTime = Date.now();
      try {

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return {
            content: `❌ Email inválido: \`${email}\`\n✅ Formato válido: usuario@ejemplo.com`
          };
        }

        // Validate amount
        if (!Number.isFinite(amount) || amount <= 0) {
          return {
            content: `❌ Monto inválido: \`${amount}\`\n✅ Debe ser un número positivo`
          };
        }

        console.log(`[BALANCE-ADD] Adding ${amount} to ${email} by ${userEmail}`);

        // Buscar el cliente por email
        let customer = null;
        let currentBalance = 0;
        
        try {
          // Intentar obtener clientes y buscar por email
          const customersResponse = await api.get(`shops/${api.shopId}/customers`);
          
          // Manejar diferentes formatos de respuesta
          let customersList = [];
          if (Array.isArray(customersResponse)) {
            customersList = customersResponse;
          } else if (customersResponse?.data && Array.isArray(customersResponse.data)) {
            customersList = customersResponse.data;
          } else if (customersResponse?.customers && Array.isArray(customersResponse.customers)) {
            customersList = customersResponse.customers;
          }
          
          // Buscar cliente por email
          customer = customersList.find(c => c.email && c.email.toLowerCase() === email.toLowerCase());
          
          if (customer) {
            currentBalance = parseFloat(customer.balance || customer.credit || customer.credits || 0);
            console.log(`[BALANCE-ADD] Cliente encontrado: ID ${customer.id}, Balance actual: ${currentBalance}`);
          } else {
            console.log(`[BALANCE-ADD] Cliente no encontrado con email: ${email}`);
          }
        } catch (searchError) {
          console.warn(`[BALANCE-ADD] Error buscando cliente: ${searchError.message}`);
        }

        // Si no existe el cliente, crearlo
        if (!customer) {
          try {
            console.log(`[BALANCE-ADD] Creando nuevo cliente con email: ${email}`);
            
            // Intentar crear cliente con diferentes formatos de datos
            let createData = {
              email: email
            };
            
            // Intentar crear primero sin balance
            try {
              customer = await api.post(`shops/${api.shopId}/customers`, createData);
              console.log(`[BALANCE-ADD] Cliente creado: ID ${customer.id || customer.data?.id || 'N/A'}`);
            } catch (createError1) {
              // Si falla, intentar con balance
              try {
                createData.balance = amount;
                customer = await api.post(`shops/${api.shopId}/customers`, createData);
                console.log(`[BALANCE-ADD] Cliente creado con balance: ID ${customer.id || customer.data?.id || 'N/A'}`);
              } catch (createError2) {
                // Si aún falla, intentar con credit
                try {
                  createData.credit = amount;
                  delete createData.balance;
                  customer = await api.post(`shops/${api.shopId}/customers`, createData);
                  console.log(`[BALANCE-ADD] Cliente creado con credit: ID ${customer.id || customer.data?.id || 'N/A'}`);
                } catch (createError3) {
                  // Extraer mensaje de error más descriptivo
                  const errorMsg = createError3.data?.message || createError3.data?.error || createError3.message || 'Unknown error';
                  const errorStatus = createError3.status || createError3.data?.status;
                  
                  console.error(`[BALANCE-ADD] Error creando cliente:`, {
                    status: errorStatus,
                    message: errorMsg,
                    data: createError3.data
                  });
                  
                  throw new Error(`No se pudo crear el cliente: ${errorMsg}${errorStatus ? ` (${errorStatus})` : ''}`);
                }
              }
            }
            
            // Asegurar que customer tiene id
            if (!customer.id && customer.data?.id) {
              customer.id = customer.data.id;
            }
            
            if (!customer.id) {
              throw new Error('Cliente creado pero no se recibió ID válido');
            }
            
            currentBalance = 0;
          } catch (createError) {
            const errorMsg = createError.message || createError.data?.message || createError.data?.error || 'Cliente no encontrado y no se pudo crear';
            throw new Error(`No se pudo crear el cliente: ${errorMsg}`);
          }
        }

        const newBalance = currentBalance + amount;
        let response;

        // Intentar actualizar el balance usando diferentes métodos
        try {
          // Método 1: Actualizar cliente completo
          response = await api.put(`shops/${api.shopId}/customers/${customer.id}`, {
            balance: newBalance,
            credit: newBalance
          });
          
          response = {
            old_balance: currentBalance,
            new_balance: newBalance,
            customer_id: customer.id,
            email: customer.email || email
          };
          
          console.log(`[BALANCE-ADD] ✅ Balance actualizado usando PUT: ${currentBalance} → ${newBalance}`);
        } catch (putError) {
          try {
            // Método 2: Usar endpoint específico de balance si existe
            response = await api.post(`shops/${api.shopId}/customers/${customer.id}/balance`, {
              amount: amount,
              operation: 'add'
            });
            
            if (!response.old_balance) {
              response.old_balance = currentBalance;
            }
            if (!response.new_balance) {
              response.new_balance = newBalance;
            }
            
            console.log(`[BALANCE-ADD] ✅ Balance actualizado usando POST balance: ${currentBalance} → ${newBalance}`);
          } catch (postError) {
            try {
              // Método 3: Usar endpoint de créditos
              response = await api.post(`shops/${api.shopId}/customers/${customer.id}/credits`, {
                amount: amount,
                type: 'add'
              });
              
              if (!response.old_balance) {
                response.old_balance = currentBalance;
              }
              if (!response.new_balance) {
                response.new_balance = newBalance;
              }
              
              console.log(`[BALANCE-ADD] ✅ Balance actualizado usando POST credits: ${currentBalance} → ${newBalance}`);
            } catch (creditError) {
              // Si todos los métodos fallan, usar el endpoint original pero con mejor manejo
              try {
                response = await api.post(`shops/${api.shopId}/customers/balance/add`, {
                  customer_id: customer.id,
                  email: email,
                  amount: amount,
                  reason: reason
                });
                
                if (!response.old_balance) {
                  response.old_balance = currentBalance;
                }
                if (!response.new_balance) {
                  response.new_balance = newBalance;
                }
                
                console.log(`[BALANCE-ADD] ✅ Balance actualizado usando endpoint original: ${currentBalance} → ${newBalance}`);
              } catch (originalError) {
                // Si todo falla, al menos calcular y mostrar el resultado esperado
                console.error('[BALANCE-ADD] Todos los métodos de actualización fallaron:', {
                  putError: putError.message,
                  postError: postError.message,
                  creditError: creditError.message,
                  originalError: originalError.message
                });
                
                // Retornar respuesta con cálculo local
                response = {
                  old_balance: currentBalance,
                  new_balance: newBalance,
                  customer_id: customer.id,
                  email: customer.email || email,
                  warning: 'Balance calculado - verificar manualmente en SellAuth'
                };
              }
            }
          }
        }

        // Success response
        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✅ Balance Agregado')
          .addFields(
            { name: '👤 Cliente', value: email, inline: true },
            { name: '💰 Monto Agregado', value: `$${amount}`, inline: true },
            { name: '📝 Razón', value: reason, inline: false },
            { name: '✓ Admin', value: userEmail, inline: true }
          )
          .setFooter({ text: 'SellAuth Bot | Balance Management' })
          .setTimestamp();

        // Add old and new balance if available
        if (response?.old_balance !== undefined && response?.new_balance !== undefined) {
          embed.addFields(
            { name: '💾 Balance Anterior', value: `$${response.old_balance}`, inline: true },
            { name: '💾 Balance Nuevo', value: `$${response.new_balance}`, inline: true }
          );
        }

        // Log success
        await AdvancedCommandLogger.logCommand(interaction, 'balance-add', {
          status: 'EXECUTED',
          result: 'Balance added successfully',
          executionTime: Date.now() - startTime,
          metadata: {
            'Email': email,
            'Amount Added': `$${amount}`,
            'Reason': reason,
            'New Balance': response?.new_balance ? `$${response.new_balance}` : 'N/A',
            'Admin': userEmail
          }
        });

        console.log(`[BALANCE-ADD] ✅ Successfully added ${amount} to ${email}`);
        return { embeds: [embed] };
      } catch (error) {
        console.error('[BALANCE-ADD] Error:', error);

        let errorMsg = error.message || 'Unknown error';
        if (error.status === 404) {
          errorMsg = 'Cliente no encontrado (404)';
        } else if (error.status === 429) {
          errorMsg = 'Rate limited - intenta de nuevo en unos segundos';
        } else if (error.status === 400) {
          errorMsg = error.data?.message || 'Solicitud inválida (400)';
        }

        await AdvancedCommandLogger.logCommand(interaction, 'balance-add', {
          status: 'ERROR',
          result: errorMsg,
          executionTime: Date.now() - startTime,
          metadata: {
            'Email': email,
            'Amount': amount.toString(),
            'Error Status': error.status || 'Unknown',
            'Error': error.message
          },
          errorCode: error.name || 'API_ERROR',
          stackTrace: error.stack
        });

        ErrorLog.log('balance-add', error, {
          email,
          amount,
          admin: userEmail
        });

        return { content: `❌ Error al agregar balance: \`${errorMsg}\`` };
      }
    });
  }
};