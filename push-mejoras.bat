@echo off
echo ========================================
echo   PUSH MEJORAS A GITHUB
echo ========================================
echo.

cd /d "C:\Users\falso\Downloads\proyects 2025\sellauth bot\sell-auth-bot-test-1"

echo Directorio actual:
cd
echo.

echo Agregando archivos modificados...
git add classes/Bot.js utils/TicketManager.js
git add MEJORAS_BOT.md MEJORAS_TRANSCRIPTS_REVIEWS.md
git add COMANDOS_KVM.md COMANDOS_RAPIDOS.md
git add push-mejoras.ps1 push-mejoras.sh push-mejoras.bat

echo.
echo Creando commit...
git commit -m "Mejoras completas: Transcripts visuales, reviews publicas, etiquetado robusto - Transcripts mejorados con diseno visual completo - Reviews positivas siempre al canal publico - Etiquetado de staff robusto con verificacion - Sistema anti-spam mejorado"

echo.
echo Haciendo push a GitHub...
git push origin master

echo.
echo ========================================
echo   PUSH COMPLETADO!
echo ========================================
echo.
echo Siguiente paso: Conectate a tu KVM y ejecuta:
echo   cd /ruta/a/tu/bot
echo   git pull origin master
echo   npm install
echo   pm2 restart all
echo   pm2 logs
echo.
pause

