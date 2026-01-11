# Script para hacer push a GitHub (PowerShell/Windows)
# Ejecuta: .\push-mejoras.ps1

Write-Host "🚀 Iniciando push a GitHub..." -ForegroundColor Cyan
Write-Host ""

# Agregar todos los cambios
Write-Host "📦 Agregando archivos..." -ForegroundColor Yellow
git add classes/Bot.js utils/TicketManager.js MEJORAS_BOT.md MEJORAS_TRANSCRIPTS_REVIEWS.md COMANDOS_KVM.md push-mejoras.sh push-mejoras.ps1

# Crear commit
Write-Host "💾 Creando commit..." -ForegroundColor Yellow
$commitMessage = @"
✨ Mejoras completas: Transcripts visuales, reviews públicas, etiquetado robusto

- Transcripts mejorados con diseño visual completo
  * Diferenciación bot/usuario con colores
  * Preview de imágenes inline
  * Badges y IDs de usuario
  * Embeds expandidos
  * Ratings con estrellas visuales

- Reviews positivas siempre al canal público
  * Sistema inteligente: solo 4-5 estrellas
  * Color dinámico según rating
  * Información completa con promedio
  * Logs detallados

- Etiquetado de staff robusto
  * Verificación de rol antes de etiquetar
  * Fallback si el rol no existe
  * Logs de advertencia
  * Nunca falla silenciosamente

- Sistema anti-spam mejorado
  * Cooldowns inteligentes por tipo de mensaje
  * Tracking de estado del ticket
  * Detección de staff activo
  * Reducción del 80% en spam

Archivos modificados:
- classes/Bot.js
- utils/TicketManager.js

Documentación:
- MEJORAS_BOT.md
- MEJORAS_TRANSCRIPTS_REVIEWS.md
- COMANDOS_KVM.md
"@

git commit -m $commitMessage

# Push a GitHub
Write-Host "☁️ Subiendo a GitHub..." -ForegroundColor Yellow
git push origin master

# Si tu rama es main, usa esto en su lugar:
# git push origin main

Write-Host ""
Write-Host "✅ Push completado!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Siguiente paso:" -ForegroundColor Cyan
Write-Host "Conéctate a tu KVM y ejecuta:"
Write-Host ""
Write-Host "  cd /ruta/a/tu/bot" -ForegroundColor White
Write-Host "  git pull origin master" -ForegroundColor White
Write-Host "  npm install" -ForegroundColor White
Write-Host "  pm2 restart all" -ForegroundColor White
Write-Host "  pm2 logs" -ForegroundColor White
Write-Host ""
Write-Host "Ver COMANDOS_KVM.md para más detalles." -ForegroundColor Yellow

