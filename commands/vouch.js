import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { AdvancedCommandLogger } from '../utils/advancedCommandLogger.js';
import { config } from '../utils/config.js';
import { GuildConfig } from '../utils/GuildConfig.js';

const VOUCHES_FILE = './vouches.json';

// Cargar vouches
function loadVouches() {
  try {
    if (existsSync(VOUCHES_FILE)) {
      const data = readFileSync(VOUCHES_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[VOUCH] Error loading vouches:', error);
  }
  return { vouches: [], nextNumber: 1 };
}

// Guardar vouches
function saveVouches(data) {
  try {
    writeFileSync(VOUCHES_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('[VOUCH] Error saving vouches:', error);
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('vouch')
    .setDescription('Create a new vouch')
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('Message about the vouch (required)')
        .setRequired(true)
        .setMaxLength(500)
    )
    .addIntegerOption((option) =>
      option
        .setName('stars')
        .setDescription('Rating (1-5 stars) (required)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(5)
    )
    .addStringOption((option) =>
      option
        .setName('product')
        .setDescription('Product name (optional)')
        .setRequired(false)
        .setAutocomplete(true)
        .setMaxLength(100)
    )
    .addAttachmentOption((option) =>
      option
        .setName('proof')
        .setDescription('Image/video as proof (optional)')
        .setRequired(false)
    ),

  async autocomplete(interaction) {
    try {
      const focusedOption = interaction.options.getFocused(true);
      
      if (focusedOption.name === 'product') {
        try {
          const { loadVariantsData } = await import('../utils/dataLoader.js');
          const variantsData = loadVariantsData();
          const searchTerm = (focusedOption.value || '').toLowerCase().trim();
          
          // Get all products and filter
          const products = Object.values(variantsData)
            .filter((p) => p && p.productName && p.productId)
            .map((p) => ({
              name: p.productName.slice(0, 100),
              id: String(p.productId)
            }))
            .filter((p) => 
              searchTerm === '' || 
              p.name.toLowerCase().includes(searchTerm)
            )
            .slice(0, 25);

          // Format for Discord
          const response = products.map((p) => ({
            name: p.name,
            value: p.name
          }));

          await interaction.respond(response);
        } catch (err) {
          console.error(`[VOUCH] Product autocomplete error: ${err.message}`);
          await interaction.respond([]);
        }
      }
    } catch (error) {
      console.error(`[VOUCH] Autocomplete error: ${error.message}`);
    }
  },

  onlyWhitelisted: false,

  async execute(interaction, api) {
    try {
      // Verificar si el comando se está usando en el canal correcto
      const guildConfig = GuildConfig.getConfig(interaction.guild.id);
      const vouchesChannelId = guildConfig?.vouchesChannelId;
      
      if (vouchesChannelId) {
        // Si hay un canal configurado, solo permitir usarlo ahí
        if (interaction.channel.id !== vouchesChannelId) {
          const vouchesChannel = interaction.guild.channels.cache.get(vouchesChannelId);
          const channelMention = vouchesChannel ? `<#${vouchesChannelId}>` : `el canal configurado`;
          
          await interaction.reply({
            content: `❌ **Canal incorrecto**\n\nEl comando \`/vouch\` solo puede usarse en ${channelMention}.\n\nPor favor, ve a ese canal para crear tu vouch.`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }
      }
      // Si no hay canal configurado, permitir uso en cualquier canal (comportamiento anterior)

      await interaction.deferReply({ ephemeral: false });

      const message = interaction.options.getString('message');
      const stars = interaction.options.getInteger('stars');
      const product = interaction.options.getString('product') || null;
      const proof = interaction.options.getAttachment('proof');

      // Cargar vouches existentes
      const vouchesData = loadVouches();
      const vouchNumber = vouchesData.nextNumber;
      
      // Incrementar número para el próximo vouch
      vouchesData.nextNumber = vouchNumber + 1;

      // Validar que proof sea una imagen/video si se proporciona
      if (proof) {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'video/mp4'];
        if (!allowedTypes.includes(proof.contentType)) {
          await interaction.editReply({
            content: '❌ Proof must be a png, jpg, jpeg, webp, gif or mp4 file.'
          });
          return;
        }
      }

      // Crear vouch
      const vouch = {
        id: vouchNumber,
        message: message,
        stars: stars,
        product: product,
        proof: proof ? proof.url : null,
        vouchedBy: interaction.user.id,
        vouchedByUsername: interaction.user.username,
        vouchedByTag: interaction.user.tag,
        vouchedAt: new Date().toISOString(),
        guildId: interaction.guild.id,
        channelId: interaction.channel.id
      };

      // Guardar vouch
      vouchesData.vouches.push(vouch);
      saveVouches(vouchesData);
      
      // El backup diario se hará automáticamente (ver Bot.js para el scheduler)

      // Obtener nombre del servidor
      const guildName = interaction.guild.name;
      
      // Crear embed del vouch (formato EXACTO como foto 4 y 5)
      const categoryValue = product || 'Vouch';
      
      const vouchEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('✨ New Vouch Review')
        .addFields(
          {
            name: '👤 User Information',
            value: `Creator: <@${interaction.user.id}> ${interaction.user.username}\nCategory: ${categoryValue}\nMessages: 1`,
            inline: false
          },
          {
            name: '⭐ User Feedback',
            value: '⭐'.repeat(stars) + '☆'.repeat(5 - stars) + `\n${message}`,
            inline: false
          }
        )
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ 
          text: `${guildName} • ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`,
          iconURL: interaction.guild.iconURL({ dynamic: true }) || interaction.client.user.displayAvatarURL({ dynamic: true })
        })
        .setTimestamp();

      // Agregar imagen si existe (como imagen separada, no en el embed)
      if (proof) {
        await interaction.editReply({
          embeds: [vouchEmbed],
          files: [proof]
        });
      } else {
        await interaction.editReply({
          embeds: [vouchEmbed]
        });
      }

      // Log
      await AdvancedCommandLogger.logCommand(interaction, 'vouch', {
        status: 'EXECUTED',
        result: 'Vouch created successfully',
        metadata: {
          'Vouch Number': vouchNumber.toString(),
          'Message': message,
          'Stars': stars.toString(),
          'Product': product || 'N/A',
          'Proof': proof ? 'Yes' : 'No'
        }
      });

      console.log(`[VOUCH] ✅ Vouch #${vouchNumber} created by ${interaction.user.tag}: ${message} (${stars} stars)`);

    } catch (error) {
      console.error('[VOUCH] Error:', error);
      await interaction.editReply({
        content: `❌ Error creating vouch: ${error.message}`
      }).catch(() => {});
    }
  }
};

