# 🚀 Variables de Entorno para KMV

Esta es la lista **COMPLETA** de todas las variables de entorno que necesitas configurar en KMV para que el bot funcione al 100%.

---

## 🔴 Variables OBLIGATORIAS (Debes agregarlas)

Estas variables son **NECESARIAS** para que el bot funcione:

```env
BOT_TOKEN=tu_token_del_bot_de_discord
SA_API_KEY=tu_api_key_de_sellauth
SA_SHOP_ID=tu_shop_id_de_sellauth
```

**Sin estas 3 variables, el bot NO funcionará.**

---

## 🟠 Variables OBLIGATORIAS para OAuth2 (Si usas verificación)

Si quieres usar el sistema de verificación OAuth2 (como Restorecord), necesitas estas variables:

```env
BOT_CLIENT_ID=tu_client_id_del_bot
BOT_CLIENT_SECRET=tu_client_secret_del_bot
OAUTH_REDIRECT_URI=https://tu-dominio-kmv.com/oauth/callback
```

**Nota**: 
- `BOT_CLIENT_ID` y `BOT_CLIENT_SECRET` se obtienen del [Discord Developer Portal](https://discord.com/developers/applications)
- `OAUTH_REDIRECT_URI` debe ser la URL pública de tu bot en KMV
- Si no usas verificación OAuth2, estas variables son opcionales

---

## 🟡 Variables OPCIONALES (Configuración Global)

Estas variables se aplican a **todos los servidores** donde el bot está presente. Si no las configuras, puedes usar el comando `/setup start` en cada servidor para configurarlas individualmente.

### Roles (Opcional)
```env
BOT_ADMIN_ROLE_ID=id_del_rol_de_admin
BOT_STAFF_ROLE_ID=id_del_rol_de_staff
BOT_CUSTOMER_ROLE_ID=id_del_rol_de_cliente
BOT_TRIAL_ADMIN_ROLE_ID=id_del_rol_de_trial_admin
```

### Canales (Opcional)
```env
BOT_SPAM_CHANNEL_ID=id_del_canal_para_notificaciones_de_spam_y_bans
LOG_CHANNEL_ID=id_del_canal_para_logs_generales
```

### Otros (Opcional)
```env
BOT_GUILD_ID=id_del_servidor_principal
BOT_USER_ID_WHITELIST=id1,id2,id3
SHOP_URL=https://tu-tienda.com
```

---

## 🔧 Variables TÉCNICAS (Opcionales)

Estas variables KMV las configura automáticamente, pero puedes configurarlas manualmente si lo necesitas:

```env
PORT=3000
OAUTH_PORT=3000
DATA_DIR=/data
```

**Nota**: KMV configura `PORT` automáticamente. Solo configura `OAUTH_PORT` si necesitas un puerto específico para OAuth2.

---

## 📋 Tabla Completa de Variables

| Variable | Tipo | Obligatoria | Descripción | Ejemplo |
|----------|------|-------------|-------------|---------|
| `BOT_TOKEN` | 🔴 | **SÍ** | Token del bot de Discord | `MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.abcdef...` |
| `SA_API_KEY` | 🔴 | **SÍ** | API Key de SellAuth | `sk_live_abcdefghijklmnop...` |
| `SA_SHOP_ID` | 🔴 | **SÍ** | Shop ID de SellAuth | `1234567890` |
| `BOT_CLIENT_ID` | 🟠 | **Sí (OAuth2)** | Client ID del bot (OAuth2) | `123456789012345678` |
| `BOT_CLIENT_SECRET` | 🟠 | **Sí (OAuth2)** | Client Secret del bot (OAuth2) | `abcdefghijklmnopqrstuvwxyz` |
| `OAUTH_REDIRECT_URI` | 🟠 | **Sí (OAuth2)** | URL de callback OAuth2 | `https://tu-app.kmv.com/oauth/callback` |
| `BOT_ADMIN_ROLE_ID` | 🟡 | No | Rol de administrador | `987654321098765432` |
| `BOT_STAFF_ROLE_ID` | 🟡 | No | Rol de trial staff | `876543210987654321` |
| `BOT_CUSTOMER_ROLE_ID` | 🟡 | No | Rol de cliente | `765432109876543210` |
| `BOT_TRIAL_ADMIN_ROLE_ID` | 🟡 | No | Rol de trial admin | `654321098765432109` |
| `BOT_SPAM_CHANNEL_ID` | 🟡 | No | Canal para spam/bans | `1445838663786172619` |
| `LOG_CHANNEL_ID` | 🟡 | No | Canal para logs | `1443335841895288974` |
| `BOT_GUILD_ID` | 🟡 | No | ID del servidor principal | `123456789012345678` |
| `BOT_USER_ID_WHITELIST` | 🟡 | No | IDs de usuarios (separados por comas) | `1190738779015757914,1407024330633642005` |
| `SHOP_URL` | 🟡 | No | URL de tu tienda | `https://sellauth.com` |
| `PORT` | 🔧 | No | Puerto del servidor (KMV lo configura automáticamente) | `3000` |
| `OAUTH_PORT` | 🔧 | No | Puerto para OAuth2 (default: 3000) | `3000` |
| `DATA_DIR` | 🔧 | No | Directorio para datos (default: /data) | `/data` |

---

## 🎯 Configuración Mínima Recomendada

**Para empezar, solo necesitas estas 3 variables:**

```env
BOT_TOKEN=tu_token_aqui
SA_API_KEY=tu_api_key_aqui
SA_SHOP_ID=tu_shop_id_aqui
```

**Luego puedes configurar el resto usando `/setup start` en Discord.**

---

## 🔐 Configuración Completa con OAuth2

Si quieres usar el sistema de verificación OAuth2 (recomendado), agrega estas variables adicionales:

```env
BOT_TOKEN=tu_token_aqui
SA_API_KEY=tu_api_key_aqui
SA_SHOP_ID=tu_shop_id_aqui
BOT_CLIENT_ID=tu_client_id_aqui
BOT_CLIENT_SECRET=tu_client_secret_aqui
OAUTH_REDIRECT_URI=https://tu-app.kmv.com/oauth/callback
```

**Nota**: 
- Obtén `BOT_CLIENT_ID` y `BOT_CLIENT_SECRET` del [Discord Developer Portal](https://discord.com/developers/applications)
- `OAUTH_REDIRECT_URI` debe ser la URL pública de KMV (KMV te la da automáticamente)
- Debes agregar esta URL en el Discord Developer Portal → OAuth2 → Redirects

---

## 📝 Cómo Obtener las Variables

### 1. BOT_TOKEN
1. Ve a [Discord Developer Portal](https://discord.com/developers/applications)
2. Selecciona tu aplicación
3. Ve a **Bot** → **Token**
4. Haz clic en **Reset Token** o copia el token existente

### 2. SA_API_KEY y SA_SHOP_ID
1. Inicia sesión en tu cuenta de SellAuth
2. Ve a **Settings** → **API**
3. Copia tu **API Key** y **Shop ID**

### 3. BOT_CLIENT_ID y BOT_CLIENT_SECRET (Para OAuth2)
1. Ve a [Discord Developer Portal](https://discord.com/developers/applications)
2. Selecciona tu aplicación
3. Ve a **OAuth2** → **General**
4. Copia el **Client ID**
5. Haz clic en **Reset Secret** y copia el **Client Secret**

### 4. OAUTH_REDIRECT_URI (Para OAuth2)

**Opción A: Si KMV te da un dominio:**
1. KMV te dará una URL automáticamente (ej: `https://tu-app.kmv.com`)
2. Agrega `/oauth/callback` al final: `https://tu-app.kmv.com/oauth/callback`
3. Agrega esta URL en Discord Developer Portal → OAuth2 → Redirects

**Opción B: Usando ngrok (recomendado si no tienes dominio):**
1. Instala ngrok en tu servidor KMV (ver `NGROK_SETUP.md` para instrucciones detalladas)
2. Ejecuta `ngrok http 3000` en tu servidor KMV
3. Copia la URL que ngrok te da (ej: `https://abc123.ngrok-free.app`)
4. Agrega `/oauth/callback` al final: `https://abc123.ngrok-free.app/oauth/callback`
5. Agrega esta URL en Discord Developer Portal → OAuth2 → Redirects
6. Configura `OAUTH_REDIRECT_URI` en KMV con la misma URL

**Nota:** Con ngrok gratuito, la URL cambia cada vez que reinicias. Considera usar un plan de pago para una URL fija.

---

## ✅ Verificación

Después de agregar las variables:

1. KMV reiniciará automáticamente el bot
2. Ve a **Logs** o **View Logs** en KMV
3. Busca estos mensajes:
   ```
   ✅ All environment variables loaded successfully
   [OAUTH2] ✅ OAuth2 callback server running on port 3000
   Snake Support ready!
   ```
4. Si ves estos mensajes, el bot está funcionando correctamente ✅

---

## ⚠️ Notas Importantes

1. **Seguridad**: 
   - ⚠️ **NUNCA** compartas tus tokens o API keys
   - ⚠️ No subas archivos `.env` a GitHub
   - ⚠️ KMV encripta las variables automáticamente

2. **Variables Globales vs `/setup`**: 
   - Las variables de entorno son globales (aplican a todos los servidores)
   - El comando `/setup start` permite configuraciones específicas por servidor
   - Si usas `/setup`, esa configuración tiene prioridad sobre las variables de entorno

3. **Multi-servidor**: 
   - El bot puede estar en múltiples servidores
   - Cada servidor puede tener su propia configuración usando `/setup start`
   - Las variables de entorno son solo un fallback global

4. **OAuth2 Redirect URI**:
   - Debe ser HTTPS en producción
   - Debe coincidir exactamente con la URL configurada en Discord Developer Portal
   - KMV te da una URL automáticamente cuando despliegas

---

## 🔍 Cómo Agregar Variables en KMV

1. Ve a tu proyecto en KMV
2. Haz clic en tu servicio/aplicación
3. Ve a la sección **"Variables de Entorno"** o **"Environment Variables"**
4. Haz clic en **"Agregar Variable"** o **"Add Variable"**
5. Ingresa el nombre de la variable (ej: `BOT_TOKEN`)
6. Ingresa el valor de la variable
7. Haz clic en **"Guardar"** o **"Save"**
8. Repite para cada variable

---

## 🚨 Solución de Problemas

### El bot no inicia
- Verifica que tienes las 3 variables obligatorias: `BOT_TOKEN`, `SA_API_KEY`, `SA_SHOP_ID`
- Revisa los logs en KMV para ver errores específicos

### OAuth2 no funciona
- Verifica que tienes `BOT_CLIENT_ID`, `BOT_CLIENT_SECRET`, y `OAUTH_REDIRECT_URI`
- Asegúrate de que `OAUTH_REDIRECT_URI` está agregado en Discord Developer Portal → OAuth2 → Redirects
- Verifica que la URL es HTTPS (KMV usa HTTPS automáticamente)

### El bot no responde a comandos
- Verifica que el bot tiene los permisos necesarios en el servidor
- Usa `/setup start` para configurar roles y canales
- Revisa los logs para ver si hay errores de permisos

