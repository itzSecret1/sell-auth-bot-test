/**
 * Centralized Discord interaction helpers
 */

/**
 * Defer reply safely
 */
export async function safeDefer(interaction, ephemeral = true) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral });
    }
  } catch (error) {
    console.error('[DISCORD] Defer error:', error.message);
  }
}

/**
 * Edit reply safely
 */
export async function safeEditReply(interaction, options) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(options);
    } else {
      await interaction.reply({ ...options, ephemeral: true });
    }
  } catch (error) {
    console.error('[DISCORD] Edit reply error:', error.message);
  }
}

/**
 * Send error message
 */
export async function sendError(interaction, message) {
  await safeEditReply(interaction, {
    content: `❌ ${message}`
  });
}

/**
 * Format Discord field value (max 1024 chars)
 */
export function formatFieldValue(text, maxChars = 1024) {
  const str = String(text || '');
  if (str.length <= maxChars) return str;
  return str.substring(0, maxChars - 3) + '...';
}

/**
 * Validate command input
 */
export function validateInput(value, fieldName, minLength = 1) {
  if (!value || String(value).trim().length < minLength) {
    throw new Error(`${fieldName} is required and must be at least ${minLength} character(s)`);
  }
  return value;
}

/**
 * Format list with pagination info
 */
export function formatList(items, maxItems = 20) {
  let text = '';
  for (let i = 0; i < Math.min(items.length, maxItems); i++) {
    text += `${i + 1}. ${String(items[i]).substring(0, 100)}\n`;
  }
  if (items.length > maxItems) {
    text += `\n✅ ... y ${items.length - maxItems} más`;
  }
  return text;
}
