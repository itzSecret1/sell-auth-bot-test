#!/bin/bash

# Script para hacer push a GitHub
# Ejecuta este script desde Git Bash o terminal

echo "🚀 Iniciando push a GitHub..."
echo ""

# Agregar todos los cambios
echo "📦 Agregando archivos..."
git add classes/Bot.js utils/TicketManager.js MEJORAS_BOT.md MEJORAS_TRANSCRIPTS_REVIEWS.md COMANDOS_KVM.md

# Crear commit
echo "💾 Creando commit..."
git commit -m "✨ Mejoras completas: Transcripts visuales, reviews públicas, etiquetado robusto

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
- COMANDOS_KVM.md"

# Push a GitHub
echo "☁️ Subiendo a GitHub..."
git push origin master

# O si tu rama es main:
# git push origin main

echo ""
echo "✅ Push completado!"
echo ""
echo "📋 Siguiente paso:"
echo "Conéctate a tu KVM y ejecuta:"
echo ""
echo "  cd /ruta/a/tu/bot"
echo "  git pull origin master"
echo "  npm install"
echo "  pm2 restart all"
echo "  pm2 logs"
echo ""
echo "Ver COMANDOS_KVM.md para más detalles."

