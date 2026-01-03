# 🚀 Comandos para KVM - Actualizar Bot

## 📋 PASO 1: Conectarse a la KVM

```bash
ssh usuario@tu-servidor
# O usa tu método preferido para conectarte a la KVM
```

---

## 📥 PASO 2: Ir al Directorio del Proyecto

```bash
cd /ruta/a/tu/bot
# Ejemplo: cd /home/user/sell-auth-bot
```

---

## 🔄 PASO 3: Pull de GitHub

```bash
# Ver el estado actual
git status

# Hacer stash de cambios locales si los hay (guardar temporalmente)
git stash

# Pull de los cambios
git pull origin master
# O si tu rama es "main":
git pull origin main

# Si tuviste conflictos, restaurar tus cambios
git stash pop
```

**Si tienes problemas con el pull:**
```bash
# Forzar pull (CUIDADO: sobrescribe cambios locales)
git fetch --all
git reset --hard origin/master
# O: git reset --hard origin/main
```

---

## 🔄 PASO 4: Instalar Dependencias (si hay nuevas)

```bash
npm install
```

---

## ♻️ PASO 5: Reiniciar PM2

```bash
# Ver procesos actuales
pm2 list

# Reiniciar el bot (opción 1 - reinicio suave)
pm2 restart all

# O reiniciar proceso específico (opción 2)
pm2 restart sell-auth-bot
# Reemplaza "sell-auth-bot" con el nombre de tu proceso

# Reinicio completo (opción 3 - más seguro)
pm2 delete all
pm2 start index.js --name "sell-auth-bot"

# O si tienes ecosystem.config.js:
pm2 start ecosystem.config.js
```

---

## 📊 PASO 6: Ver Logs

```bash
# Ver logs en tiempo real (todos los procesos)
pm2 logs

# Ver logs de un proceso específico
pm2 logs sell-auth-bot

# Ver solo errores
pm2 logs --err

# Ver últimas 200 líneas
pm2 logs --lines 200

# Limpiar logs antiguos
pm2 flush

# Ver logs y seguir (como tail -f)
pm2 logs --raw
```

**Comandos útiles de logs:**
```bash
# Ver información detallada del proceso
pm2 info sell-auth-bot

# Ver monitor en tiempo real
pm2 monit

# Ver logs guardados
pm2 logs --lines 1000 > bot-logs.txt
cat bot-logs.txt
```

---

## 🔍 PASO 7: Verificar que Todo Funciona

```bash
# Verificar estado del bot
pm2 status

# Ver logs en tiempo real
pm2 logs --lines 50

# Verificar que no hay errores
pm2 logs --err --lines 20
```

**Buscar mensajes específicos en logs:**
```bash
# Buscar mensajes de las nuevas mejoras
pm2 logs | grep "TICKET-STATE"
pm2 logs | grep "Positive review"
pm2 logs | grep "Transcript sent"
```

---

## 🎯 Comandos Adicionales Útiles

### Reiniciar si hay problemas:
```bash
# Parar todo
pm2 stop all

# Eliminar procesos
pm2 delete all

# Iniciar de nuevo
pm2 start index.js --name "sell-auth-bot"

# Guardar configuración
pm2 save

# Configurar inicio automático
pm2 startup
```

### Ver uso de recursos:
```bash
# Monitor en tiempo real
pm2 monit

# Ver uso de CPU y RAM
pm2 status
```

### Actualizar PM2:
```bash
npm install pm2@latest -g
pm2 update
```

---

## 📝 Orden Completo (Copiar y Pegar)

```bash
# 1. Ir al directorio
cd /ruta/a/tu/bot

# 2. Hacer backup de cambios locales
git stash

# 3. Pull de GitHub
git pull origin master

# 4. Instalar dependencias
npm install

# 5. Reiniciar PM2
pm2 restart all

# 6. Ver logs
pm2 logs --lines 100

# 7. Verificar estado
pm2 status
```

---

## 🐛 Si Algo Sale Mal

### Error: "Cannot find module"
```bash
npm install
pm2 restart all
```

### Error: "Port already in use"
```bash
pm2 delete all
pm2 start index.js --name "sell-auth-bot"
```

### Error: Git conflictos
```bash
git fetch --all
git reset --hard origin/master
npm install
pm2 restart all
```

### Bot no responde
```bash
# Ver logs de errores
pm2 logs --err --lines 50

# Reinicio completo
pm2 delete all
pm2 start index.js --name "sell-auth-bot"
pm2 save
```

---

## ✅ Verificar las Nuevas Mejoras

### 1. Probar Transcripts:
- Crea un ticket de prueba
- Envía mensajes como usuario
- Adjunta imágenes
- Cierra el ticket
- Verifica en el canal de transcripts → Abre el HTML
- ✅ Deberías ver: mensajes con colores, IDs de usuario, imágenes con preview

### 2. Probar Reviews Positivas:
- Completa un ticket
- Da 5 estrellas en ambos ratings
- Verifica el canal de vouches
- ✅ Deberías ver: Mensaje público con las estrellas y ratings

### 3. Verificar Logs:
```bash
pm2 logs | grep "TICKET"
# Busca mensajes como:
# [TICKET] ✅ Transcript sent for TKT-XXXX
# [TICKET] ✅ Positive review notification sent
# [TICKET-STATE] Evitando duplicar mensaje
```

---

## 📄 Archivos Modificados en Este Update

- `classes/Bot.js` - Anti-spam mejorado, etiquetado con verificación
- `utils/TicketManager.js` - Transcripts mejorados, reviews al canal público
- `MEJORAS_BOT.md` - Documentación de mejoras (anti-spam)
- `MEJORAS_TRANSCRIPTS_REVIEWS.md` - Documentación de mejoras (transcripts/reviews)

---

## 🆘 Ayuda Rápida

```bash
# ¿Bot no inicia?
pm2 logs --err

# ¿Logs muy largos?
pm2 flush && pm2 restart all

# ¿Cambios no se aplican?
git pull origin master && npm install && pm2 restart all

# ¿Quiero ver todo en tiempo real?
pm2 logs --raw
```

---

**Nota:** Reemplaza `sell-auth-bot` con el nombre real de tu proceso PM2 (usa `pm2 list` para ver nombres).

