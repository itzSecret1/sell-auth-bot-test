# 🚀 Opciones de Hosting Gratuito para Discord Bot

## 📋 Variables de Entorno Requeridas

### Variables OBLIGATORIAS (mínimas para funcionar):
```
BOT_TOKEN=tu_token_de_discord
BOT_GUILD_ID=1440385098724675818
SA_API_KEY=tu_api_key_de_sellauth
SA_SHOP_ID=112723
```

### Variables OPCIONALES (pero recomendadas):
```
BOT_ADMIN_ROLE_ID=1440390894430982224
BOT_STAFF_ROLE_ID=1440390892900061336
BOT_CUSTOMER_ROLE_ID=1440390895462645771
BOT_TRIAL_ADMIN_ROLE_ID=(opcional, si usas trial admin)
BOT_USER_ID_WHITELIST=(déjalo vacío o lista de IDs separados por comas)
LOG_CHANNEL_ID=(opcional, para logs)
```

---

## 🆓 Alternativas Gratuitas a Railway

### 1. **Render.com** ⭐ RECOMENDADO
**Ventajas:**
- ✅ 100% gratuito para siempre
- ✅ 750 horas/mes gratis (suficiente para 24/7)
- ✅ Auto-deploy desde GitHub
- ✅ SSL automático
- ✅ Logs en tiempo real
- ✅ Fácil de usar

**Desventajas:**
- ⚠️ El servicio se "duerme" después de 15 minutos de inactividad (pero se despierta automáticamente)
- ⚠️ Puede tardar 30-60 segundos en despertar

**Setup:**
1. Ve a [render.com](https://render.com) y crea cuenta
2. Click en "New +" → "Web Service"
3. Conecta tu repositorio de GitHub
4. Configuración:
   - **Name:** `sell-auth-bot`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
5. Agrega las variables de entorno en "Environment"
6. Click "Create Web Service"

**Nota:** Para evitar que se duerma, puedes usar un servicio como [UptimeRobot](https://uptimerobot.com) (gratis) que haga ping cada 5 minutos.

---

### 2. **Fly.io** ⭐ MUY RECOMENDADO
**Ventajas:**
- ✅ 100% gratuito
- ✅ 3 VMs compartidas gratis
- ✅ No se duerme (siempre activo)
- ✅ Muy rápido
- ✅ Auto-deploy desde GitHub
- ✅ Excelente para bots de Discord

**Desventajas:**
- ⚠️ Setup inicial un poco más complejo

**Setup:**
1. Instala Fly CLI: `npm install -g @fly/cli`
2. Ve a [fly.io](https://fly.io) y crea cuenta
3. En tu proyecto, ejecuta: `fly launch`
4. Sigue las instrucciones
5. Agrega variables: `fly secrets set BOT_TOKEN=xxx BOT_GUILD_ID=xxx ...`

---

### 3. **Replit** (Solo si ya lo usas)
**Ventajas:**
- ✅ Gratis
- ✅ Editor integrado
- ✅ Fácil de usar

**Desventajas:**
- ⚠️ Se duerme después de inactividad
- ⚠️ Menos recursos que otras opciones

---

### 4. **Koyeb** ⭐ EXCELENTE OPCIÓN
**Ventajas:**
- ✅ 100% gratuito
- ✅ No se duerme
- ✅ Auto-deploy desde GitHub
- ✅ Muy fácil de usar
- ✅ SSL automático

**Desventajas:**
- ⚠️ Límite de recursos en plan gratuito (pero suficiente para bots)

**Setup:**
1. Ve a [koyeb.com](https://koyeb.com)
2. Click "Create App"
3. Conecta GitHub
4. Selecciona tu repositorio
5. Build: `npm install`
6. Run: `npm start`
7. Agrega variables de entorno

---

### 5. **Cyclic.sh**
**Ventajas:**
- ✅ Gratis
- ✅ Auto-deploy desde GitHub
- ✅ Fácil setup

**Desventajas:**
- ⚠️ Puede tener límites de tiempo de ejecución

---

## 🏆 Comparación Rápida

| Plataforma | Gratis | Se Duerme | Auto-Deploy | Facilidad | Recomendado |
|------------|--------|-----------|-------------|-----------|-------------|
| **Render** | ✅ | ⚠️ (15 min) | ✅ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Fly.io** | ✅ | ❌ | ✅ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Koyeb** | ✅ | ❌ | ✅ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Railway** | ⚠️ (Límite) | ❌ | ✅ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Replit** | ✅ | ⚠️ | ⚠️ | ⭐⭐⭐⭐ | ⭐⭐ |

---

## 🎯 Mi Recomendación

### Para tu bot, recomiendo **Koyeb** o **Fly.io**:

**Koyeb** - Si quieres algo súper fácil:
- Setup en 5 minutos
- No se duerme nunca
- Auto-deploy perfecto
- Interface muy intuitiva

**Fly.io** - Si quieres máximo rendimiento:
- El más rápido
- No se duerme
- Mejor para producción

**Render** - Si quieres algo intermedio:
- Muy fácil de usar
- Se duerme pero se despierta rápido
- Excelente documentación

---

## 📝 Variables Completas para Railway (si decides quedarte)

Si decides seguir con Railway, aquí están TODAS las variables que necesitas:

```
BOT_TOKEN=tu_token_de_discord_aqui
BOT_GUILD_ID=1440385098724675818
BOT_ADMIN_ROLE_ID=1440390894430982224
BOT_STAFF_ROLE_ID=1440390892900061336
BOT_CUSTOMER_ROLE_ID=1440390895462645771
BOT_TRIAL_ADMIN_ROLE_ID=(opcional)
BOT_USER_ID_WHITELIST=(déjalo vacío)
SA_API_KEY=tu_api_key_de_sellauth
SA_SHOP_ID=112723
LOG_CHANNEL_ID=(opcional)
```

**⚠️ IMPORTANTE en Railway:**
- NO pongas comillas alrededor de los valores
- NO pongas espacios antes o después
- `BOT_USER_ID_WHITELIST` debe estar completamente vacío (o IDs separados por comas sin espacios)

---

## 🚀 Migración desde Railway

Si quieres migrar a otra plataforma:

1. **Exporta tus variables de entorno** desde Railway
2. **Crea cuenta** en la nueva plataforma
3. **Conecta tu GitHub** (mismo repositorio)
4. **Copia todas las variables** de entorno
5. **Deploy** y listo

El código es el mismo, solo cambia dónde se ejecuta.

---

## 💡 Tips para Hosting Gratuito

1. **Usa UptimeRobot** (gratis) para mantener tu bot despierto si usas Render
2. **Monitorea los logs** regularmente
3. **Configura auto-deploy** para actualizaciones automáticas
4. **Backup de variables** - Guarda tus variables en un lugar seguro

---

## ❓ ¿Cuál elegir?

- **Quieres algo fácil y rápido?** → **Koyeb**
- **Quieres máximo rendimiento?** → **Fly.io**
- **Ya estás en Railway y funciona?** → **Quédate en Railway** (pero monitorea el límite gratuito)

