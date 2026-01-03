# 🚀 Comandos Rápidos - Push y Actualización

## 📦 PASO 1: Push a GitHub (En tu PC Windows)

### Opción A: PowerShell (Recomendado para Windows)
```powershell
cd "C:\Users\falso\Downloads\proyects 2025\sellauth bot\sell-auth-bot-test-1"
.\push-mejoras.ps1
```

### Opción B: Git Bash
```bash
cd "/c/Users/falso/Downloads/proyects 2025/sellauth bot/sell-auth-bot-test-1"
bash push-mejoras.sh
```

### Opción C: Comandos Manuales (Git Bash o PowerShell)
```bash
# Ir al directorio del proyecto
cd "C:\Users\falso\Downloads\proyects 2025\sellauth bot\sell-auth-bot-test-1"

# Agregar archivos
git add classes/Bot.js utils/TicketManager.js MEJORAS_BOT.md MEJORAS_TRANSCRIPTS_REVIEWS.md COMANDOS_KVM.md

# Commit
git commit -m "✨ Mejoras: Transcripts visuales, reviews públicas, etiquetado robusto"

# Push
git push origin master
```

---

## 🖥️ PASO 2: Actualizar en la KVM

### Conexión SSH:
```bash
ssh tu-usuario@tu-servidor-kvm
```

### Comandos Completos (Copiar y Pegar):
```bash
# 1. Ir al directorio del bot
cd /ruta/a/tu/bot
# Ejemplo: cd /home/usuario/sell-auth-bot

# 2. Pull de GitHub
git pull origin master

# 3. Instalar dependencias (por si acaso)
npm install

# 4. Reiniciar PM2
pm2 restart all

# 5. Ver logs en tiempo real
pm2 logs
```

---

## 📊 Ver Logs del Bot

### Logs en Tiempo Real:
```bash
pm2 logs
```

### Ver Últimas 100 Líneas:
```bash
pm2 logs --lines 100
```

### Ver Solo Errores:
```bash
pm2 logs --err --lines 50
```

### Buscar Mensajes Específicos de las Mejoras:
```bash
# Ver mensajes de transcripts
pm2 logs | grep "Transcript sent"

# Ver mensajes de reviews positivas
pm2 logs | grep "Positive review"

# Ver mensajes anti-spam
pm2 logs | grep "TICKET-STATE"

# Ver advertencias de etiquetado
pm2 logs | grep "Staff role"
```

### Guardar Logs en Archivo:
```bash
pm2 logs --lines 500 > bot-logs.txt
cat bot-logs.txt
```

### Limpiar Logs Antiguos:
```bash
pm2 flush
pm2 logs
```

---

## 🔄 Comandos Útiles de PM2

### Ver Estado:
```bash
pm2 status
pm2 list
```

### Monitor en Tiempo Real:
```bash
pm2 monit
```

### Reiniciar:
```bash
# Reinicio suave
pm2 restart all

# Reinicio de proceso específico
pm2 restart sell-auth-bot

# Reinicio completo (si hay problemas)
pm2 delete all
pm2 start index.js --name "sell-auth-bot"
pm2 save
```

### Ver Información Detallada:
```bash
pm2 info sell-auth-bot
pm2 describe sell-auth-bot
```

---

## ✅ Verificar que las Mejoras Funcionan

### 1. Verificar Logs Inmediatamente:
```bash
pm2 logs --lines 50
```

Busca mensajes como:
- `[TICKET] ✅ Transcript sent for TKT-XXXX`
- `[TICKET-STATE] Evitando duplicar mensaje`
- `[TICKET] ✅ Positive review notification sent`

### 2. Crear un Ticket de Prueba:
1. Crea un ticket en Discord
2. Envía mensajes y fotos
3. Completa el ticket
4. Da 5 estrellas en las reviews
5. Cierra el ticket

### 3. Verificar Resultados:
- **Transcript:** Ve al canal de transcripts → descarga el HTML → ábrelo
  - ✅ Debería verse bonito con colores, IDs, imágenes inline
- **Review Pública:** Ve al canal de vouches
  - ✅ Debería aparecer un mensaje con las estrellas y el promedio
- **Logs:**
  ```bash
  pm2 logs | grep "TKT-"
  ```

---

## 🐛 Si Algo Sale Mal

### El bot no inicia:
```bash
pm2 logs --err
npm install
pm2 restart all
```

### Cambios no se aplican:
```bash
git pull origin master
npm install
pm2 delete all
pm2 start index.js --name "sell-auth-bot"
```

### Port already in use:
```bash
pm2 delete all
pm2 start index.js --name "sell-auth-bot"
```

### Git conflictos:
```bash
git fetch --all
git reset --hard origin/master
npm install
pm2 restart all
```

---

## 📋 Resumen Ultra-Rápido

### En tu PC (PowerShell):
```powershell
cd "C:\Users\falso\Downloads\proyects 2025\sellauth bot\sell-auth-bot-test-1"
git add .
git commit -m "✨ Mejoras del bot"
git push origin master
```

### En la KVM (SSH):
```bash
cd /ruta/a/tu/bot && git pull origin master && npm install && pm2 restart all && pm2 logs
```

---

## 🎯 Lo Que Deberías Ver en los Logs

### Logs Normales (Buenos):
```
[BOT] ✅ Connected to Discord
[TICKET] Ticket TKT-0067 - Prueba recibida
[TICKET-STATE] Evitando duplicar mensaje tipo "proof_with_invoice" (hace 45s)
[TICKET] ✅ Transcript sent for TKT-0067
[TICKET] ✅ Positive review notification sent to vouches channel for TKT-0067
```

### Logs de Advertencia (Informativos):
```
[TICKET] ⚠️ Staff role 1234567890 not found in guild 9876543210
[TICKET-STATE] Ticket TKT-0058 tiene staff - evitando spam
```

### Logs de Error (Requieren Atención):
```
[ERROR] Cannot find module...
[ERROR] Permission denied
[ERROR] ECONNREFUSED
```

---

## 📞 Ayuda Extra

Si necesitas más ayuda, revisa:
- `COMANDOS_KVM.md` - Guía completa de comandos
- `MEJORAS_TRANSCRIPTS_REVIEWS.md` - Documentación de mejoras
- `MEJORAS_BOT.md` - Mejoras anti-spam

O busca en los logs:
```bash
pm2 logs --err --lines 100
```

