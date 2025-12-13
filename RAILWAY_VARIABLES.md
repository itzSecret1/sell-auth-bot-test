# 🚂 Variables de Entorno para Railway

Esta es la lista completa de todas las variables de entorno que puedes configurar en Railway.

---

## 🔴 Variables OBLIGATORIAS

Estas variables son **necesarias** para que el bot funcione:

```env
BOT_TOKEN=tu_token_del_bot_de_discord
SA_API_KEY=tu_api_key_de_sellauth
SA_SHOP_ID=tu_shop_id_de_sellauth
```

**Sin estas 3 variables, el bot NO funcionará.**

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
```

---

## 📋 Lista Completa de Variables

| Variable | Tipo | Descripción | Ejemplo |
|----------|------|-------------|---------|
| `BOT_TOKEN` | 🔴 Obligatoria | Token del bot de Discord | `MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.abcdef...` |
| `SA_API_KEY` | 🔴 Obligatoria | API Key de SellAuth | `sk_live_abcdefghijklmnop...` |
| `SA_SHOP_ID` | 🔴 Obligatoria | Shop ID de SellAuth | `1234567890` |
| `BOT_ADMIN_ROLE_ID` | 🟡 Opcional | Rol de administrador (acceso completo) | `987654321098765432` |
| `BOT_STAFF_ROLE_ID` | 🟡 Opcional | Rol de trial staff (acceso limitado) | `876543210987654321` |
| `BOT_CUSTOMER_ROLE_ID` | 🟡 Opcional | Rol de cliente (asignación automática) | `765432109876543210` |
| `BOT_TRIAL_ADMIN_ROLE_ID` | 🟡 Opcional | Rol de trial admin (solo sync-variants) | `654321098765432109` |
| `BOT_SPAM_CHANNEL_ID` | 🟡 Opcional | Canal para notificaciones de spam/bans | `1445838663786172619` |
| `LOG_CHANNEL_ID` | 🟡 Opcional | Canal para logs generales | `1443335841895288974` |
| `BOT_GUILD_ID` | 🟡 Opcional | ID del servidor principal (si no se define, comandos globales) | `123456789012345678` |
| `BOT_USER_ID_WHITELIST` | 🟡 Opcional | IDs de usuarios separados por comas | `1190738779015757914,1407024330633642005` |

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

## 📝 Notas Importantes

1. **Variables Globales vs `/setup`**: 
   - Las variables de entorno son globales (aplican a todos los servidores)
   - El comando `/setup start` permite configuraciones específicas por servidor
   - Si usas `/setup`, esa configuración tiene prioridad sobre las variables de entorno

2. **Multi-servidor**: 
   - El bot puede estar en múltiples servidores
   - Cada servidor puede tener su propia configuración usando `/setup start`
   - Las variables de entorno son solo un fallback global

3. **Seguridad**: 
   - ⚠️ **NUNCA** compartas tus tokens o API keys
   - ⚠️ No subas archivos `.env` a GitHub
   - ⚠️ Railway encripta las variables automáticamente

---

## 🔍 Cómo Agregar Variables en Railway

1. Ve a tu proyecto en Railway
2. Haz clic en tu servicio (service)
3. Ve a la pestaña **"Variables"**
4. Haz clic en **"New Variable"**
5. Ingresa el nombre de la variable (ej: `BOT_TOKEN`)
6. Ingresa el valor de la variable
7. Haz clic en **"Add"**
8. Repite para cada variable

---

## ✅ Verificación

Después de agregar las variables:

1. Railway reiniciará automáticamente el bot
2. Revisa los logs en Railway para ver si hay errores
3. Verifica que el bot esté en línea en Discord
4. Prueba ejecutando `/ping` o `/help`

---

## 🆘 Solución de Problemas

### El bot no se conecta
- Verifica que `BOT_TOKEN` esté correcto
- Revisa los logs en Railway

### Error: "Missing API Key"
- Verifica que `SA_API_KEY` y `SA_SHOP_ID` estén configurados
- Asegúrate de que no haya espacios extra en los valores

### El bot no responde a comandos
- Verifica que el bot tenga los permisos necesarios
- Usa `/setup start` para configurar roles y canales

---

## 📚 Más Información

- Ver `RAILWAY_SETUP_GUIDE.md` para guía completa de configuración
- Ver `RAILWAY_ENV_VARIABLES.md` para más detalles sobre cada variable


