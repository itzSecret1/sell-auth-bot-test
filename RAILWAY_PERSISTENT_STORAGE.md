# 🔧 Solución: Configuración Persistente en Railway

## ⚠️ Problema

En Railway, los archivos locales (como `guildConfigs.json`) se **pierden en cada deploy** porque el contenedor se reconstruye. Esto hace que el bot pida hacer setup de nuevo cada vez que se actualiza.

## ✅ Solución: Usar Railway Volumes (Persistente)

Para que la configuración persista entre deploys, necesitas configurar un **Volume** en Railway:

### Paso 1: Crear un Volume en Railway

1. Ve a tu proyecto en Railway
2. Haz clic en tu servicio (service)
3. Ve a la pestaña **"Volumes"**
4. Haz clic en **"New Volume"**
5. Configura:
   - **Name**: `bot-data` (o el nombre que prefieras)
   - **Mount Path**: `/app/data` (o `/data`)
   - Haz clic en **"Add"**

### Paso 2: Modificar el código para usar el volumen

El código ya está preparado para usar `./guildConfigs.json`, pero necesitas asegurarte de que se guarde en el volumen.

**Opción A: Usar variable de entorno para la ruta**

Agrega esta variable de entorno en Railway:
```
DATA_DIR=/app/data
```

Y modifica `GuildConfig.js` para usar esta ruta si existe.

**Opción B: Usar ruta absoluta en el volumen**

Modifica `GUILD_CONFIG_FILE` en `utils/GuildConfig.js`:
```javascript
const GUILD_CONFIG_FILE = process.env.DATA_DIR 
  ? `${process.env.DATA_DIR}/guildConfigs.json`
  : './guildConfigs.json';
```

### Paso 3: Verificar que funciona

1. Haz un deploy
2. Ejecuta `/setup start` y configura el bot
3. Haz otro deploy (push a GitHub)
4. Verifica que la configuración se mantiene

---

## 🔄 Solución Alternativa: Backup Automático

Si no puedes usar Volumes, puedes configurar un backup automático que guarde la configuración en un canal de Discord o en una variable de entorno.

---

## 📝 Nota Importante

**El código ya tiene mejoras implementadas:**
- ✅ Guardado robusto con múltiples intentos
- ✅ Verificación después de guardar
- ✅ Recarga automática antes de guardar
- ✅ Logging mejorado para diagnosticar problemas

**Pero aún necesitas un Volume en Railway para que persista entre deploys.**

---

## 🐛 Si sigue sin funcionar

1. Verifica que el Volume esté montado correctamente
2. Revisa los logs para ver si hay errores al guardar
3. Verifica los permisos del volumen
4. Asegúrate de que la ruta del archivo sea correcta

---

## 💡 Recomendación

**La mejor solución es usar Railway Volumes** para datos persistentes. Es la forma estándar de manejar archivos que deben persistir entre deploys en Railway.

