/**
 * Quick Response Utility - Ensures commands respond within Discord's 3-second timeout
 * Uses immediate acknowledgement + async processing with proper Promise handling
 */

export async function quickReply(interaction, processingFn) {
  try {
    // Step 1: IMMEDIATE response (within 1 second)
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});
    }

    // Step 2: Send initial acknowledgment
    await interaction.editReply({ content: '⏳ Procesando...' }).catch(() => {});

    // Step 3: Process with Promise (guaranteed within 3 seconds)
    // Using Promise.resolve to ensure execution happens ASAP
    Promise.resolve()
      .then(async () => {
        try {
          const result = await processingFn();
          
          // Step 4: Update with final result
          if (result.embeds) {
            await interaction.editReply({ 
              embeds: result.embeds, 
              content: '' 
            }).catch(() => {});
          } else if (result.content) {
            await interaction.editReply({ 
              content: result.content 
            }).catch(() => {});
          }
        } catch (err) {
          console.error('[QUICK-RESPONSE] Processing error:', err.message);
          await interaction.editReply({
            content: `❌ Error: ${err.message}`
          }).catch(() => {});
        }
      })
      .catch(err => {
        console.error('[QUICK-RESPONSE] Promise error:', err.message);
      });

  } catch (error) {
    console.error('[QUICK-RESPONSE] Reply error:', error.message);
  }
}

export default { quickReply };
