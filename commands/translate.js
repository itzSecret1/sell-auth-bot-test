import { SlashCommandBuilder } from 'discord.js';
import translate from '@vitalets/google-translate-api';

const SUPPORTED_LANGUAGES = {
  es: { name: 'Spanish', emoji: '🇪🇸' },
  fr: { name: 'French', emoji: '🇫🇷' },
  ru: { name: 'Russian', emoji: '🇷🇺' },
  de: { name: 'German', emoji: '🇩🇪' },
  it: { name: 'Italian', emoji: '🇮🇹' },
  pt: { name: 'Portuguese', emoji: '🇵🇹' },
  ja: { name: 'Japanese', emoji: '🇯🇵' },
  zh: { name: 'Chinese', emoji: '🇨🇳' },
  ko: { name: 'Korean', emoji: '🇰🇷' },
  ar: { name: 'Arabic', emoji: '🇸🇦' },
  hi: { name: 'Hindi', emoji: '🇮🇳' },
  pl: { name: 'Polish', emoji: '🇵🇱' },
  nl: { name: 'Dutch', emoji: '🇳🇱' },
  tr: { name: 'Turkish', emoji: '🇹🇷' },
  en: { name: 'English', emoji: '🇬🇧' }
};

export default {
  data: new SlashCommandBuilder()
    .setName('translate')
    .setDescription('Translate text to any supported language')
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('The message to translate')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('language')
        .setDescription('Target language (es, fr, ru, de, it, pt, ja, zh, ko, ar, hi, pl, nl, tr, en)')
        .setRequired(true)
        .addChoices(
          { name: '🇪🇸 Spanish', value: 'es' },
          { name: '🇫🇷 French', value: 'fr' },
          { name: '🇷🇺 Russian', value: 'ru' },
          { name: '🇩🇪 German', value: 'de' },
          { name: '🇮🇹 Italian', value: 'it' },
          { name: '🇵🇹 Portuguese', value: 'pt' },
          { name: '🇯🇵 Japanese', value: 'ja' },
          { name: '🇨🇳 Chinese (Simplified)', value: 'zh' },
          { name: '🇰🇷 Korean', value: 'ko' },
          { name: '🇸🇦 Arabic', value: 'ar' },
          { name: '🇮🇳 Hindi', value: 'hi' },
          { name: '🇵🇱 Polish', value: 'pl' },
          { name: '🇳🇱 Dutch', value: 'nl' },
          { name: '🇹🇷 Turkish', value: 'tr' },
          { name: '🇬🇧 English', value: 'en' }
        )
    ),

  async execute(interaction, api) {
    await interaction.deferReply();

    const message = interaction.options.getString('message');
    const targetLang = interaction.options.getString('language');

    try {
      const result = await translate(message, { to: targetLang });
      const translatedText = result.text;
      const langInfo = SUPPORTED_LANGUAGES[targetLang];

      const embed = {
        color: 0x5865f2,
        title: `${langInfo.emoji} Translation to ${langInfo.name}`,
        fields: [
          {
            name: '📝 Original Message',
            value: message.length > 1024 ? message.substring(0, 1021) + '...' : message,
            inline: false
          },
          {
            name: `${langInfo.emoji} Translated Message`,
            value:
              translatedText.length > 1024 ? translatedText.substring(0, 1021) + '...' : translatedText,
            inline: false
          }
        ],
        footer: {
          text: `Translated by ${interaction.user.username}`,
          icon_url: interaction.user.displayAvatarURL()
        },
        timestamp: new Date().toISOString()
      };

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[TRANSLATE] Error:', error.message);
      await interaction.editReply({
        content: `❌ Translation error: ${error.message}`,
        ephemeral: true
      });
    }
  }
};
